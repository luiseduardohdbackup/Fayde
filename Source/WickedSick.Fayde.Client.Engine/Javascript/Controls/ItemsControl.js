/// <reference path="Control.js"/>
/// <reference path="../Core/Collections/IListenCollectionChanged.js" />
/// CODE
/// <reference path="Panel.js"/>
/// <reference path="ItemsPresenter.js"/>
/// <reference path="../Collections/NotifyCollectionChangedEventArgs.js" />
/// <reference path="VirtualizingPanel.js"/>

//#region ItemsControl
var ItemsControl = Nullstone.Create("ItemsControl", Control, 0, [IListenCollectionChanged]);

ItemsControl.Instance.Init = function () {
    this.Init$Control();
    this.DefaultStyleKey = this.constructor;
    this._ItemContainerGenerator = new ItemContainerGenerator(this);
    this._ItemContainerGenerator.ItemsChanged.Subscribe(this.OnItemContainerGeneratorChanged, this);
};

//#region Properties

ItemsControl.DisplayMemberPathProperty = DependencyProperty.RegisterCore("DisplayMemberPath", function () { return String; }, ItemsControl, null, function (d, args) { d.OnDisplayMemberPathChanged(args); });
ItemsControl.ItemsProperty = DependencyProperty.RegisterCore("Items", function () { return ItemCollection; }, ItemsControl);
ItemsControl.ItemsPanelProperty = DependencyProperty.RegisterCore("ItemsPanel", function () { return ItemsPanelTemplate; }, ItemsControl);
ItemsControl.ItemsSourceProperty = DependencyProperty.RegisterCore("ItemsSource", function () { return Object; }, ItemsControl, null, function (d, args) { d.OnItemsSourceChanged(args); });
ItemsControl.ItemTemplateProperty = DependencyProperty.RegisterCore("ItemTemplate", function () { return DataTemplate; }, ItemsControl, undefined, function (d, args) { d.OnItemTemplateChanged(args); });

Nullstone.AutoProperties(ItemsControl, [
    ItemsControl.DisplayMemberPathProperty,
    ItemsControl.ItemsPanelProperty,
    ItemsControl.ItemTemplateProperty
]);

Nullstone.Property(ItemsControl, "Items", {
    get: function () {
        var items = Nullstone.As(this.$GetValue(ItemsControl.ItemsProperty), ItemCollection);
        if (items == null) {
            items = new ItemCollection();
            this._itemsIsDataBound = false;
            items.ItemsChanged.Subscribe(this.InvokeItemsChanged, this);
            items.Clearing.Subscribe(this.OnItemsClearing, this);
            this.$SetValue(ItemsControl.ItemsProperty, items);
        }
        return items;
    }
});

Nullstone.Property(ItemsControl, "ItemsSource", {
    get: function () { return this.$GetValue(ItemsControl.ItemsSourceProperty); },
    set: function (value) {
        if (!this._itemsIsDataBound && this.Items.GetCount() > 0)
            throw new InvalidOperationException("Items collection must be empty before using ItemsSource");
        this.$SetValue(ItemsControl.ItemsSourceProperty, value);
    }
});

Nullstone.Property(ItemsControl, "ItemContainerGenerator", {
    get: function () { return this._ItemContainerGenerator; }
});

// <DataTemplate><Grid><TextBlock Text="{Binding @DisplayMemberPath}" /></Grid></DataTemplate>
Nullstone.Property(ItemsControl, "$DisplayMemberTemplate", {
    get: function () {
        if (this._DisplayMemberTemplate == null) {
            var json = {
                Type: Grid,
                Children: [
                    {
                        Type: TextBlock,
                        Props: {
                            Text: new BindingMarkup({ Path: this.DisplayMemberPath })
                        }
                    }
                ]
            };
            this._DisplayMemberTemplate = new DataTemplate(json);
        }
        return this._DisplayMemberTemplate;
    }
});

Nullstone.Property(ItemsControl, "$Panel", {
    get: function () {
        return this._Presenter == null ? null : this._Presenter._ElementRoot;
    }
});

//#endregion

//#region Annotations

ItemsControl.Annotations = {
    ContentProperty: "Items"
};

//#endregion

ItemsControl.GetItemsOwner = function (element) {
    var panel = Nullstone.As(element, Panel);
    if (panel == null || !panel.IsItemsHost)
        return null;
    var owner = Nullstone.As(panel.TemplateOwner, ItemsPresenter);
    if (owner != null)
        return Nullstone.As(owner.TemplateOwner, ItemsControl);
    return null;
};
ItemsControl.ItemsControlFromItemContainer = function (container) {
    var e = Nullstone.As(container, FrameworkElement);
    if (e == null)
        return null;

    var itctl = Nullstone.As(e.Parent, ItemsControl);
    if (itctl == null)
        return ItemsControl.GetItemsOwner(e.Parent);
    if (itctl.IsItemItsOwnContainer(e))
        return itctl;
    return null;
};

ItemsControl.Instance._GetDefaultTemplate = function () {
    var presenter = this._Presenter;
    if (presenter == null) {
        presenter = new ItemsPresenter();
        presenter.TemplateOwner = this;
    }
    return presenter;
};
ItemsControl.Instance._SetItemsPresenter = function (presenter) {
    if (this._Presenter != null)
        this._Presenter._ElementRoot.Children.Clear();

    this._Presenter = presenter;
    this.AddItemsToPresenter(-1, 1, this.Items.GetCount());
};
ItemsControl.Instance.OnItemsSourceChanged = function (e) {
    if (!e.OldValue && Nullstone.Is(e.OldValue, INotifyCollectionChanged)) {
        e.OldValue.CollectionChanged.Unsubscribe(this._CollectionChanged, this);
    }

    if (e.NewValue != null) {
        if (Nullstone.Is(e.NewValue, INotifyCollectionChanged)) {
            e.NewValue.CollectionChanged.Subscribe(this._CollectionChanged, this);
        }

        this.Items._ReadOnly = true;
        this._itemsIsDataBound = true;
        this.Items._ClearImpl();

        var count = e.NewValue.length;
        for (var i = 0; i < count; i++) {
            this.Items._AddImpl(e.NewValue[i]);
        }

        this.OnItemsChanged(new NotifyCollectionChangedEventArgs(NotifyCollectionChangedAction.Reset));
    } else {
        this._itemsIsDataBound = false;
        this.Items._ReadOnly = false;
        this.Items._ClearImpl();
    }

    this._InvalidateMeasure();
};
ItemsControl.Instance._CollectionChanged = function (sender, e) {
    switch (e.Action) {
        case NotifyCollectionChangedAction.Add:
            var count = e.NewItems.GetCount();
            for (var i = 0; i < count; i++) {
                this.Items._InsertImpl(e.NewStartingIndex + 1, e.NewItems.GetValueAt(i));
            }
            break;
        case NotifyCollectionChangedAction.Remove:
            var count = e.OldItems.GetCount();
            for (var i = 0; i < count; i++) {
                this.Items._RemoveAtImpl(e.OldStartingIndex);
            }
            break;
        case NotifyCollectionChangedAction.Replace:
            var count = e.NewItems.GetCount();
            for (var i = 0; i < count; i++) {
                this.Items._SetItemImpl(e.NewStartingIndex + 1, e.NewItems.GetValueAt(i));
            }
            break;
        case NotifyCollectionChangedAction.Reset:
            this.Items._ClearImpl();
            var count = this.ItemsSource.GetCount();
            for (var i = 0; i < count; i++) {
                this.Items._AddImpl(this.ItemsSource.GetValueAt(i));
            }
            break;
    }
    this.OnItemsChanged(e);
};
ItemsControl.Instance.OnDisplayMemberPathChanged = function (e) {
    var items = this.Items;
    var count = items.GetCount();
    for (var i = 0; i < count; i++) {
        this.UpdateContentTemplateOnContainer(ItemContainerGenerator.ContainerFromIndex(i), items.GetValueAt(i));
    }
};
ItemsControl.Instance.ClearContainerForItem = function (element, item) { };
ItemsControl.Instance.GetContainerForItem = function () {
    return new ContentPresenter();
};
ItemsControl.Instance.IsItemItsOwnContainer = function (item) {
    return item instanceof FrameworkElement;
};
ItemsControl.Instance.OnItemsChanged = function (e) { };
ItemsControl.Instance.OnItemsClearing = function (object, e) {
    this.SetLogicalParent(null, this.Items.ToArray());
};
ItemsControl.Instance.InvokeItemsChanged = function (object, e) {
    switch (e.Action) {
        case NotifyCollectionChangedAction.Add:
            this.SetLogicalParent(this, e.NewItems);
            break;
        case NotifyCollectionChangedAction.Remove:
            this.SetLogicalParent(null, e.OldItems);
            break;
        case NotifyCollectionChangedAction.Replace:
            this.SetLogicalParent(null, e.OldItems);
            this.SetLogicalParent(this, e.NewItems);
            break;
    }

    this._ItemContainerGenerator.OnOwnerItemsItemsChanged(object, e);
    if (!this._itemsIsDataBound)
        this.OnItemsChanged(e);
};
ItemsControl.Instance.OnItemContainerGeneratorChanged = function (sender, e) {
    if (this._Presenter == null || this._Presenter._ElementRoot instanceof VirtualizingPanel)
        return;

    var panel = this._Presenter._ElementRoot;
    switch (e.Action) {
        case NotifyCollectionChangedAction.Reset:
            var count = panel.Children.GetCount();
            if (count > 0)
                this.RemoveItemsFromPresenter(0, 0, count);
            break;
        case NotifyCollectionChangedAction.Add:
            this.AddItemsToPresenter(e.Position.index, e.Position.offset, e.ItemCount);
            break;
        case NotifyCollectionChangedAction.Remove:
            this.RemoveItemsFromPresenter(e.Position.index, e.Position.offset, e.ItemCount);
            break;
        case NotifyCollectionChangedAction.Replace:
            this.RemoveItemsFromPresenter(e.Position.index, e.Position.offset, e.ItemCount);
            this.AddItemsToPresenter(e.Position.index, e.Position.offset, e.ItemCount);
            break;
    }
};
ItemsControl.Instance.OnItemTemplateChanged = function (e) {
    var items = this.Items;
    var count = items.GetCount();
    for (var i = 0; i < count; i++) {
        this.UpdateContentTemplateOnContainer(this.ItemContainerGenerator.ContainerFromIndex(i), items.GetValueAt(i));
    }
};
ItemsControl.Instance.SetLogicalParent = function (parent, items) {
    if (this.ItemsSource != null)
        return;

    var error = new BError();
    var count = items.length;
    for (var i = 0; i < count; i++) {
        var fe = Nullstone.As(items[i], FrameworkElement);
        if (fe == null)
            continue;
        this._SetLogicalParent(parent, error);
        if (error.IsErrored())
            throw error.CreateException();
    }
};
ItemsControl.Instance.AddItemsToPresenter = function (positionIndex, positionOffset, count) {
    if (this._Presenter == null || this._Presenter._ElementRoot == null || this._Presenter._ElementRoot instanceof VirtualizingPanel)
        return;

    var panel = this._Presenter._ElementRoot;
    var newIndex = this._ItemContainerGenerator.IndexFromGeneratorPosition(positionIndex, positionOffset);
    var p = this._ItemContainerGenerator.StartAt(positionIndex, positionOffset, 0, true);
    var items = this.Items;
    var children = panel.Children;
    for (var i = 0; i < count; i++) {
        var item = items.GetValueAt(newIndex + i);
        var container = this._ItemContainerGenerator.GenerateNext({});
        if (container instanceof ContentControl)
            container._ContentSetsParent = false;

        if (container instanceof FrameworkElement && !(item instanceof FrameworkElement))
            container.DataContext = item;

        children.Insert(newIndex + i, container);
        this._ItemContainerGenerator.PrepareItemContainer(container);
    }
    delete this._ItemContainerGenerator._GenerationState;
};
ItemsControl.Instance.RemoveItemsFromPresenter = function (positionIndex, positionOffset, count) {
    if (this._Presenter == null || this._Presenter._ElementRoot == null || this._Presenter._ElementRoot instanceof VirtualizingPanel)
        return;

    var panel = this._Presenter._ElementRoot;
    while (count > 0) {
        panel.Children.RemoveAt(positionIndex);
        count--;
    }
};
ItemsControl.Instance.PrepareContainerForItem = function (element, item) {
    if (this.DisplayMemberPath != null && this.ItemTemplate != null)
        throw new InvalidOperationException("Cannot set 'DisplayMemberPath' and 'ItemTemplate' simultaenously");

    this.UpdateContentTemplateOnContainer(element, item);
};
ItemsControl.Instance.UpdateContentTemplateOnContainer = function (element, item) {
    if (Nullstone.RefEquals(element, item))
        return;

    var presenter = Nullstone.As(element, ContentPresenter);
    var control = Nullstone.As(element, ContentControl);

    var template;
    if (!(item instanceof UIElement)) {
        template = this.ItemTemplate;
        if (template == null)
            template = this.$DisplayMemberTemplate;
    }

    if (presenter != null) {
        presenter.ContentTemplate = template;
        presenter.Content = item;
    } else if (control != null) {
        control.ContentTemplate = template;
        control.Content = item;
    }
};

Nullstone.FinishCreate(ItemsControl);
//#endregion