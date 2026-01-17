import * as vscode from 'vscode';
import { join } from 'path';
import { promises as fs } from 'fs';

// --- Interface & Configuration ---

interface PointCloudHandler {
    /** A user-friendly name for the point cloud type. */
    name: string;
    /** * A Python expression string that returns True if the variable matches the type.
     * MUST be safe to run even if libraries (like numpy/o3d) are not imported.
     */
    typeCheck: (varName: string) => string;
    /** * A Python script string that saves the variable to a specified path. 
     * Should handle its own imports.
     */
    saveExpression: (varName: string, savePath: string) => string;
}

const POINT_CLOUD_HANDLERS: PointCloudHandler[] = [
    {
        name: 'Open3D PointCloud',
        // Check 1: Verify the object has a class, comes from 'open3d', and is named 'PointCloud'
        typeCheck: (varName) => 
            `hasattr(${varName}, '__class__') and (${varName}.__class__.__module__.startswith('open3d') or 'open3d' in ${varName}.__class__.__module__) and 'PointCloud' in ${varName}.__class__.__name__`,
        
        saveExpression: (varName, savePath) => `
import open3d as __viewply_o3d
__viewply_o3d.io.write_point_cloud('${savePath}', ${varName})
del __viewply_o3d`,
    },
    {
        name: 'NumPy Array',
        // Check 2: Verify it is a numpy array with shape (N, 3) or (N, 6)
        typeCheck: (varName) => 
            `hasattr(${varName}, '__class__') and ${varName}.__class__.__module__ == 'numpy' and ${varName}.__class__.__name__ == 'ndarray' and ${varName}.ndim == 2 and ${varName}.shape[1] in [3, 6]`,
        
        saveExpression: (varName, savePath) => `
import open3d as __viewply_o3d
pcd = __viewply_o3d.geometry.PointCloud()
pcd.points = __viewply_o3d.utility.Vector3dVector((${varName})[:, :3])
if (${varName}).shape[1] == 6:
    pcd.colors = __viewply_o3d.utility.Vector3dVector((${varName})[:, 3:])
__viewply_o3d.io.write_point_cloud('${savePath}', pcd)
del __viewply_o3d`,
    },
    {
        name: 'PyTorch Tensor',
        // Check 3: Verify it is a torch tensor
        typeCheck: (varName) => 
            `hasattr(${varName}, '__class__') and 'torch' in ${varName}.__class__.__module__ and 'Tensor' in ${varName}.__class__.__name__ and ${varName}.ndim == 2 and ${varName}.shape[1] in [3, 6]`,
        
        saveExpression: (varName, savePath) => `
import open3d as __viewply_o3d
pcd = __viewply_o3d.geometry.PointCloud()
numpy_var = (${varName}).detach().cpu().numpy()
pcd.points = __viewply_o3d.utility.Vector3dVector(numpy_var[:, :3])
if numpy_var.shape[1] == 6:
    pcd.colors = __viewply_o3d.utility.Vector3dVector(numpy_var[:, 3:])
__viewply_o3d.io.write_point_cloud('${savePath}', pcd)
del __viewply_o3d`,
    }
];

// --- Service Class ---

export default class ViewPLYService {
    private static readonly LOG_PREFIX = '[ViewPLY]';
    private static readonly PREVIEW_FOLDER = 'ply_preview';
    private static readonly VSCODE_FOLDER = '.vscode';

    private readonly baseStorageDir: string;
    private outputChannel: vscode.OutputChannel; 

    public constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ".";
        this.baseStorageDir = join(workspaceFolder, ViewPLYService.VSCODE_FOLDER, ViewPLYService.PREVIEW_FOLDER);
        
        // Create an Output Channel for better debugging visibility
        this.outputChannel = vscode.window.createOutputChannel("ViewPLY Debug");
        
        this.logInfo(`Service initialized. Storage directory: ${this.baseStorageDir}`);
        vscode.debug.onDidTerminateDebugSession(this.cleanupSessionFiles.bind(this));
    }

    /**
     * Main entry point to process a user's "View as PLY" request.
     */
    public async viewPLY(document: vscode.TextDocument, range: vscode.Range): Promise<string | undefined> {
        // Show the output channel so the user sees what's happening
        // this.outputChannel.show(true); 
        this.logInfo('Action triggered.');

        const session = vscode.debug.activeDebugSession;
        if (!session) {
            this.logInfo('No active debug session. Aborting.');
            return;
        }

        const expression = this.getExpressionFromRange(document, range);
        if (!expression) {
            this.logInfo('No valid expression found at cursor. Ignoring.');
            return;
        }

        this.logInfo(`Inspecting variable: '${expression}'`);

        try {
            const frameId = await this.getTopStackFrameId(session);
            if (frameId === undefined) {
                this.logInfo('Could not get a valid stack frame. Aborting.');
                return;
            }

            // Iterate through all supported handlers
            for (const handler of POINT_CLOUD_HANDLERS) {
                const checkExpression = handler.typeCheck(`(${expression})`);
                
                // We wrap the check in a try/catch block so that if one check fails (e.g. syntax error),
                // the loop continues to the next handler instead of crashing the extension.
                try {
                    const response = await this.evaluateExpression(session, checkExpression, frameId, 'hover');
                    
                    if (response?.result === 'True') {
                        this.logInfo(`SUCCESS: '${expression}' matched handler: ${handler.name}`);
                        return await this.saveVariableAsPly(expression, handler, session, frameId);
                    } else {
                        // Optional: Log verbose debug info
                        // this.logInfo(`Check failed for ${handler.name}: ${response?.result}`);
                    }
                } catch (checkError: any) {
                    // This is common if libraries are missing. We log and continue.
                    this.logInfo(`Skipping handler '${handler.name}' due to eval error (likely missing import): ${checkError.message}`);
                }
            }

            this.logInfo(`Variable '${expression}' did not match any supported point cloud type.`);
            vscode.window.showWarningMessage(`ViewPLY: Variable '${expression}' is not a valid Point Cloud (NumPy, Torch, or Open3D).`);

        } catch (error: any) {
            this.logError(`CRITICAL ERROR for expression '${expression}'.`, error);
        } finally {
            this.logInfo('Action finished.');
        }
    }

    /**
     * Retrieves the variable name under the cursor.
     */
    private getExpressionFromRange(document: vscode.TextDocument, range: vscode.Range): string | undefined {
        const expression = document.getText(document.getWordRangeAtPosition(range.start));
        if (!expression) return;

        const lineText = document.lineAt(range.start.line).text;
        const wordStartIndex = range.start.character;

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
     * Fetches the ID of the top stack frame.
     */
    private async getTopStackFrameId(session: vscode.DebugSession): Promise<number | undefined> {
        try {
            const { threads } = await session.customRequest('threads', {});
            const threadId = threads?.[0]?.id;
            if (!threadId) return;

            const { stackFrames } = await session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 1 });
            return stackFrames?.[0]?.id;
        } catch (e) {
            this.logError('Failed to retrieve debug context.', e);
            return undefined;
        }
    }

    /**
     * Executes a Python expression in the debugger.
     */
    private async evaluateExpression(session: vscode.DebugSession, expression: string, frameId: number, context: 'watch' | 'repl' | 'hover') {
        return session.customRequest("evaluate", { expression, frameId, context });
    }

    /**
     * Generates a save command and executes it.
     */
    private async saveVariableAsPly(expression: string, handler: PointCloudHandler, session: vscode.DebugSession, frameId: number): Promise<string | undefined> {
        try {
            const sessionDir = join(this.baseStorageDir, session.id);
            await fs.mkdir(sessionDir, { recursive: true });

            const sanitizedName = expression.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
            const savePath = join(sessionDir, `${sanitizedName}_${Date.now()}.ply`).replace(/\\/g, '/');

            // We wrap the save expression in a Python try/except block to capture detailed python-side errors
            const rawCommand = handler.saveExpression(`(${expression})`, savePath);
            const wrappedCommand = `
try:
${rawCommand.replace(/^/gm, '    ')}
    print("ViewPLY Success")
except Exception as e:
    print(f"ViewPLY Error: {e}")
    raise e
`;

            await this.evaluateExpression(session, wrappedCommand, frameId, 'repl');

            this.logInfo(`File saved to: ${savePath}`);
            return savePath;
        } catch (error) {
            this.logError(`Failed to save PLY file for '${expression}'.`, error);
            vscode.window.showErrorMessage(`ViewPLY failed to save file. Check "ViewPLY Debug" output.`);
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
        const msg = `${ViewPLYService.LOG_PREFIX} [${timestamp}] ${message}`;
        console.log(msg);
        this.outputChannel.appendLine(msg);
    }

    private logError(message: string, error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const timestamp = new Date().toLocaleTimeString();
        const msg = `${ViewPLYService.LOG_PREFIX} [${timestamp}] ERROR: ${message} | Details: ${errorMessage}`;
        console.error(msg);
        this.outputChannel.appendLine(msg);
    }
}