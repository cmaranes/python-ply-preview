import * as assert from 'assert';
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const VIEW_COMMAND = 'python-ply-preview.view';

const workspaceDir = vscode.workspace.workspaceFolders![0].uri.fsPath;
const fixturePath = join(workspaceDir, 'fixture.py');
const previewDir = join(workspaceDir, '.vscode', 'ply_preview');

// --- Helpers ---

function findPython(): string {
    for (const candidate of ['python', 'python3']) {
        try {
            return execSync(`${candidate} -c "import sys, numpy; print(sys.executable)"`).toString().trim();
        } catch {
            // try the next candidate
        }
    }
    throw new Error('A Python interpreter with numpy is required to run the integration tests.');
}

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
        const timer = setTimeout(() => reject(new Error('Debugger did not stop at the breakpoint')), 60000);
        const listener = vscode.debug.onDidChangeActiveStackItem(item => {
            if (item instanceof vscode.DebugStackFrame) {
                clearTimeout(timer);
                listener.dispose();
                resolve();
            }
        });
    });
}

/** Returns the range of the first occurrence of `text` in the document. */
function rangeOf(document: vscode.TextDocument, text: string): vscode.Range {
    const offset = document.getText().indexOf(text);
    assert.notStrictEqual(offset, -1, `'${text}' not found in fixture`);
    return new vscode.Range(document.positionAt(offset), document.positionAt(offset + text.length));
}

async function codeActionTitles(document: vscode.TextDocument, range: vscode.Range): Promise<string[]> {
    const actions = await vscode.commands.executeCommand<(vscode.Command | vscode.CodeAction)[]>(
        'vscode.executeCodeActionProvider', document.uri, range);
    return (actions ?? []).map(action => action.title);
}

// --- Tests ---

suite('View PLY during a debug session', () => {
    let document: vscode.TextDocument;

    suiteSetup(async () => {
        document = await vscode.workspace.openTextDocument(fixturePath);
        await vscode.window.showTextDocument(document);

        const breakpointLine = document.getText().split(/\r?\n/).findIndex(line => line.includes('# BREAKPOINT'));
        vscode.debug.addBreakpoints([
            new vscode.SourceBreakpoint(new vscode.Location(document.uri, new vscode.Position(breakpointLine, 0))),
        ]);

        const stopped = waitForStop();
        const started = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], {
            type: 'debugpy',
            name: 'ViewPLY integration test',
            request: 'launch',
            program: fixturePath,
            python: findPython(),
            console: 'internalConsole',
            justMyCode: true,
        });
        assert.ok(started, 'Debug session failed to start');
        await stopped;
    });

    suiteTeardown(async () => {
        await vscode.debug.stopDebugging();
        vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
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

    test('Variables panel command exports the variable', async () => {
        const before = new Set(listPlyFiles());
        await vscode.commands.executeCommand(VIEW_COMMAND, { variable: { name: 'lidar', evaluateName: 'lidar' } });

        const created = listPlyFiles().filter(file => !before.has(file));
        assert.strictEqual(created.length, 1);
        assert.strictEqual(readVertexCount(created[0]), 500);
        assert.match(readFileSync(created[0]).subarray(0, 512).toString('latin1'), /property uchar red/);
    });

    test('code action command exports an expression', async () => {
        const before = new Set(listPlyFiles());
        await vscode.commands.executeCommand(VIEW_COMMAND, 'pts_rgb[:10]');

        const created = listPlyFiles().filter(file => !before.has(file));
        assert.strictEqual(created.length, 1);
        assert.strictEqual(readVertexCount(created[0]), 10);
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
