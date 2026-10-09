'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'overlays/obsidian-overlay.html'), 'utf8');
const css = fs.readFileSync(path.join(base, 'overlays/overlay.css'), 'utf8');
const js = fs.readFileSync(path.join(base, 'overlays/overlay.js'), 'utf8');

assert.match(html, /id="top-list"/);
assert.match(html, /stylesheet/);
assert.match(css, /background:transparent/);
assert.match(js, /function normalizeSupporters/);
assert.match(js, /function normalizeStatus/);
assert.match(js, /AbortController/);
assert.match(js, /credentials: 'same-origin'/);
assert.match(js, /startsWith\('\/external-modules\/action-slot-'\)/);

// Run in a minimal browser-shaped VM to exercise field normalization without a DOM implementation.
const ids = ['top-list','vip-name','vip-total','last-tipper-value','last-tip-amount','session-tips','session-tokens','connection','connection-text','toast','action-frame','goal-panel','goal-values','goal-fill','stats-panel'];
const fakeElements = Object.fromEntries(ids.map(id => [id, {
  id, dataset: {}, style: {}, classList: { add(){}, remove(){} }, children: [], hidden:false,
  textContent:'', append(){}, appendChild(n){this.children.push(n);}, replaceChildren(){this.children=[];},
  removeAttribute(){}, setAttribute(){}, addEventListener(){},
}]));
const root = { dataset: {} };
const fakeDocument = { documentElement: root, hidden:false, getElementById(id){return fakeElements[id] || null;}, addEventListener(){}, createElement(tag){return {tag, className:'',textContent:'',append(){}};} };
const fakeWindow = { location:{search:'?demo=1'}, addEventListener(){}, setTimeout, clearTimeout };
const context = { document:fakeDocument, window:fakeWindow, URLSearchParams, Number, Math, Object, String, Array, Date, setTimeout, clearTimeout, AbortController, fetch:async()=>({ok:true,json:async()=>({})}), console };
vm.runInNewContext(js, context, {timeout:1000});
const api = fakeWindow.StimTakeOverlay;
assert.ok(api, 'diagnostic helper exported');
const supporters = api.normalizeSupporters({alpha:10,beta:{tokens:25},bad:-4,empty:0});
assert.equal(supporters.alpha, 10);
assert.equal(supporters.beta, 25);
assert.equal(supporters.bad, undefined);
const status = api.normalizeStatus({session_support:{alpha:5,beta:8},last_username:'alpha',last_amount:5,session_tokens:13,session_tips:2});
assert.equal(status.lastUsername, 'alpha');
assert.equal(status.sessionTokens, 13);
assert.equal(status.sessionTips, 2);
assert.equal(api.tokenLabel(1), '1 token');
console.log('PASS: overlay file, accessibility hooks, resilience hooks, field normalization, and token formatting smoke tests');
