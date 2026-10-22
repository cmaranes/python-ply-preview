import * as assert from 'assert';
import * as vscode from 'vscode';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { ExtensionApi } from '../extension';
import { VIEWER_VIEW_TYPE } from '../ViewerPanels';
import type { FromViewerMessage } from '../viewerProtocol';

type LoadedMessage = Extract<FromViewerMessage, { type: 'loaded' }>;

const VIEW_COMMAND = 'python-ply-preview.view';
const EXTENSION_ID = 'cmaranes.python-ply-preview';

const workspaceDir = vscode.workspace.workspaceFolders![0].uri.fsPath;
const fixturePath = join(workspaceDir, 'fixture.py');
const previewDir = join(workspaceDir, '.vscode', 'ply_preview');

// --- Helpers ---

function listPlyFiles(): string[] {
    if (!existsSync(previewDir)) {
        return [];
    }
    return readdirSync(previewDir, { recursive: true })
        .map(String)
        .filter(file => file.endsWith('.ply'))
        .map(file => join(previewDir, file));
}

function readVertexCount(path: string): number {
    const header = readFileSync(path).subarray(0, 512).toString('latin1');
    return Number(/element vertex (\d+)/.exec(header)![1]);
}

/** Resolves once the debugger is paused on a stack frame. */
function waitForStop(): Promise<void> {
    return new Promise((resolve, reject) => {
        const done = () => {
            clearTimeout(timer);
            listener.dispose();
        };
        const timer = setTimeout(() => {
            done();
            const item = vscode.debug.activeStackItem;
            const state = item instanceof vscode.DebugStackFrame ? 'frame' : item instanceof vscode.DebugThread ? 'thread' : 'none';
            reject(new Error(`Debugger did not stop at the breakpoint (activeStackItem: ${state}).\n` +
                `Debug adapter log:\n${adapterLog.join('\n')}`));
        }, 60000);
        const listener = vscode.debug.onDidChangeActiveStackItem(item => {
            if (item instanceof vscode.DebugStackFrame) {
                done();
                resolve();
            }
        });
    });
}

async function startDebuggingAndWaitForStop(): Promise<void> {
    // fixture.py calls breakpoint(): an editor breakpoint races with debugpy startup on slow CI runners
    const stopped = waitForStop();
    // The timeout can fire before `await stopped` below; it is still rethrown there
    stopped.catch(() => undefined);
    const started = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], {
        type: 'debugpy',
        name: 'ViewPLY integration test',
        request: 'launch',
        program: fixturePath,
        // Resolved in .vscode-test.mjs
        python: process.env.VIEWPLY_TEST_PYTHON,
        console: 'internalConsole',
        justMyCode: true,
    });
    assert.ok(started, 'Debug session failed to start');
    await stopped;
}

// Debug Adapter Protocol traffic with debugpy, reported when the debugger fails to stop
const adapterLog: string[] = [];
const adapterLogStart = Date.now();

function logAdapter(line: string): void {
    adapterLog.push(`+${Date.now() - adapterLogStart}ms ${line}`);
    if (adapterLog.length > 100) {
        adapterLog.shift();
    }
}

function trackDebugAdapter(): vscode.Disposable {
    return vscode.debug.registerDebugAdapterTrackerFactory('debugpy', {
        createDebugAdapterTracker: () => ({
            onWillReceiveMessage: (message: any) => {
                if (message.type === 'request') {
                    logAdapter(`-> ${message.command}`);
                }
            },
            onDidSendMessage: (message: any) => {
                if (message.type === 'event') {
                    const detail = message.event === 'output' ? `: ${String(message.body?.output).trim().slice(0, 300)}`
                        : message.event === 'stopped' ? ` (${message.body?.reason})` : '';
                    logAdapter(`<- event ${message.event}${detail}`);
                } else if (message.type === 'response' && !message.success) {
                    logAdapter(`<- ${message.command} failed: ${message.message}`);
                }
            },
            onError: error => logAdapter(`adapter error: ${error.message}`),
            onExit: (code, signal) => logAdapter(`adapter exited: code=${code} signal=${signal}`),
        }),
    });
}

/** Returns the range of the first occurrence of `text` in the document. */
function rangeOf(document: vscode.TextDocument, text: string): vscode.Range {
    const offset = document.getText().indexOf(text);
    assert.notStrictEqual(offset, -1, `'${text}' not found in fixture`);
    return new vscode.Range(document.positionAt(offset), document.positionAt(offset + text.length));
}

/** Resolves with the viewer's 'loaded' message for `name`. Subscribe before triggering the view. */
function waitForLoaded(api: ExtensionApi, name: string): Promise<LoadedMessage> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error(`Viewer did not load '${name}'`));
        }, 30000);
        const listener = api.onViewerMessage(({ name: eventName, message }) => {
            if (eventName !== name) {
                return;
            }
            // WebGL may be missing on CI; parsing (and 'loaded') doesn't need it
            if (message.type === 'loaded' || (message.type === 'error' && !message.message.startsWith('WebGL'))) {
                clearTimeout(timer);
                listener.dispose();
                message.type === 'loaded' ? resolve(message) : reject(new Error(message.message));
            }
        });
    });
}

/** Open tabs showing the built-in viewer for `label` */
function viewerTabs(label: string): vscode.Tab[] {
    return vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab =>
        tab.label === label && tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(VIEWER_VIEW_TYPE));
}

async function setConfig(key: string, value: unknown): Promise<void> {
    await vscode.workspace.getConfiguration('pythonPlyPreview').update(key, value, vscode.ConfigurationTarget.Global);
}

async function codeActionTitles(document: vscode.TextDocument, range: vscode.Range): Promise<string[]> {
    const actions = await vscode.commands.executeCommand<(vscode.Command | vscode.CodeAction)[]>(
        'vscode.executeCodeActionProvider', document.uri, range);
    return (actions ?? []).map(action => action.title);
}

// --- Tests ---

suite('View PLY during a debug session', () => {
    let document: vscode.TextDocument;
    let adapterTracker: vscode.Disposable;
    let api: ExtensionApi;

    suiteSetup(async function () {
        // Room for one retry of the debugger start below
        this.timeout(180000);
        adapterTracker = trackDebugAdapter();
        api = await vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID)!.activate();

        // Start clean: manual F5 runs in this folder can leave files from sessions that never terminated
        rmSync(previewDir, { recursive: true, force: true });

        document = await vscode.workspace.openTextDocument(fixturePath);
        await vscode.window.showTextDocument(document);

        // On CI runners debugpy occasionally (~1 in 25 runs) never reports the stop; retry once and keep the
        // adapter log of the failed attempt so a recurring problem still surfaces
        try {
            await startDebuggingAndWaitForStop();
        } catch (error) {
            console.warn(`First debugger start failed, retrying.\n${error instanceof Error ? error.message : error}`);
            await vscode.debug.stopDebugging();
            await startDebuggingAndWaitForStop();
        }
    });

    suiteTeardown(async () => {
        await vscode.debug.stopDebugging();
        adapterTracker.dispose();
        await setConfig('maxPoints', undefined);
        await setConfig('viewer', undefined);
        delete process.env.VIEWPLY_FORCE_DEBUGGER_TRANSFER;
    });

    test('code action is offered for point clouds without writing a file', async () => {
        // A cursor (empty range) inside the variable name, like hovering in the editor
        const cursor = rangeOf(document, 'pts =').start.translate(0, 1);
        const titles = await codeActionTitles(document, new vscode.Range(cursor, cursor));

        assert.deepStrictEqual(titles.filter(title => title === 'View PLY'), ['View PLY']);
        assert.strictEqual(listPlyFiles().length, 0, 'Moving the cursor must not export anything');
    });

    test('code action is not offered for transform matrices', async () => {
        const cursor = rangeOf(document, 'T4x4 =').start;
        const titles = await codeActionTitles(document, new vscode.Range(cursor, cursor));

        assert.ok(!titles.includes('View PLY'));
    });

    test('code action is offered for a selected expression', async () => {
        const titles = await codeActionTitles(document, rangeOf(document, 'pts_rgb[:10]'));

        assert.ok(titles.includes('View PLY'));
    });

    test('Variables panel command shows the variable in the viewer', async () => {
        const before = new Set(listPlyFiles());
        const loaded = waitForLoaded(api, 'lidar');
        await vscode.commands.executeCommand(VIEW_COMMAND, { variable: { name: 'lidar', evaluateName: 'lidar' } });

        const created = listPlyFiles().filter(file => !before.has(file));
        assert.strictEqual(created.length, 1);
        assert.strictEqual(readVertexCount(created[0]), 500);
        assert.match(readFileSync(created[0]).subarray(0, 512).toString('latin1'), /property uchar red/);

        const message = await loaded;
        assert.strictEqual(message.points, 500);
        assert.strictEqual(message.hasColors, true);
        assert.strictEqual(viewerTabs('lidar').length, 1);
    });

    test('code action command exports an expression', async () => {
        const before = new Set(listPlyFiles());
        const loaded = waitForLoaded(api, 'pts_rgb[:10]');
        await vscode.commands.executeCommand(VIEW_COMMAND, 'pts_rgb[:10]');

        const created = listPlyFiles().filter(file => !before.has(file));
        assert.strictEqual(created.length, 1);
        assert.strictEqual(readVertexCount(created[0]), 10);
        assert.strictEqual((await loaded).points, 10);
    });

    test('viewing the same expression again reuses its panel', async () => {
        const loaded = waitForLoaded(api, 'pts_rgb[:10]');
        await vscode.commands.executeCommand(VIEW_COMMAND, 'pts_rgb[:10]');
        await loaded;

        assert.strictEqual(viewerTabs('pts_rgb[:10]').length, 1);
    });

    test('clouds larger than maxPoints are subsampled', async () => {
        await setConfig('maxPoints', 100);
        try {
            const loaded = waitForLoaded(api, 'pts');
            await vscode.commands.executeCommand(VIEW_COMMAND, 'pts');

            const message = await loaded;
            assert.strictEqual(message.points, 100);
            assert.strictEqual(message.totalPoints, 1000);
        } finally {
            await setConfig('maxPoints', undefined);
        }
    });

    test('files the extension cannot read are fetched through the debugger', async () => {
        // 300k points with colors: several chunks, so a truncated or misplaced chunk would show up
        process.env.VIEWPLY_FORCE_DEBUGGER_TRANSFER = '1';
        try {
            const loaded = waitForLoaded(api, 'big');
            await vscode.commands.executeCommand(VIEW_COMMAND, 'big');

            const message = await loaded;
            assert.strictEqual(message.points, 300000);
            assert.strictEqual(message.hasColors, true);
        } finally {
            delete process.env.VIEWPLY_FORCE_DEBUGGER_TRANSFER;
        }
    });

    test('the "default" viewer setting opens the .ply file instead', async () => {
        await setConfig('viewer', 'default');
        try {
            await vscode.commands.executeCommand(VIEW_COMMAND, 'subset');

            const plyTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => /^subset_\d+\.ply$/.test(tab.label));
            assert.strictEqual(plyTabs.length, 1);
            assert.strictEqual(viewerTabs('subset').length, 0);
        } finally {
            await setConfig('viewer', undefined);
        }
    });

    test('.ply files open in the viewer with Reopen Editor With', async () => {
        const file = listPlyFiles().find(path => /lidar_\d+\.ply$/.test(path))!;
        const loaded = waitForLoaded(api, vscode.Uri.file(file).fsPath);
        await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(file), 'pythonPlyPreview.plyEditor');

        assert.strictEqual((await loaded).points, 500);
    });

    test('session files are removed when debugging stops', async () => {
        assert.ok(listPlyFiles().length > 0);

        const terminated = new Promise<void>(resolve => {
            const listener = vscode.debug.onDidTerminateDebugSession(() => { listener.dispose(); resolve(); });
        });
        await vscode.debug.stopDebugging();
        await terminated;
        // Cleanup runs in the extension's own terminate listener
        await new Promise(resolve => setTimeout(resolve, 1000));

        assert.strictEqual(listPlyFiles().length, 0);
    });
});
