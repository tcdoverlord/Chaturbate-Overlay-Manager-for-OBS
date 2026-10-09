(() => {
  function roomFromUrl(href) {
    try {
      const u = new URL(href);
      if (!/(^|\.)chaturbate\.com$/i.test(u.hostname)) return "";
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0]?.toLowerCase() === "b") parts.shift();
      const room = parts[0] || "";
      return /^[a-z0-9_]{1,64}$/i.test(room) ? room.toLowerCase() : "";
    } catch { return ""; }
  }
  const room = roomFromUrl(location.href);
  if (!room) return;
  chrome.storage.local.get(["lockedModel"], ({lockedModel}) => {
    chrome.runtime.sendMessage({ type:"ROOM_STATUS", room, href:location.href, matched:!!lockedModel && lockedModel.toLowerCase()===room });
  });

  // Best-effort fallback: watch newly added room text for an explicit system-style
  // phrase such as "username tipped 25 tokens". Never infer tips from arbitrary chat.
  // DOM structure/text can change on Chaturbate; this needs a live-room validation.
  const seen = new Map();
  const TIP_PATTERNS = [
    /^\s*([a-z0-9_]{1,64})\s+tipped\s+(?:you\s+)?([0-9,]+)\s+tokens?\b/i,
    /^\s*([a-z0-9_]{1,64})\s+sent\s+(?:you\s+)?([0-9,]+)\s+tokens?\b/i
  ];
  function inspectText(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 240) return;
    let match = null;
    for (const re of TIP_PATTERNS) { match = text.match(re); if (match) break; }
    if (!match) return;
    const username = match[1].toLowerCase();
    const amount = Number(match[2].replace(/,/g,''));
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const signature = `${room}|${username}|${amount}|${text}`;
    const now = Date.now();
    for (const [key, at] of seen) if (now-at > 120000) seen.delete(key);
    if (seen.has(signature)) return;
    seen.set(signature, now);
    const event_id = `browser-${now}-${Math.random().toString(36).slice(2,10)}`;
    chrome.runtime.sendMessage({
      type:'TIP_CANDIDATE',
      tip:{room, username, amount, message:text, event_id, timestamp:new Date(now).toISOString()}
    }, () => { void chrome.runtime.lastError; });
  }
  function inspectNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) { inspectText(node.nodeValue); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (el.children.length === 0) inspectText(el.textContent);
    else {
      for (const child of el.querySelectorAll('*')) if (child.children.length===0) inspectText(child.textContent);
    }
  }
  const start = () => {
    if (!document.body) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') inspectNode(record.target);
        for (const node of record.addedNodes || []) inspectNode(node);
      }
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
