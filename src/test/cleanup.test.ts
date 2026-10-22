import * as assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { removeStaleSessionDirs } from '../ViewPLYService';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSessionDir(baseDir: string, name: string, ageMs: number): string {
    const dir = join(baseDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'cloud.ply'), 'ply\n');
    const time = new Date(Date.now() - ageMs);
    utimesSync(dir, time, time);
    return dir;
}

suite('Stale session cleanup', () => {
    test('removes only session folders older than the max age', async () => {
        const baseDir = mkdtempSync(join(tmpdir(), 'viewply-'));
        const stale = makeSessionDir(baseDir, 'stale-session', 2 * DAY_MS);
        const fresh = makeSessionDir(baseDir, 'fresh-session', 60 * 1000);
        writeFileSync(join(baseDir, 'not-a-session.txt'), '');

        const removed = await removeStaleSessionDirs(baseDir, DAY_MS);

        assert.deepStrictEqual(removed, [stale]);
        assert.ok(!existsSync(stale));
        assert.ok(existsSync(join(fresh, 'cloud.ply')));
        assert.ok(existsSync(join(baseDir, 'not-a-session.txt')));
    });

    test('does nothing when the preview folder does not exist', async () => {
        const removed = await removeStaleSessionDirs(join(tmpdir(), 'viewply-does-not-exist'), DAY_MS);

        assert.deepStrictEqual(removed, []);
    });
});
