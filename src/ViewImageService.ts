import * as vscode from 'vscode';
import { join } from 'path';

function stringToBoolean(input: string): boolean {
    return input.toLowerCase() === "true";
}

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

		let path = join(this.workingdir,  `${targetVariable.name}.ply`);
		let savepath = path.replace(/\\/g, '/');
		
		const vn = targetVariable.evaluateName; // var name

		const numpy_available_expression = `True if 'np' in locals() or 'np' in globals() else False`;
		res = await session.customRequest("evaluate", { expression: numpy_available_expression, frameId: callStack, context:'hover' });
		let numpy_available = stringToBoolean(res['result']);
		if (numpy_available)
		{
			// Check if variable is a numpy array, must be shape (n, 3), being n the number of points
			const valid_numpy_array_expression = `isinstance(${vn}, np.ndarray) and ${vn}.ndim == 2 and ${vn}.shape[1] == 3`;
			res = await session.customRequest("evaluate", { expression: valid_numpy_array_expression, frameId: callStack, context:'hover' });
			let valid_numpy_array = stringToBoolean(res['result']);
			if (valid_numpy_array)
			{
				// Convert numpy array to open3d and store result
				const store_point_cloud_expression = `o3d.io.write_point_cloud('${savepath}', o3d.geometry.PointCloud(points=o3d.utility.Vector3dVector(${vn})))`;
				res = await session.customRequest("evaluate", { expression: store_point_cloud_expression, frameId: callStack, context:'hover' });
				return savepath;
			}

		}

        const expression = `o3d.io.write_point_cloud('${savepath}', ${vn})`;
        //const expression = `o3d.io.write_point_cloud('pcd.ply', ${pointcloud_expression})`;
		res = await session.customRequest("evaluate", { expression: expression, frameId: callStack, context:'hover' });
		console.log(`evaluate ${expression} result: ${res.result}`);
		return savepath;
	}
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}