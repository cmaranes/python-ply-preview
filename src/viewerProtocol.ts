// Messages between ViewerPanels (extension side) and the webview viewer (src/webview/viewer.ts).
// Imported by both sides, so it must not depend on 'vscode' or the DOM.

export type ColorMode = 'rgb' | 'height' | 'solid';
export type UpAxis = 'z' | 'y';

export interface ViewerSettings {
    /** Point size in pixels */
    pointSize: number;
    /** 'rgb' falls back to 'height' for clouds without colors */
    colorMode: ColorMode;
    upAxis: UpAxis;
    showAxes: boolean;
    showGrid: boolean;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
    pointSize: 2,
    colorMode: 'rgb',
    upAxis: 'z',
    showAxes: true,
    showGrid: true,
};

/** Extension -> webview */
export type ToViewerMessage =
    | { type: 'settings'; settings: ViewerSettings }
    /** `bytes` is a PLY file; `totalPoints` is set when the cloud was subsampled before export */
    | { type: 'cloud'; name: string; bytes: Uint8Array; totalPoints?: number };

/** Webview -> extension */
export type FromViewerMessage =
    | { type: 'ready' }
    /** Sent once the cloud is parsed, before rendering, so it doesn't depend on WebGL being available */
    | { type: 'loaded'; name: string; points: number; hasColors: boolean }
    | { type: 'error'; message: string }
    | { type: 'settingsChanged'; settings: ViewerSettings };
