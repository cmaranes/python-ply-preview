import * as vscode from 'vscode';
import { join } from 'path';

export default class ViewImageService {
	private workingdir :string;

	public constructor(dir: string)
	{
		this.workingdir = dir;
	}

	public async ViewImage(document: vscode.TextDocument, range: vscode.Range): Promise<string|undefined> {
		const session = vscode.debug.activeDebugSession;
		if (session === undefined) {
			return;
		}

		const selectedVariable = document.getText(document.getWordRangeAtPosition(range.start));

		let res = await session.customRequest('threads', {});
		let threads = res.threads;
		let variables : any[] = [];
		let targetVariable = undefined;
		let callStack = 0;

		end:
		for (const thread of threads) 
		{
			res = await session.customRequest('stackTrace', { threadId: thread.id });
			let stacks = res.stackFrames;
			for (let stack of stacks)
			{
				callStack = stack.id
				res = await session.customRequest('scopes', {frameId: callStack});
				let scopes = res.scopes;
				for (let scope of scopes)
				{
					res = await session.customRequest('variables', {variablesReference: scope.variablesReference});
					variables = res.variables;
					targetVariable = variables.find( v => v.name === selectedVariable);
					if (targetVariable !== undefined)
					{
						break end;
					}
				}
			}
		}

		if (targetVariable === undefined)
		{
			return;
		}

		//let path = join(this.workingdir,  `${targetVariable.name}.ply`);
		//let savepath = path.replace(/\\/g, '/');
        let savepath = "./pcd.ply";

		const vn = targetVariable.evaluateName; // var name
		//const nparray_expression =  `(${vn}.numpy() * 255.0 if (hasattr(${vn}, 'dtype')) and (${vn}.dtype == np.float64 or ${vn}.dtype == np.float32) else ${vn}.numpy()) if callable(getattr(${vn}, 'numpy', None)) else (${vn} * 255.0 if (isinstance(${vn}, (np.ndarray)) and (${vn}.dtype == np.float64 or ${vn}.dtype == np.float32)) else ${vn})`;
		const pointcloud_expression = `${vn}`;
        const expression = `o3d.io.write_point_cloud('${savepath}', ${pointcloud_expression})`;
        //const expression = `o3d.io.write_point_cloud('pcd.ply', ${pointcloud_expression})`;
		res = await session.customRequest("evaluate", { expression: expression, frameId: callStack, context:'hover' });
		console.log(`evaluate ${expression} result: ${res.result}`);
        await sleep(1000); // Wait for 2 seconds
		return savepath;
        //return "C:/Users/Carlos/demoPython/pcd.ply";
	}
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}