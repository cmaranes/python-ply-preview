// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ViewPLYService from './ViewPLYService';
import ViewerPanels, { PLY_EDITOR_VIEW_TYPE, ViewerMessageEvent } from './ViewerPanels';

const VIEW_COMMAND = 'python-ply-preview.view';

let viewPLYSvc: ViewPLYService;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): ExtensionApi {

    const viewer = new ViewerPanels(context.extensionUri, context.globalState);
    viewPLYSvc = new ViewPLYService(context.extensionPath, viewer);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(PLY_EDITOR_VIEW_TYPE, viewer, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.languages.registerCodeActionsProvider('python', new PythonPLYProvider()),
        vscode.commands.registerCommand(VIEW_COMMAND, (arg?: unknown) => {
            const expression = getExpressionFromCommandArg(arg);
            if (!expression) {
                vscode.window.showWarningMessage('ViewPLY: Select a point cloud variable or expression first.');
                return;
            }
            return viewPLYSvc.viewPLY(expression);
        })
    );

    return { onViewerMessage: viewer.onDidReceiveMessage };
}

/** Returned from `activate`; lets the integration tests observe the viewer. */
export interface ExtensionApi {
    onViewerMessage: vscode.Event<ViewerMessageEvent>;
}

// this method is called when your extension is deactivated
export function deactivate() {}

/**
 * Resolves the expression to export depending on where the command was invoked from:
 * - code action: the expression string
 * - Variables / Watch view context menu: `{ variable: { evaluateName, name } }`
 * - editor context menu / command palette: the active editor selection or word under the cursor
 */
function getExpressionFromCommandArg(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
        return arg;
    }

    const variable = (arg as any)?.variable;
    if (variable) {
        return variable.evaluateName ?? variable.name;
    }

    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const { document, selection } = editor;
        if (!selection.isEmpty) {
            return document.getText(selection).trim() || undefined;
        }
        const wordRange = document.getWordRangeAtPosition(selection.start);
        return wordRange ? document.getText(wordRange) : undefined;
    }
}

/**
 * Provides code actions.
 */
export class PythonPLYProvider implements vscode.CodeActionProvider {

    public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.Command[] | undefined> {

        // Only a cheap type check here; the file is written when the action is clicked
        const expression = await viewPLYSvc.getPointCloudExpression(document, range);
        if (expression === undefined) {
            return;
        }

        return [
            { command: VIEW_COMMAND, title: 'View PLY', arguments: [ expression ] }
        ];
    }
}
