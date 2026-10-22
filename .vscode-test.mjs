import { defineConfig } from '@vscode/test-cli';
import { execSync } from 'child_process';

// Resolve the interpreter here: on macOS VS Code replaces PATH with the login shell's,
// which can hide the Python (with numpy) that the terminal / CI runner uses.
function findPython() {
    for (const candidate of ['python', 'python3']) {
        try {
            return execSync(`${candidate} -c "import sys, numpy; print(sys.executable)"`).toString().trim();
        } catch {
            // try the next candidate
        }
    }
    throw new Error('A Python interpreter with numpy is required to run the integration tests.');
}

export default defineConfig({
    files: 'out/test/**/*.test.js',
    workspaceFolder: './test-fixtures/workspace',
    // The integration tests drive a real debugpy session
    installExtensions: ['ms-python.debugpy'],
    env: {
        VIEWPLY_TEST_PYTHON: findPython(),
    },
    mocha: {
        ui: 'tdd',
        timeout: 120000,
    },
});
