// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ViewPLYService from './ViewPLYService';
import { mkdirSync, existsSync} from 'fs';
import { join } from 'path';

let viewPLYSvc: ViewPLYService;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Get the path to the current workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        // No workspace folder found, handle the case accordingly
        return;
    }

    // Set the working directory to the __pycache__ folder within the project folder
    const pycacheDir = join(workspaceFolder, '__pycache__');

    if (!existsSync(pycacheDir)) {
        mkdirSync(pycacheDir);
    }

    viewPLYSvc = new ViewPLYService(pycacheDir);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "view-ply-preview" is now active!');

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider('python', 
		new PythonPLYProvider(), {	providedCodeActionKinds: [vscode.CodeActionKind.Empty] }));

}

// this method is called when your extension is deactivated
export function deactivate() {}


/**
 * Provides code actions.
 */
export class PythonPLYProvider implements vscode.CodeActionProvider {

	public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.Command[] | undefined> {

		let path = await viewPLYSvc.viewPLY(document, range);
		if (path === undefined) {
			return;
		}

		return [
			{ command:"vscode.open", title: 'View PLY', arguments: [ vscode.Uri.file(path,), vscode.ViewColumn.Beside ] }
		];
	}
}
