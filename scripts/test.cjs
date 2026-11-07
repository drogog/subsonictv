const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = ['settings','servers','navigation','letters','catalog','player','stream-player','playback-effects','listening','music-panel','mix','seed-mix','api','format','analysis','native-audio','stream-decoder','flac-ranges','m4a-reader','visualizer','turntable','screen-awake'];
for (const check of checks) {
  const result = spawnSync(process.execPath, [path.join(root, 'tests', check + '.cjs')], {cwd:root, stdio:'inherit'});
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`All ${checks.length} offline checks passed.`);
