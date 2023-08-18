// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ViewImageService from './ViewImageService';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

let viewImageSvc: ViewImageService;

const WORKING_DIR = 'svifpod';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let usetmp = vscode.workspace.getConfiguration("svifpod").get("usetmppathtosave", true);
	let dir = context.storagePath as string;
	if (usetmp || dir === undefined)
	{
		dir = tmpdir();
		dir = join(dir, WORKING_DIR);
	}
	
	if (existsSync(dir))
	{
		let files = readdirSync(dir);
		files.forEach(file => {
			let curPath = join(dir, file);
			unlinkSync(curPath);
		});
	}
	else
	{
		mkdirSync(dir);
	}

	viewImageSvc = new ViewImageService(dir);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "simply-view-image-for-python-opencv-debugging" is now active!');

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider('python', 
		new PythonOpencvImageProvider(), {	providedCodeActionKinds: [vscode.CodeActionKind.Empty] }));


		context.subscriptions.push(
			vscode.commands.registerTextEditorCommand("extension.viewimagepythonopencvdebug", editor => {
				viewImageSvc.ViewImage(editor.document, editor.selection)
					.then(path => {
						if (path === undefined) {
							return;
						}
						vscode.commands.executeCommand("vscode.open", vscode.Uri.file("C:/Users/Carlos/demoPython/pcd.ply",), vscode.ViewColumn.Beside);
						console.log(path);
						
						//vscode.commands.executeCommand("vscode.open", vscode.Uri.file("C:/Users/Carlos/AppData/Local/Temp/svifpod/point_cloud.ply",), vscode.ViewColumn.Beside);
						//vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path,), vscode.ViewColumn.Beside);
					})
					.catch(error => {
						console.error('Error:', error);
					});
			})
		);

	const helloWorldDisposable = vscode.commands.registerCommand(
        'helloworld.helloWorld',
        () => {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            //vscode.window.showInformationMessage(
            //    'Hello VS Code 2023 (the future!!)',
            //);
			vscode.commands.executeCommand("vscode.open", vscode.Uri.file("C:/Users/Carlos/demoPython/pcd.ply",), vscode.ViewColumn.Beside);
        },
    );
	context.subscriptions.push(helloWorldDisposable);

}

// this method is called when your extension is deactivated
export function deactivate() {}


/**
 * Provides code actions for python opencv image.
 */
export class PythonOpencvImageProvider implements vscode.CodeActionProvider {

	public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.Command[] | undefined> {

		let path = await viewImageSvc.ViewImage(document, range);
		if (path === undefined) {
			return;
		}

		return [
			{ command:"vscode.open", title: 'View PLY', arguments: [ "C:/Users/Carlos/demoPython/pcd.ply", vscode.ViewColumn.Beside ] }
		];
	}
}
