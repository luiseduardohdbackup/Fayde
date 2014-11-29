module Fayde.Markup {
    export class FrameworkTemplate extends DependencyObject {
        private $$markup: nullstone.markup.Markup<any>;

        Validate (): string {
            return "";
        }

        GetVisualTree (bindingSource: DependencyObject): UIElement {
            var uie = LoadImpl<UIElement>(bindingSource, this.$$markup, bindingSource);
            if (!(uie instanceof UIElement))
                throw new XamlParseException("Template root visual is not a UIElement.");
            return uie;
        }
    }

    function setTemplateRoot (ft: FrameworkTemplate, root: any) {
        if (root instanceof Element)
            (<any>ft).$$markup = CreateXaml(root);
    }

    export function LoadXaml<T extends XamlObject>(initiator: DependencyObject, xaml: string): T;
    export function LoadXaml<T extends XamlObject>(initiator: DependencyObject, el: Element): T;
    export function LoadXaml<T extends XamlObject>(initiator: DependencyObject, xaml: any): T {
        var markup = CreateXaml(xaml);
        return Load<T>(initiator, markup);
    }

    export function Load<T extends XamlObject>(initiator: DependencyObject, xm: nullstone.markup.Markup<any>): T {
        return LoadImpl<T>(initiator, xm);
    }

    function LoadImpl<T>(initiator: DependencyObject, xm: nullstone.markup.Markup<any>, bindingSource?: DependencyObject): T {
        var oresolve: nullstone.IOutType = {
            isPrimitive: false,
            type: undefined
        };

        var namescope = new NameScope(true);
        var active = Internal.createActiveObject(namescope, bindingSource);
        var pactor = Internal.createPropertyActor(active, extractType, extractDP);
        var oactor = Internal.createObjectActor(pactor);

        var last: any;
        var parser = xm.createParser()
            .setNamespaces(Fayde.XMLNS, Fayde.XMLNSX)
            .on({
                resolveType: (uri, name) => {
                    if (!TypeManager.resolveType(uri, name, oresolve))
                        throw new XamlParseException("Could not resolve type [" + uri + "][" + name + "].");
                    return oresolve;
                },
                resolveObject: (type) => {
                    //TODO: Ignore <ResourceDictionary> inside <.Resources> tag
                    var obj = new (type)();
                    if (obj instanceof FrameworkTemplate)
                        parser.skipBranch();
                    return obj;
                },
                resolvePrimitive: (type, text) => {
                    return nullstone.convertAnyToType(text, type);
                },
                resolveResources: (owner, ownerType) => {
                    var rd = owner.Resources;
                    return rd;
                },
                branchSkip: (root: any, obj: any) => {
                    if (obj instanceof FrameworkTemplate) {
                        last = obj;
                        var err = obj.Validate();
                        if (err)
                            throw new XamlParseException(err);
                        setTemplateRoot(<FrameworkTemplate>obj, root);
                    }
                },
                object: (obj, isContent) => {
                    active.set(obj);
                    oactor.start();
                },
                objectEnd: (obj, key, isContent, prev) => {
                    last = obj;
                    oactor.end();
                    active.set(prev);
                    if (!active.obj)
                        return;
                    if (isContent) {
                        pactor.startContent();
                        pactor.addObject(obj, key);
                        pactor.end();
                    } else {
                        pactor.addObject(obj, key);
                    }
                },
                contentText: (text) => {
                    pactor.setContentText(text);
                },
                name: (name) => {
                    active.setName(name);
                },
                propertyStart: (ownerType, propName) => {
                    pactor.start(ownerType, propName);
                },
                propertyEnd: (ownerType, propName) => {
                    pactor.end();
                },
                error: (err) => false,
                end: () => {
                }
            });

        function extractType (text: string): any {
            var prefix = <string>null;
            var name = text;
            var ind = name.indexOf(':');
            if (ind > -1) {
                prefix = name.substr(0, ind);
                name = name.substr(ind + 1);
            }

            var uri = parser.resolvePrefix(prefix);
            TypeManager.resolveType(uri, name, oresolve);
            return oresolve.type;
        }

        function extractDP (text: string): any {
            var name = text;
            var ind = name.indexOf('.');
            var ownerType: any;
            if (ind > -1) {
                ownerType = extractType(name.substr(0, ind));
                name = name.substr(ind + 1);
            } else {
                for (var en = parser.walkUpObjects(); en.moveNext();) {
                    var style: Style = en.current;
                    if (style instanceof Style) {
                        ownerType = style.TargetType;
                        if (!ownerType)
                            throw new XamlParseException("Style must have a TargetType.");
                        break;
                    }
                }
            }

            return (ownerType)
                ? DependencyProperty.GetDependencyProperty(ownerType, name)
                : null;
        }

        parser.parse(xm.root);
        if (last instanceof XamlObject) {
            last.XamlNode.NameScope = namescope;
        }
        return last;
    }
}