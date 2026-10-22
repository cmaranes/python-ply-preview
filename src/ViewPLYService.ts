import * as vscode from 'vscode';
import { join } from 'path';
import { promises as fs, readFileSync } from 'fs';

// --- Python snippets ---

/**
 * Cheap, side-effect free Python expression that returns True if the value looks like a point cloud.
 * Must not import anything, so it is safe to run on every cursor move.
 * Supported: Open3D PointClouds (legacy and tensor API), NumPy arrays and PyTorch tensors shaped
 * (N, 3|4|6), (3|4|6, N) or (1, N, 3|4|6).
 */
const getTypeCheckExpression = (expression: string) => `(lambda o: (lambda m, n: \
(m.startswith('open3d') and 'PointCloud' in n) or \
(((m.startswith('numpy') and n == 'ndarray') or ('torch' in m and 'Tensor' in n)) \
and o.ndim in (2, 3) and (o.ndim == 2 or o.shape[0] == 1) and o.shape[-1] * o.shape[-2] > 16 \
and (o.shape[-1] in (3, 4, 6) or o.shape[-2] in (3, 4, 6))))\
(type(o).__module__ or '', type(o).__name__))((${expression}))`;

// --- Service Class ---

export default class ViewPLYService {
    private static readonly logPrefix = '[ViewPLY]';
    private static readonly previewFolder = 'ply_preview';
    private static readonly vscodeFolder = '.vscode';

    private readonly baseStorageDir: string;
    private readonly exportScript: string;
    private outputChannel: vscode.OutputChannel;

    public constructor(extensionPath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ".";
        this.baseStorageDir = join(workspaceFolder, ViewPLYService.vscodeFolder, ViewPLYService.previewFolder);
        this.exportScript = readFileSync(join(extensionPath, 'python', 'ply_export.py'), 'utf8');

        // Create an Output Channel for better debugging visibility
        this.outputChannel = vscode.window.createOutputChannel("ViewPLY Debug");

        this.logInfo(`Service initialized. Storage directory: ${this.baseStorageDir}`);
        vscode.debug.onDidTerminateDebugSession(this.cleanupSessionFiles.bind(this));
    }

    /**
     * Returns the expression under the cursor if it evaluates to a supported point cloud.
     * Only runs a cheap type check; nothing is written to disk.
     */
    public async getPointCloudExpression(document: vscode.TextDocument, range: vscode.Range): Promise<string | undefined> {
        const frame = this.getActiveFrame();
        if (!frame) {
            return;
        }

        const expression = this.getExpressionFromRange(document, range);
        if (!expression) {
            return;
        }

        try {
            const response = await this.evaluateExpression(frame.session, getTypeCheckExpression(expression), frame.frameId, 'hover');
            return response?.result === 'True' ? expression : undefined;
        } catch {
            // Undefined names, attribute errors, etc. are expected while moving the cursor
            return;
        }
    }

    /**
     * Exports `expression` to a PLY file in the active debug frame and opens it.
     */
    public async viewPLY(expression: string): Promise<void> {
        this.logInfo(`Exporting '${expression}'`);

        const frame = this.getActiveFrame();
        if (!frame) {
            vscode.window.showWarningMessage('ViewPLY: Pause the Python debugger on a breakpoint first.');
            return;
        }

        const path = await this.saveVariableAsPly(expression, frame.session, frame.frameId);
        if (path) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path), vscode.ViewColumn.Beside);
        }
    }

    /**
     * Retrieves the selected text, or the variable name under the cursor.
     */
    private getExpressionFromRange(document: vscode.TextDocument, range: vscode.Range): string | undefined {
        // An explicit single-line selection allows expressions like `pcd.points` or `batch[0]`
        if (!range.isEmpty && range.isSingleLine) {
            return document.getText(range).trim() || undefined;
        }

        const wordRange = document.getWordRangeAtPosition(range.start);
        if (!wordRange) {
            return;
        }
        const expression = document.getText(wordRange);

        const lineText = document.lineAt(range.start.line).text;
        const wordStartIndex = wordRange.start.character;

        // Ignore if inside a comment
        const commentIndex = lineText.indexOf('#');
        if (commentIndex !== -1 && wordStartIndex > commentIndex) {
            return;
        }

        // Simple heuristic to ignore if inside string quotes
        const linePrefix = lineText.substring(0, wordStartIndex);
        const singleQuotes = (linePrefix.match(/'/g) || []).length;
        const doubleQuotes = (linePrefix.match(/"/g) || []).length;
        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
            return;
        }

        return expression;
    }

    /**
     * Returns the stack frame selected in the Call Stack view (not just the top frame of the first thread).
     */
    private getActiveFrame(): { session: vscode.DebugSession; frameId: number } | undefined {
        const item = vscode.debug.activeStackItem;
        if (item instanceof vscode.DebugStackFrame) {
            return { session: item.session, frameId: item.frameId };
        }
        return undefined;
    }

    /**
     * Executes a Python expression in the debugger.
     */
    private async evaluateExpression(session: vscode.DebugSession, expression: string, frameId: number, context: 'watch' | 'repl' | 'hover') {
        return session.customRequest("evaluate", { expression, frameId, context });
    }

    /**
     * Runs the export script in the debuggee and returns the written file path.
     */
    private async saveVariableAsPly(expression: string, session: vscode.DebugSession, frameId: number): Promise<string | undefined> {
        try {
            const sessionDir = join(this.baseStorageDir, session.id);
            await fs.mkdir(sessionDir, { recursive: true });

            const sanitizedName = expression.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
            const savePath = join(sessionDir, `${sanitizedName}_${Date.now()}.ply`).replace(/\\/g, '/');

            // Run the script in a private globals dict so nothing leaks into the user's frame.
            // JSON string literals are valid Python string literals.
            const command = `(lambda __vp_g: (exec(${JSON.stringify(this.exportScript)}, __vp_g), __vp_g['__vp_result'])[1])` +
                `({'__vp_obj': (${expression}), '__vp_path': ${JSON.stringify(savePath)}})`;

            const response = await this.evaluateExpression(session, command, frameId, 'repl');

            this.logInfo(`File saved to: ${savePath} -> ${response?.result}`);
            return savePath;

        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logError(`Failed to save PLY file for '${expression}'.`, error);

            if (errorMessage.includes("No module named 'numpy'")) {
                const selection = await vscode.window.showWarningMessage(
                    `ViewPLY requires 'numpy' to be installed in your Python environment.`,
                    "How to install",
                    "Cancel"
                );
                if (selection === "How to install") {
                    vscode.env.openExternal(vscode.Uri.parse("https://pypi.org/project/numpy/"));
                    vscode.window.showInformationMessage("Run `pip install numpy` in your terminal.");
                }
            } else {
                // Errors raised by ply_export.py carry a "ViewPLY: ..." message meant for the user
                const reason = errorMessage.match(/ViewPLY: [^\n'"]*/)?.[0]
                    ?? `ViewPLY: Could not export '${expression}' as a point cloud. Check "ViewPLY Debug" output for details.`;
                vscode.window.showErrorMessage(reason);
            }

            return undefined;
        }
    }

    /**
     * Cleans up temporary files.
     */
    private async cleanupSessionFiles(session: vscode.DebugSession): Promise<void> {
        const sessionDir = join(this.baseStorageDir, session.id);
        try {
            await fs.rm(sessionDir, { recursive: true, force: true });
            this.logInfo(`Cleaned up session directory: ${sessionDir}`);
        } catch (error) {
            this.logError(`Error during cleanup of ${sessionDir}.`, error);
        }
    }

    // --- Logging Utilities ---

    private logInfo(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const msg = `${ViewPLYService.logPrefix} [${timestamp}] ${message}`;
        console.log(msg);
        this.outputChannel.appendLine(msg);
    }

    private logError(message: string, error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const timestamp = new Date().toLocaleTimeString();
        const msg = `${ViewPLYService.logPrefix} [${timestamp}] ERROR: ${message} | Details: ${errorMessage}`;
        console.error(msg);
        this.outputChannel.appendLine(msg);
    }
}
