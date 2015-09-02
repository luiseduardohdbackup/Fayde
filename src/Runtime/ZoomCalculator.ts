module Fayde {
    export function calcZoom(): number {
        if ((<any>document).frames)
            return calcIE();
        return 1;
    }

    function calcIE(): number {
        var screen = (<any>document).frames.screen;
        var zoom = screen.deviceXDPI / screen.systemXDPI;
        return Math.round(zoom * 100) / 100;
    }
}