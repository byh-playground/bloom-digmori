import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
for (const path of ['src/game.mjs', 'build.py']) {
  if (!existsSync(path)) throw new Error('Original source is not materialized: ' + path + '. Do not publish an empty game.');
}
const syntax = spawnSync(process.execPath, ['--check', 'src/game.mjs'], { stdio: 'inherit' });
if (syntax.status !== 0) process.exit(syntax.status ?? 1);
const build = spawnSync(process.env.PYTHON || 'python', ['build.py'], { stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const html = readFileSync('index.html');
const text = html.toString('utf8');
if (!/<html[\s>]/i.test(text) || !/<script[\s>]/i.test(text)) throw new Error('Expected a playable single HTML artifact.');
const version = text.match(/\bVERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!version) throw new Error('Game VERSION is missing.');
const gamekit = '87cac89042256297c025e880aa70ad9cd25ef8ab';
if (!text.includes(gamekit)) throw new Error('Expected pinned GameKit SHA is missing. Review actual imports before updating the pin.');
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
writeFileSync('dist/.nojekyll', '');
writeFileSync('dist/build.json', JSON.stringify({
  commit, version, gamekit_dist_commit: gamekit,
  index_sha256: createHash('sha256').update(html).digest('hex'),
  built_at_utc: new Date().toISOString()
}, null, 2) + '\n');

