// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ViewPLYService from './ViewPLYService';

let viewPLYSvc: ViewPLYService;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    viewPLYSvc = new ViewPLYService();

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('python', new PythonPLYProvider())
    );
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