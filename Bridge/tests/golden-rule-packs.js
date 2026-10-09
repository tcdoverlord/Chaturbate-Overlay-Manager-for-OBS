const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'action-packs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const failures = [];
for (const pack of manifest.packs.filter(p => ['daily', 'halloween'].includes(p.id))) {
  if (pack.actions.length !== 20) failures.push(`${pack.id}: expected 20 actions`);
  for (const action of pack.actions) {
    const file = path.join(root, pack.folder, action.filename);
    if (!fs.existsSync(file)) { failures.push(`${pack.id}/${action.slot}: missing HTML`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const duration = html.match(/<meta\s+name=["']overlay-duration["']\s+content=["'](\d+)["']/i);
    const seconds = duration ? Number(duration[1]) : NaN;
    if (!Number.isFinite(seconds) || seconds < 1 || seconds >= 120) failures.push(`${pack.id}/${action.slot}: duration metadata missing or >=120 seconds`);
    if (!/effect\.remove\(\)|\.remove\(\)|replaceChildren\(\)|innerHTML\s*=\s*["']{2}|removeChild\(/i.test(html)) failures.push(`${pack.id}/${action.slot}: no visible cleanup hook found`);
    if (!/setTimeout\s*\(/i.test(html) && !/animationend/i.test(html)) failures.push(`${pack.id}/${action.slot}: no timed/animation completion hook found`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('PASS: Daily and Halloween Golden Rule preset packs each contain 20 actions with under-120s metadata and self-cleanup/timing hooks.');
