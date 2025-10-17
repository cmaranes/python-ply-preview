import * as vscode from 'vscode';
import { join } from 'path';
import { promises as fs } from 'fs';

// Defines the structure for a point cloud type handler
interface PointCloudHandler {
    /** A user-friendly name for the point cloud type (e.g., 'NumPy Array'). */
    name: string;
    /** A Python expression string that returns True if the variable matches the type. */
    typeCheck: (varName: string) => string;
    /** A Python script string that saves the variable to a specified path. */
    saveExpression: (varName:string, savePath: string) => string;
}

// Configuration for supported point cloud types.
const POINT_CLOUD_HANDLERS: PointCloudHandler[] = [
    {
        name: 'Open3D PointCloud',
        typeCheck: (varName) => `isinstance(${varName}, o3d.geometry.PointCloud)`,
        saveExpression: (varName, savePath) => `o3d.io.write_point_cloud('${savePath}', ${varName})`,
    },
    {
        name: 'NumPy Array',
        typeCheck: (varName) => `isinstance(${varName}, np.ndarray) and ${varName}.ndim == 2 and ${varName}.shape[1] in [3, 6]`,
        saveExpression: (varName, savePath) => `
pcd = o3d.geometry.PointCloud()
pcd.points = o3d.utility.Vector3dVector((${varName})[:, :3])
if (${varName}).shape[1] == 6:
    pcd.colors = o3d.utility.Vector3dVector((${varName})[:, 3:])
o3d.io.write_point_cloud('${savePath}', pcd)`,
    },
    {
        name: 'PyTorch Tensor',
        typeCheck: (varName) => `isinstance(${varName}, torch.Tensor) and ${varName}.ndim == 2 and ${varName}.shape[1] in [3, 6]`,
        saveExpression: (varName, savePath) => `
pcd = o3d.geometry.PointCloud()
numpy_var = (${varName}).detach().cpu().numpy()
pcd.points = o3d.utility.Vector3dVector(numpy_var[:, :3])
if numpy_var.shape[1] == 6:
    pcd.colors = o3d.utility.Vector3dVector(numpy_var[:, 3:])
o3d.io.write_point_cloud('${savePath}', pcd)`,
    },
];

/**
 * Service to handle saving Python point cloud variables from a debug session as .ply files.
 */
export default class ViewPLYService {
    private static readonly LOG_PREFIX = '[ViewPLY]';
    private static readonly PREVIEW_FOLDER = 'ply_preview';
    private static readonly VSCODE_FOLDER = '.vscode';

    private readonly baseStorageDir: string;

    public constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ".";
        this.baseStorageDir = join(workspaceFolder, ViewPLYService.VSCODE_FOLDER, ViewPLYService.PREVIEW_FOLDER);
        this.logInfo(`Service initialized. Storage directory: ${this.baseStorageDir}`);

        vscode.debug.onDidTerminateDebugSession(this.cleanupSessionFiles.bind(this));
    }

    /**
     * Main entry point to process a user's "View as PLY" request.
     * It identifies the variable under the cursor, checks if it's a supported
     * point cloud type, and saves it as a temporary .ply file.
     * @returns The path to the saved .ply file, or undefined if unsuccessful.
     */
    public async viewPLY(document: vscode.TextDocument, range: vscode.Range): Promise<string | undefined> {
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

        try {
            const frameId = await this.getTopStackFrameId(session);
            if (frameId === undefined) {
                this.logInfo('Could not get a valid stack frame. Aborting.');
                return;
            }

            // Attempt to find a handler that can process this variable type.
            for (const handler of POINT_CLOUD_HANDLERS) {
                const checkExpression = handler.typeCheck(`(${expression})`);
                const response = await this.evaluateExpression(session, checkExpression, frameId, 'hover');

                if (response?.result === 'True') {
                    this.logInfo(`SUCCESS: '${expression}' matched as ${handler.name}.`);
                    return await this.saveVariableAsPly(expression, handler, session, frameId);
                }
            }

            // If we're here, the variable was valid but not a supported type.
            this.logInfo(`Variable '${expression}' is valid but not a supported point cloud type.`);
        } catch (error: any) {
            this.logError(`An unexpected error occurred for expression '${expression}'.`, error);
        } finally {
            this.logInfo('Action finished.');
        }
    }

    /**
     * Retrieves the variable name under the cursor, ignoring it if it's inside a comment or string.
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

        // Heuristic to ignore if inside a string literal
        const linePrefix = lineText.substring(0, wordStartIndex);
        const singleQuotes = (linePrefix.match(/'/g) || []).length - (linePrefix.match(/\\'/g) || []).length;
        const doubleQuotes = (linePrefix.match(/"/g) || []).length - (linePrefix.match(/\\"/g) || []).length;
        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
            return;
        }

        return expression;
    }

    /**
     * Fetches the ID of the top stack frame from the active debug session.
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
     * Executes a Python expression in the debugger's context.
     */
    private async evaluateExpression(session: vscode.DebugSession, expression: string, frameId: number, context: 'watch' | 'repl' | 'hover') {
        return session.customRequest("evaluate", { expression, frameId, context });
    }

    /**
     * Generates a save command, executes it in the debugger, and returns the file path.
     */
    private async saveVariableAsPly(expression: string, handler: PointCloudHandler, session: vscode.DebugSession, frameId: number): Promise<string | undefined> {
        try {
            const sessionDir = join(this.baseStorageDir, session.id);
            await fs.mkdir(sessionDir, { recursive: true });

            const sanitizedName = expression.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
            const savePath = join(sessionDir, `${sanitizedName}_${Date.now()}.ply`).replace(/\\/g, '/');

            const saveCommand = handler.saveExpression(`(${expression})`, savePath);
            await this.evaluateExpression(session, saveCommand, frameId, 'repl');

            this.logInfo(`File saved to: ${savePath}`);
            return savePath;
        } catch (error) {
            this.logError(`Failed to save PLY file for '${expression}'.`, error);
            return undefined;
        }
    }

    /**
     * Cleans up temporary files for a debug session when it terminates.
     */
    private async cleanupSessionFiles(session: vscode.DebugSession): Promise<void> {
        const sessionDir = join(this.baseStorageDir, session.id);
        try {
            // fs.rm with recursive+force is idempotent, no need to check for existence first.
            await fs.rm(sessionDir, { recursive: true, force: true });
            this.logInfo(`Cleaned up session directory: ${sessionDir}`);
        } catch (error) {
            this.logError(`Error during cleanup of ${sessionDir}.`, error);
        }
    }
    
    // --- Logging Utilities ---
    private logInfo(message: string): void {
        console.log(`${ViewPLYService.LOG_PREFIX} ${message}`);
    }

    private logError(message: string, error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${ViewPLYService.LOG_PREFIX} ERROR: ${message} | Details: ${errorMessage}`);
    }
}