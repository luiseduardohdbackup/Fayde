﻿using System;
using Fayde.Core;
using Fayde.Xaml;
using Fayde.Xaml.Metadata;

namespace Fayde.Primitives
{
    [Element("")]
    public class Color : DependencyObject
    {
        protected static readonly PropertyDescription ContentProperty = PropertyDescription.Register("Content", typeof(string), typeof(Color), true);
        protected string Content
        {
            get { return GetValue("Content") as string; }
            set { SetValue("Content", value); }
        }

        protected static readonly PropertyDescription HexStringProperty = PropertyDescription.Register("HexString", typeof(string), typeof(Color));
        protected string HexString
        {
            get { return GetValue("HexString") as string; }
            set { SetValue("HexString", value); }
        }

        public static Color FromHex(string hexString)
        {
            return new Color() { HexString = hexString };
        }

        public static Color FromUInt32(UInt32 uint32)
        {
            return new Color() { Content = string.Format("#{0:x8}", uint32).ToUpper() };
        }

        public override string ToJson(int tabIndents, IJsonOutputModifiers outputMods)
        {
            if (Content != null)
            {
                var converter = new Fayde.TypeConverters.ColorConverter();
                var color = converter.Convert(Content) as Color;
                color.Name = Name;
                color.Key = Key;
                return color.ToJson(tabIndents, outputMods);
            }
            return string.Format("{0}.FromHex(\"{1}\")", GetTypeName(outputMods), HexString);
        }
    }
}