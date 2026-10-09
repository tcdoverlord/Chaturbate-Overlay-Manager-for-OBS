'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const DEMO = params.get('demo') === '1';
  const TOP_COUNT = Math.max(3, Math.min(10, Number.parseInt(params.get('top') || '10', 10) || 10));
  const GOAL = Math.max(0, Number.parseInt(params.get('goal') || '0', 10) || 0);
  const SHOW_STATUS = params.get('status') !== '0';
  const COMPACT = params.get('compact') === '1';
  const THEME = ['purple', 'gold', 'blue'].includes(params.get('theme')) ? params.get('theme') : 'purple';
  document.documentElement.dataset.theme = THEME;
  document.documentElement.dataset.compact = String(COMPACT);
  document.documentElement.dataset.status = String(SHOW_STATUS);

  const ui = {
    topList: $('top-list'), vipName: $('vip-name'), vipTotal: $('vip-total'),
    lastName: $('last-tipper-value'), lastAmount: $('last-tip-amount'),
    sessionTips: $('session-tips'), sessionTokens: $('session-tokens'),
    connection: $('connection'), connectionText: $('connection-text'),
    toast: $('toast'), actionFrame: $('action-frame'), goalPanel: $('goal-panel'),
    goalValues: $('goal-values'), goalFill: $('goal-fill'), statsPanel: $('stats-panel')
  };
  ui.goalPanel.hidden = !GOAL;

  const state = { supporters: {}, lastUsername: '', lastAmount: 0, sessionTips: 0, sessionTokens: 0 };
  let lastEventAt = -1;
  let pollDelay = 1000;
  let consecutiveFailures = 0;
  let actionTimer = null;
  let toastTimer = null;
  let disposed = false;

  const safeText = (v) => String(v == null ? '' : v).trim().slice(0, 120);
  const positiveInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const number = (v) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
  const tokenLabel = (v) => `${Math.round(number(v)).toLocaleString()} ${number(v) === 1 ? 'token' : 'tokens'}`;

  // Accept only object-shaped maps. Values may be numeric totals or objects with token/total fields.
  function normalizeSupporters(input) {
    const out = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
    Object.entries(input).forEach(([rawName, rawValue]) => {
      const name = safeText(rawName);
      let total = rawValue;
      if (rawValue && typeof rawValue === 'object') total = rawValue.tokens ?? rawValue.total ?? rawValue.amount;
      const amount = number(total);
      if (name && amount > 0) out[name] = (out[name] || 0) + amount;
    });
    return out;
  }

  // Normalize field names used by current/legacy status snapshots without fabricating totals.
  function normalizeStatus(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const supporters = normalizeSupporters(
      payload.supporters ?? payload.session_support ?? payload.sessionSupport ?? payload.top_tippers ?? payload.topTippers ?? {}
    );
    const last = payload.last_tip && typeof payload.last_tip === 'object' ? payload.last_tip : {};
    const lastUsername = safeText(payload.last_username ?? payload.lastUsername ?? last.username ?? '');
    const lastAmount = number(payload.last_amount ?? payload.lastAmount ?? last.amount ?? 0);
    const sessionTokens = number(payload.session_tokens ?? payload.sessionTokens ?? payload.tokens ?? payload.total_tokens ?? Object.values(supporters).reduce((a,b)=>a+b,0));
    const sessionTips = number(payload.session_tips ?? payload.sessionTips ?? payload.tip_count ?? payload.tips ?? 0);
    return { supporters, lastUsername, lastAmount, sessionTokens, sessionTips };
  }

  function sortedRows() {
    return Object.entries(state.supporters)
      .map(([name, total]) => ({ name, total: number(total) }))
      .filter((row) => row.name && row.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  function render() {
    const ranked = sortedRows();
    ui.topList.replaceChildren();
    if (!ranked.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-row';
      empty.textContent = 'Waiting for tips…';
      ui.topList.appendChild(empty);
      ui.vipName.textContent = 'Waiting for first tip';
      ui.vipTotal.textContent = '—';
    } else {
      ui.vipName.textContent = ranked[0].name;
      ui.vipTotal.textContent = tokenLabel(ranked[0].total);
      ranked.slice(0, TOP_COUNT).forEach((row, index) => {
        const item = document.createElement('li'); item.className = 'tipper';
        const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(index + 1).padStart(2, '0');
        const name = document.createElement('span'); name.className = 'name'; name.textContent = row.name;
        const total = document.createElement('span'); total.className = 'total'; total.textContent = tokenLabel(row.total);
        item.append(rank, name, total); ui.topList.appendChild(item);
      });
    }
    ui.lastName.textContent = state.lastUsername || 'Waiting for tip…';
    ui.lastAmount.textContent = state.lastUsername && state.lastAmount > 0 ? `+${tokenLabel(state.lastAmount)}` : '';
    ui.sessionTips.textContent = Math.round(state.sessionTips).toLocaleString();
    ui.sessionTokens.textContent = Math.round(state.sessionTokens).toLocaleString();
    if (GOAL > 0) {
      ui.goalValues.textContent = `${Math.round(state.sessionTokens).toLocaleString()} / ${GOAL.toLocaleString()}`;
      ui.goalFill.style.width = `${Math.min(100, state.sessionTokens / GOAL * 100)}%`;
    }
  }

  function setConnection(status, message) {
    ui.connection.dataset.state = status;
    ui.connectionText.textContent = message;
  }
  function showToast(message) {
    ui.toast.textContent = safeText(message);
    ui.toast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 5000);
  }
  function stopAction() {
    if (actionTimer) clearTimeout(actionTimer);
    actionTimer = null;
    ui.actionFrame.style.display = 'none';
    ui.actionFrame.removeAttribute('src');
  }
  function playAction(url, durationSeconds) {
    // Keep the iframe on StimTake's local action-slot route only; reject external/absolute URLs.
    if (typeof url !== 'string' || !url.startsWith('/external-modules/action-slot-') || url.startsWith('//')) return;
    stopAction();
    ui.actionFrame.style.display = 'block';
    ui.actionFrame.src = url;
    const duration = Math.max(1, Math.min(3600, number(durationSeconds) || 6));
    actionTimer = setTimeout(stopAction, duration * 1000);
  }
  function applyStatus(payload) {
    const next = normalizeStatus(payload);
    if (!next) return;
    state.supporters = next.supporters;
    state.lastUsername = next.lastUsername;
    state.lastAmount = next.lastAmount;
    state.sessionTips = next.sessionTips;
    state.sessionTokens = next.sessionTokens;
    render();
  }
  function handleEvent(envelope) {
    if (!envelope || typeof envelope !== 'object') return;
    const at = number(envelope.at ?? envelope.timestamp ?? 0);
    if (at && at <= lastEventAt) return;
    if (at) lastEventAt = at;
    const type = safeText(envelope.type).toLowerCase();
    const payload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
    if (type === 'show-action-triggered') playAction(payload.url, payload.duration);
    if (type === 'module-action' && safeText(payload.action).toLowerCase() === 'stop') stopAction();
    if (type === 'tip' || type === 'platform-tip') {
      const username = safeText(payload.username ?? payload.last_username);
      const amount = positiveInt(payload.amount ?? payload.tokens);
      if (username && amount) showToast(`✦ ${username} tipped ${tokenLabel(amount)} ✦`);
    }
  }

  async function fetchJson(path, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function pollLive() {
    if (disposed || document.hidden) return;
    try {
      const payload = await fetchJson('/api/studio-status');
      applyStatus(payload);
      consecutiveFailures = 0;
      pollDelay = 1000;
      setConnection('connected', 'STIMTAKE CONNECTED');
    } catch (error) {
      consecutiveFailures += 1;
      pollDelay = Math.min(10000, 1000 * (2 ** Math.min(consecutiveFailures - 1, 3)));
      setConnection(consecutiveFailures >= 3 ? 'error' : 'waiting', consecutiveFailures >= 3 ? 'RECONNECTING…' : 'CONNECTING…');
    } finally {
      if (!disposed) setTimeout(pollLive, pollDelay);
    }
  }
  async function pollEvent() {
    if (disposed || document.hidden || DEMO) return;
    try { handleEvent(await fetchJson('/api/event', 2500)); } catch (_) { /* status poll owns the connection badge */ }
    if (!disposed) setTimeout(pollEvent, 300);
  }

  function startDemo() {
    setConnection('connected', 'DEMO PREVIEW');
    Object.assign(state, {
      supporters: { obsidian_fan: 2450, neon_wolf: 1820, sunnyson3: 1240, bstudly: 890, mister_fun: 620, bluefox: 440 },
      lastUsername: 'obsidian_fan', lastAmount: 25, sessionTips: 37, sessionTokens: 8640
    });
    render();
    showToast('✦ obsidian_fan tipped 25 tokens ✦');
    window.setTimeout(() => showToast('✦ Thank you for the support! ✦'), 6500);
  }

  function onVisibility() {
    if (!document.hidden && !DEMO) { pollLive(); pollEvent(); }
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => { disposed = true; stopAction(); if (toastTimer) clearTimeout(toastTimer); });

  if (DEMO) startDemo();
  else { setConnection('waiting', 'CONNECTING…'); render(); pollLive(); pollEvent(); }

  // Keep helpers reachable for the zero-dependency smoke test and browser console diagnostics.
  window.StimTakeOverlay = Object.freeze({ normalizeSupporters, normalizeStatus, tokenLabel, getState: () => ({ ...state, supporters: { ...state.supporters } }) });
})();
