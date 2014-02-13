/// <reference path="../scripts/require.d.ts" />

require.config({
    baseUrl: "./",
    paths: {
        "text": "../scripts/text",
        "Fayde": "/Fayde/Fayde"
    },
    deps: ["text","Fayde"],
    callback: (...modules: any[]) => {
        modules[1].RegisterLibrary("Fayde.Controls", "App/Fayde.Controls/source.js", "App/Fayde.Controls/generic.xml");
        modules[1].Run();
    },
    shim: {
        "Fayde": {
            exports: "Fayde",
            init: () => {
            }
        },
        "App/Fayde.Controls/source.js": {
            exports: "Fayde.Controls"
        }
    }
});