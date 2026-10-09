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
function updateRoomStatus(tabId, href) {
  const room = roomFromUrl(href);
  if (!room) return;
  chrome.storage.local.get(["lockedModel"], ({lockedModel}) => {
    chrome.storage.local.set({
      lastRoomStatus: {
        room, href, matched: !!lockedModel && lockedModel.toLowerCase() === room,
        tabId, at: Date.now()
      }
    });
  });
}
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "ROOM_STATUS" && sender.tab?.id !== undefined) {
    chrome.storage.local.set({
      lastRoomStatus: {
        room: msg.room, href: msg.href, matched: !!msg.matched,
        tabId: sender.tab.id, at: Date.now()
      }
    });
  }
  if (msg?.type === 'TIP_CANDIDATE' && msg.tip && sender.tab?.url) {
    const room = roomFromUrl(sender.tab.url);
    if (!room || room !== String(msg.tip.room || '').toLowerCase()) return;
    fetch('http://127.0.0.1:8788/api/tip', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(msg.tip)
    }).catch(() => {});
  }
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete" && tab.url) updateRoomStatus(tabId, tab.url);
});