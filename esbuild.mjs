// Bundles the webview viewer (three.js included) into media/viewer.js.
// The extension itself is still compiled by tsc; run `node esbuild.mjs --watch` to rebuild on change.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** Prints errors in a format the problem matcher in .vscode/tasks.json understands. */
const problemMatcherPlugin = {
    name: 'problem-matcher',
    setup(build) {
        build.onStart(() => {
            if (watch) {
                console.log('[watch] build started');
            }
        });
        build.onEnd(result => {
            for (const { text, location } of result.errors) {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            }
            if (watch) {
                console.log('[watch] build finished');
            }
        });
    },
};

const context = await esbuild.context({
    entryPoints: ['src/webview/viewer.ts'],
    outfile: 'media/viewer.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
});

if (watch) {
    await context.watch();
} else {
    const result = await context.rebuild();
    await context.dispose();
    if (result.errors.length) {
        process.exit(1);
    }
}
