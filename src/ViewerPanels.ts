import * as vscode from 'vscode';
import { DEFAULT_VIEWER_SETTINGS, FromViewerMessage, ToViewerMessage, ViewerSettings } from './viewerProtocol';

export const VIEWER_VIEW_TYPE = 'pythonPlyPreview.viewer';
export const PLY_EDITOR_VIEW_TYPE = 'pythonPlyPreview.plyEditor';

const SETTINGS_KEY = 'viewerSettings';

export interface ViewerMessageEvent {
    /** The expression for debug views, the file path for the .ply editor */
    name: string;
    message: FromViewerMessage;
}

/**
 * Point cloud viewer webviews: one panel per previewed expression, plus a read-only custom editor for .ply files.
 */
export default class ViewerPanels implements vscode.CustomReadonlyEditorProvider {
    private readonly panels = new Map<string, Viewer>();
    private readonly messageEmitter = new vscode.EventEmitter<ViewerMessageEvent>();

    /** Every message from any viewer; used for logging and by the integration tests. */
    public readonly onDidReceiveMessage = this.messageEmitter.event;

    public constructor(private readonly extensionUri: vscode.Uri, private readonly globalState: vscode.Memento) {}

    /**
     * Shows `bytes` (a PLY file) in the panel for `name`, reusing the panel if it is already open.
     */
    public show(name: string, bytes: Uint8Array, totalPoints?: number): void {
        let viewer = this.panels.get(name);
        if (viewer) {
            viewer.panel.reveal(undefined, true);
        } else {
            const panel = vscode.window.createWebviewPanel(
                VIEWER_VIEW_TYPE,
                name,
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                { ...this.webviewOptions(), retainContextWhenHidden: true }
            );
            viewer = this.createViewer(name, panel);
            this.panels.set(name, viewer);
            panel.onDidDispose(() => this.panels.delete(name));
        }
        viewer.post({ type: 'cloud', name, bytes, totalPoints });
    }

    // --- .ply custom editor ---

    public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
        return { uri, dispose: () => undefined };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.options = this.webviewOptions();
        const name = document.uri.fsPath;
        const viewer = this.createViewer(name, panel);
        // Copy into a plain Uint8Array: the array readFile returns doesn't survive postMessage as one
        const bytes = new Uint8Array(await vscode.workspace.fs.readFile(document.uri));
        viewer.post({ type: 'cloud', name, bytes });
    }

    // --- Shared ---

    private webviewOptions(): vscode.WebviewOptions {
        return {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        };
    }

    private createViewer(name: string, panel: vscode.WebviewPanel): Viewer {
        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'images', 'icon.png');
        panel.webview.html = this.getHtml(panel.webview);

        const viewer = new Viewer(panel, () => this.settings);
        panel.webview.onDidReceiveMessage((message: FromViewerMessage) => {
            if (message.type === 'ready') {
                viewer.onReady();
            } else if (message.type === 'settingsChanged') {
                // The last change becomes the default for new viewers
                this.globalState.update(SETTINGS_KEY, message.settings);
            }
            this.messageEmitter.fire({ name, message });
        });
        return viewer;
    }

    private get settings(): ViewerSettings {
        return { ...DEFAULT_VIEWER_SETTINGS, ...this.globalState.get<Partial<ViewerSettings>>(SETTINGS_KEY) };
    }

    private getHtml(webview: vscode.Webview): string {
        const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data: blob:; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${media('viewer.css')}" rel="stylesheet">
    <title>Point Cloud</title>
</head>
<body>
    <div id="viewport"></div>
    <div id="toolbar">
        <label>Point size <input id="point-size" type="range" min="1" max="10" step="0.5"></label>
        <label>Color
            <select id="color-mode">
                <option value="rgb">RGB</option>
                <option value="height">Height</option>
                <option value="solid">Solid</option>
            </select>
        </label>
        <label>Up
            <select id="up-axis">
                <option value="z">Z</option>
                <option value="y">Y</option>
            </select>
        </label>
        <label><input id="show-axes" type="checkbox"> Axes</label>
        <label><input id="show-grid" type="checkbox"> Grid</label>
        <button id="reset-view" title="Fit the point cloud in view">Reset view</button>
    </div>
    <div id="info"></div>
    <div id="message" hidden></div>
    <script nonce="${nonce}" src="${media('viewer.js')}"></script>
</body>
</html>`;
    }
}

/** A viewer webview; messages are queued until its script is ready. */
class Viewer {
    private ready = false;
    private pending: ToViewerMessage[] = [];

    public constructor(public readonly panel: vscode.WebviewPanel, private readonly getSettings: () => ViewerSettings) {}

    public post(message: ToViewerMessage): void {
        if (this.ready) {
            this.panel.webview.postMessage(message);
        } else {
            this.pending.push(message);
        }
    }

    public onReady(): void {
        this.ready = true;
        this.panel.webview.postMessage({ type: 'settings', settings: this.getSettings() } satisfies ToViewerMessage);
        this.pending.forEach(message => this.panel.webview.postMessage(message));
        this.pending = [];
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}
