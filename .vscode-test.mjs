import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    workspaceFolder: './test-fixtures/workspace',
    // The integration tests drive a real debugpy session; 3D Preview is a declared dependency
    installExtensions: ['ms-python.debugpy', 'tatsy.vscode-3d-preview'],
    mocha: {
        ui: 'tdd',
        timeout: 120000,
    },
});
