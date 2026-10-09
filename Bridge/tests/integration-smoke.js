const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');

(async () => {
  const source = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-overlay-test-'));
  const port = 19000 + Math.floor(Math.random() * 1000);
  fs.cpSync(source, temp, { recursive: true, filter: (src) => !src.includes(`${path.sep}tests${path.sep}`) });
  const rootNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');
  const existingNodePath = process.env.NODE_PATH || '';
  // The bridge source is copied to an isolated temp directory for tests. Resolve
  // declared root-app dependencies (for example adm-zip) from the project install.
  const child = spawn(process.execPath, ['server.js'], { cwd: temp, env: { ...process.env, PORT: String(port), NODE_PATH: [rootNodeModules, existingNodePath].filter(Boolean).join(path.delimiter) }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  async function request(route, data) {
    const r = await fetch(base + route, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {});
    const raw = await r.text();
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    if (!r.ok) throw new Error(`${route} returned HTTP ${r.status}: ${raw}`);
    return value;
  }
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error('Bridge process exited before becoming ready.');
      try { if ((await request('/health')).ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 150));
    }
    assert.equal(ready, true, 'server should start');
    const selected = await request('/api/model', { username: 'https://chaturbate.com/b/obsidian_stallion/' });
    assert.equal(selected.model, 'obsidian_stallion');
    assert.equal(selected.locked, false);
    const locked = await request('/api/lock', { locked: true });
    assert.equal(locked.locked, true);
    await request('/api/slots', { id: 1, enabled: true, label: 'Smoke Test', minTokens: 25, durationMs: 6000, animation: 'cash', color: '#39a9ff' });
    const tip = await request('/api/test-tip', { username: 'Tester', amount: 25, message: 'smoke test' });
    assert.equal(tip.ok, true);
    assert.deepEqual(tip.activated_slots, [1, 5]); // Slot 5 is enabled by default for the 21–25 token range.
    const status = await request('/api/status');
    assert.equal(status.model, 'obsidian_stallion');
    assert.equal(status.locked, true);
    assert.equal(status.accepted, 1);
    const overlay = await fetch(base + '/overlay/1');
    assert.equal(overlay.status, 200);
    assert.match(await overlay.text(), /EventSource/);
    const packs = await request('/api/action-packs');
    assert.equal(packs.defaultPack, 'daily');
    assert.equal(packs.packs.length, 2);
    assert.equal(packs.packs[0].actions.length, 20);
    assert.equal(packs.packs[1].actions.length, 20);
    const action = await fetch(base + '/action/halloween/1');
    assert.equal(action.status, 200);
    assert.match(await action.text(), /activated_slots/);
    const preview = await fetch(base + '/action/daily/20?preview=1');
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /preview/);
    const htmlFile = await fetch(base + '/action-file/halloween/01_Halloween_Witchs_Wheel_overlay.html');
    assert.equal(htmlFile.status, 200);
    assert.match(await htmlFile.text(), /Witch's Wheel/);
    const customHtml = '<!doctype html><html><body style="background:transparent;color:white"><h1>Custom Action Test</h1></body></html>';
    const assigned = await request('/api/action-html', { id: 3, name: 'my-custom-action.html', label: 'My Custom Action', content: customHtml });
    assert.equal(assigned.ok, true);
    const customPage = await fetch(base + '/action/halloween/3');
    assert.equal(customPage.status, 200);
    const customRoute = await fetch(base + '/action/custom/3');
    assert.equal(customRoute.status, 200);
    assert.match(await customPage.text(), /action-test/);
    const customFile = await fetch(base + '/action-file/custom/slot-3.html');
    assert.equal(customFile.status, 200);
    assert.match(await customFile.text(), /Custom Action Test/);
    const tested = await request('/api/test-action', { id: 3 });
    assert.equal(tested.ok, true);
    const restored = await request('/api/action-reset', { id: 3 });
    assert.equal(restored.ok, true);
    assert.equal((await request('/api/status')).slots.find(s => s.id === 3).customHtml, false);
    await request('/api/slots', { id: 4, enabled: true, label: 'Range Test', minTokens: 10, maxTokens: 20, durationMs: 6000 });
    const inRange = await request('/api/test-tip', { username: 'Tester', amount: 15, message: 'range test' });
    assert.equal(inRange.activated_slots.includes(4), true);
    const outRange = await request('/api/test-tip', { username: 'Tester', amount: 25, message: 'range test' });
    assert.equal(outRange.activated_slots.includes(4), false);
    console.log('PASS: bridge startup, model lock, token ranges, local test tips, custom HTML import, custom action route, test-action trigger, and both 20-action packs.');
  } finally {
    child.kill();
    await new Promise(r => setTimeout(r, 200));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
