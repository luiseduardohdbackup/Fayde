﻿/// <reference path="../Runtime/Nullstone.js"/>
/// CODE
/// <reference path="Markup.js"/>
/// <reference path="../Core/Collections/Collection.js"/>
/// <reference path="../Core/DeferredValueExpression.js"/>

//#region JsonParser
var JsonParser = Nullstone.Create("JsonParser");

JsonParser.Instance.Init = function () {
    this.$SRExpressions = [];
    this._ResChain = [];
};

JsonParser.Parse = function (json, templateBindingSource, namescope, resChain) {
    var parser = new JsonParser();
    if (resChain)
        parser._ResChain = resChain;
    parser._TemplateBindingSource = templateBindingSource;
    var shouldSetNS = false;
    if (!namescope) {
        namescope = new NameScope();
        shouldSetNS = true;
    }

    var app = App.Instance;
    var startTime;
    var isTimed;
    if (isTimed = (app._DebugFunc[5] != null))
        startTime = new Date().getTime();

    var obj = parser.CreateObject(json, namescope);
    if (shouldSetNS && obj instanceof DependencyObject)
        NameScope.SetNameScope(obj, namescope);

    if (isTimed)
        app._NotifyDebugParserPass(json.Type, new Date().getTime() - startTime);

    return obj;
};

JsonParser.Instance.CreateObject = function (json, namescope, ignoreResolve) {
    if (json.Type == null) {
        return null;
    }

    if (json.Type === Number || json.Type === String || json.Type === Boolean) {
        return json.Value;
    }

    if (json.Type === ControlTemplate) {
        var targetType = json.Props == null ? null : json.Props.TargetType;
        var template = new json.Type(targetType, json.Content);
        template._ResChain = this._ResChain;
        return template;
    }
    if (json.Type === DataTemplate) {
        var template = new DataTemplate(json.Content);
        template._ResChain = this._ResChain;
        return template;
    }


    var dobj = new json.Type();
    dobj.TemplateOwner = this._TemplateBindingSource;
    if (json.Name)
        dobj.SetNameOnScope(json.Name, namescope);

    var propd;
    var propValue;
    if (json.Props) {
        for (var propName in json.Props) {
            propValue = json.Props[propName];
            if (propValue == undefined)
                continue;

            if (dobj instanceof DependencyObject)
                propd = dobj.GetDependencyProperty(propName);
            this.TrySetPropertyValue(dobj, propd, propValue, namescope, false, dobj.constructor, propName);
        }
    }

    if (json.AttachedProps) {
        if (!(json.AttachedProps instanceof Array))
            throw new Error("json.AttachedProps is not an array");
        for (var i in json.AttachedProps) {
            var attachedDef = json.AttachedProps[i];
            //TODO: Namespace Prefixes?
            propd = DependencyProperty.GetDependencyProperty(attachedDef.Owner, attachedDef.Prop);
            propValue = attachedDef.Value;
            this.TrySetPropertyValue(dobj, propd, propValue, namescope, true, attachedDef.Owner, attachedDef.Prop);
        }
    }

    var contentPropd = this.GetAnnotationMember(json.Type, "ContentProperty");
    if (contentPropd instanceof DependencyProperty) {
        if (json.Children) {
            this.TrySetCollectionProperty(json.Children, dobj, contentPropd, namescope);
        } else if (json.Content) {
            var content = json.Content;
            if (content instanceof Markup)
                content = content.Transmute(dobj, contentPropd, "Content", this._TemplateBindingSource);
            else
                content = this.CreateObject(json.Content, namescope, true);
            this.SetValue(dobj, contentPropd, content);
        }
    } else if (contentPropd != null && contentPropd.constructor === String) {
        var propDesc = Object.getOwnPropertyDescriptor(dobj, contentPropd);
        if (propDesc.set || propDesc.writable) {
            dobj[contentPropd] = this.CreateObject(json.Content, namescope, true);
        } else if (propDesc.get) {
            var coll = dobj[contentPropd];
            for (var j in json.Children) {
                var fobj = this.CreateObject(json.Children[j], namescope, true);
                if (fobj instanceof DependencyObject)
                    fobj._AddParent(coll, true);
                coll.Add(fobj);
            }
        }
    } else if (dobj instanceof Collection) {
        this.TrySetCollectionProperty(json.Children, dobj, null, namescope);
    }

    if (!ignoreResolve) {
        this.ResolveStaticResourceExpressions();
    }
    if (json.Type === ResourceDictionary) {
        delete this._ContextResourceDictionary;
    }
    return dobj;
};

JsonParser.Instance.TrySetPropertyValue = function (dobj, propd, propValue, namescope, isAttached, ownerType, propName) {
    //If the object is not a Nullstone, let's parse it
    if (!propValue.constructor._IsNullstone && propValue.Type) {
        propValue = this.CreateObject(propValue, namescope, true);
    }

    if (propValue instanceof Markup)
        propValue = propValue.Transmute(dobj, propd, propName, this._TemplateBindingSource);

    if (propValue instanceof StaticResourceExpression) {
        this.SetValue(dobj, propd, propValue);
        return;
    }

    //Set property value
    if (propd) {
        //TODO: TrySetCollectionProperty expects json ??
        if (this.TrySetCollectionProperty(propValue, dobj, propd, namescope))
            return;

        if (!(propValue instanceof Expression)) {
            var targetType = propd.GetTargetType();
            if (targetType._IsNullstone && !(propValue instanceof targetType)) {
                var propDesc = Object.getOwnPropertyDescriptor(dobj, propName);
                if (propDesc) {
                    var setFunc = propDesc.set;
                    if (setFunc && setFunc.Converter && setFunc.Converter instanceof Function)
                        propValue = setFunc.Converter(propValue);
                }
            }
        }
        this.SetValue(dobj, propd, propValue);
    } else if (!isAttached) {
        if (dobj.hasOwnProperty(propName)) {
            dobj[propName] = propValue;
        } else {
            var func = dobj["Set" + propName];
            if (func && func instanceof Function)
                func.call(dobj, propValue);
        }
    } else {
        //There is no fallback if we can't find attached property
        Warn("Could not find attached property: " + ownerType._TypeName + "." + propName);
    }
};
JsonParser.Instance.TrySetCollectionProperty = function (subJson, dobj, propd, namescope) {
    var targetType;
    if (propd == null) {
        if (dobj == null)
            return;
        targetType = dobj.constructor;
    } else {
        targetType = propd.GetTargetType();
    }
    if (!Nullstone.DoesInheritFrom(targetType, Collection))
        return false;
    if (!(subJson instanceof Array))
        return false;

    var coll;
    if (propd == null) {
        coll = dobj;
    } else {
        if (propd._IsAutoCreated) {
            coll = dobj.$GetValue(propd);
        } else {
            coll = new targetType();
            if (coll instanceof DependencyObject)
                coll._AddParent(dobj, true);
            dobj.$SetValue(propd, coll);
        }
    }

    var rd = Nullstone.As(coll, ResourceDictionary);
    var oldChain = this._ResChain;
    if (rd) {
        this._ResChain = this._ResChain.slice(0);
        this._ResChain.push(rd);
    }
    for (var i in subJson) {
        var fobj;
        if (rd == null) {
            fobj = this.CreateObject(subJson[i], namescope, true);
            if (fobj instanceof DependencyObject)
                fobj._AddParent(coll, true);
            coll.Add(fobj);
        } else {
            var key = subJson[i].Key;
            if (subJson[i].Type !== Style) {
                fobj = new ResourceTarget(subJson[i], namescope, this._TemplateBindingSource, this._ResChain);
            } else {
                fobj = this.CreateObject(subJson[i], namescope, true);
                if (!key)
                    key = fobj.TargetType;
            }
            if (key)
                rd.Set(key, fobj);
        }
    }
    this._ResChain = oldChain;

    return true;
};
JsonParser.Instance.ResolveStaticResourceExpressions = function () {
    var srs = this.$SRExpressions;
    if (srs == null)
        return;
    if (srs.length > 0) {
        for (var i = 0; i < srs.length; i++) {
            srs[i].Resolve(this);
        }
    }
    this.$SRExpressions = [];
};
JsonParser.Instance.SetValue = function (dobj, propd, value) {
    if (value instanceof StaticResourceExpression) {
        this.$SRExpressions.push(value);
        dobj.$SetValueInternal(propd, new DeferredValueExpression());
    } else if (value instanceof Expression) {
        dobj.$SetValueInternal(propd, value);
    } else {
        dobj._SetValue(propd, value);
    }
};

JsonParser.Instance.GetAnnotationMember = function (type, member) {
    if (type == null || !type._IsNullstone)
        return null;
    if (type.Annotations == null)
        return this.GetAnnotationMember(type._BaseClass, member);
    var annotation = type.Annotations[member];
    if (annotation == null)
        return this.GetAnnotationMember(type._BaseClass, member);
    return annotation;
};

JsonParser.CreateSetter = function (dobj, propName, value) {
    var setter = new Setter();
    var propd = dobj.GetDependencyProperty(propName);
    setter.SetProperty(propd);
    setter.SetValue_Prop(value);
    return setter;
};

Nullstone.FinishCreate(JsonParser);
//#endregion