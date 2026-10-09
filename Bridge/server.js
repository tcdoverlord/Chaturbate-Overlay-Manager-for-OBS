const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8788);
const STIMTAKE_EVENT_URL = process.env.STIMTAKE_EVENT_URL || "http://127.0.0.1:8787/api/platform-event";
const DATA = process.env.APP_DATA_DIR || path.join(__dirname, "data");
const CONFIG_FILE = path.join(DATA, "config.json");
const LOG_FILE = path.join(DATA, "tips.jsonl");
const ACTION_PACKS_DIR = path.join(__dirname, "action-packs");
const ACTION_MANIFEST = JSON.parse(fs.readFileSync(path.join(ACTION_PACKS_DIR, "manifest.json"), "utf8"));
const USER_PACKS_FILE = path.join(DATA, "custom-packs.json");
function loadUserPacks() {
  try {
    const saved = JSON.parse(fs.readFileSync(USER_PACKS_FILE, "utf8"));
    if (Array.isArray(saved.packs)) ACTION_MANIFEST.packs.push(...saved.packs.filter(p => p && p.custom === true && /^[a-z0-9_-]{1,48}$/.test(p.id)));
  } catch {}
}
function saveUserPacks() {
  fs.writeFileSync(USER_PACKS_FILE, JSON.stringify({packs: ACTION_MANIFEST.packs.filter(p => p.custom === true)}, null, 2), "utf8");
}
loadUserPacks();
fs.mkdirSync(DATA, { recursive: true });

const defaultSlots = Array.from({length:20}, (_,i)=>({
  id:i+1, enabled:true, label:ACTION_MANIFEST.packs.find(p=>p.id===ACTION_MANIFEST.defaultPack)?.actions[i]?.name || `Overlay Action ${i+1}`, minTokens:(i===0?1:i*5+1), maxTokens:(i+1)*5, customHtml:false, customFilename:"",
  matchText:"", durationMs:6000, animation:["cash","glow","confetti","pulse"][i%4],
  color:["#a855f7","#f97316","#22c55e","#e879f9"][i%4]
}));
function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const slots = defaultSlots.map(d => ({...d, ...(Array.isArray(saved.slots) ? saved.slots.find(s=>s.id===d.id) || {} : {})}));
    // One-time migration: older test builds could persist slots as disabled.
    // Start every slot enabled once for this upgrade, then preserve the model's choices.
    if (saved.enabledDefaultsApplied !== true || saved.tokenRangesDefaultsApplied !== true) {
      for (const slot of slots) {
        if (saved.enabledDefaultsApplied !== true) slot.enabled = true;
        if (saved.tokenRangesDefaultsApplied !== true) { slot.minTokens = (slot.id - 1) * 5 + 1; slot.maxTokens = slot.id * 5; }
      }
      const migrated = {
        model: canonicalRoom(saved.model || ""),
        activePack: saved.activePack || ACTION_MANIFEST.defaultPack,
        locked: !!saved.locked && !!canonicalRoom(saved.model || ""),
        slots,
        enabledDefaultsApplied: true,
        tokenRangesDefaultsApplied: true
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), "utf8");
      return migrated;
    }
    return {
      model: canonicalRoom(saved.model || ""),
      activePack: saved.activePack || ACTION_MANIFEST.defaultPack,
      locked: !!saved.locked && !!canonicalRoom(saved.model || ""),
      slots
    };
  } catch {
    const fresh = {model:"", activePack:ACTION_MANIFEST.defaultPack, locked:false, slots:defaultSlots.map(s=>({...s,enabled:true})), enabledDefaultsApplied:true};
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(fresh, null, 2), "utf8"); } catch {}
    return fresh;
  }
}
let config = loadConfig();
let apiToken = ""; // Intentionally never persisted.
let apiRunning = false, apiStatus = "DISCONNECTED", apiError = "";
let apiAbort = false;
let lastEvent = null;
let lastTestAction = { sequence: 0, slot: 0, at: 0 };
let accepted = 0, duplicates = 0, wrongRoom = 0;
const seen = new Set();
try {
  for (const line of fs.readFileSync(LOG_FILE,"utf8").trim().split("\n")) {
    if (!line) continue;
    const item = JSON.parse(line);
    if (item.event_id) seen.add(item.event_id);
  }
} catch {}

function canonicalRoom(value) {
  let s=String(value||"").trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u=new URL(s);
      if (!/(^|\.)chaturbate\.com$/i.test(u.hostname)) return "";
      const parts=u.pathname.split("/").filter(Boolean);
      if (parts[0]?.toLowerCase()==="b") parts.shift();
      s=parts[0]||"";
    } catch { return ""; }
  } else {
    s=s.replace(/^\/+|\/+$/g,"");
    const parts=s.split("/");
    if (parts[0]?.toLowerCase()==="b") parts.shift();
    s=parts[0]||"";
  }
  return validRoom(s)?s.toLowerCase():"";
}
function validRoom(s) { return typeof s==="string" && /^[A-Za-z0-9_]{1,64}$/.test(s); }
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({model:config.model, activePack:config.activePack||ACTION_MANIFEST.defaultPack, locked:config.locked, slots:config.slots, enabledDefaultsApplied:true, tokenRangesDefaultsApplied:true},null,2), "utf8");
}
function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"});
  res.end(body);
}
function body(req) {
  return new Promise((resolve,reject)=>{
    let data="", size=0;
    req.on("data",c=>{size+=c.length;if(size>30*1024*1024){reject(new Error("Request too large"));req.destroy();} else data+=c;});
    req.on("end",()=>{try{resolve(JSON.parse(data||"{}"));}catch{reject(new Error("Invalid JSON"));}});
    req.on("error",reject);
  });
}
function appendLog(obj) {
  fs.appendFileSync(LOG_FILE, JSON.stringify({...obj, received_at:new Date().toISOString()})+"\n","utf8");
}
async function forwardStimTake(event) {
  if (process.env.STIMTAKE_FORWARD !== "1") return {ok:false, skipped:true, reason:"Optional forwarding is disabled."};
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 1800);
  try {
    const r = await fetch(STIMTAKE_EVENT_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event),signal:controller.signal});
    return {ok:r.ok || r.status===204, status:r.status};
  } catch(e) { return {ok:false,error:e.message}; }
  finally { clearTimeout(timer); }
}
function normalizeEvent(raw, source="bridge") {
  const room = canonicalRoom(raw.room || raw.model || config.model || "");
  const username = String(raw.username || raw.user || raw.from_user || "").trim();
  const amount = Number(raw.amount ?? raw.tokens ?? raw.token_count);
  const eventId = String(raw.event_id || raw.id || raw.tip_id || crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex"));
  if (!validRoom(room) || !validRoom(username) || !Number.isSafeInteger(amount) || amount<=0 || !eventId || eventId.length>200) return {error:"Tip event is missing a valid room, username, positive integer amount, or event ID."};
  return {source:"chaturbate-browser", type:"tip", room, username, amount, event_id:eventId, timestamp:String(raw.timestamp || new Date().toISOString()), message:String(raw.message || ""), bridge_source:source};
}
async function acceptTip(raw, source="bridge") {
  const event = normalizeEvent(raw, source);
  if (event.error) return {ok:false,error:event.error};
  if (!config.locked || !config.model) return {ok:false,error:"Lock a model before accepting tips."};
  if (event.room.toLowerCase() !== config.model.toLowerCase()) { wrongRoom++; return {ok:false,ignored:true,error:"Tip room does not match locked model."}; }
  if (seen.has(event.event_id)) { duplicates++; return {ok:false,duplicate:true,error:"Duplicate event ignored."}; }
  seen.add(event.event_id);
  if (seen.size>25000) seen.delete(seen.values().next().value);
  const timestamp = event.timestamp;
  const slotMatches = [];
  for (const slot of config.slots) {
    if (!slot.enabled || event.amount < Number(slot.minTokens||1) || (Number(slot.maxTokens||0)>0 && event.amount>Number(slot.maxTokens))) continue;
    if (slot.matchText && !event.message.toLowerCase().includes(String(slot.matchText).toLowerCase())) continue;
    slotMatches.push(slot.id);
  }
  const localEvent = {...event, activated_slots:slotMatches};
  appendLog(localEvent);
  accepted++;
  lastEvent = {username:event.username, amount:event.amount, room:event.room, timestamp, slots:slotMatches};
  broadcast({type:"tip",event:localEvent});
  // Optional integration must never delay or block local overlays.
  if (process.env.STIMTAKE_FORWARD === "1") void forwardStimTake({source:"chaturbate-browser",type:"tip",room:event.room,username:event.username,amount:event.amount,event_id:event.event_id,timestamp:event.timestamp}).catch(()=>{});
  return {ok:true,activated_slots:slotMatches};
}
const clients = new Set();
function broadcast(message) {
  const wire = `data: ${JSON.stringify(message)}\n\n`;
  for (const res of clients) { try { res.write(wire); } catch {} }
}
function status() {
  return {ok:true, host:HOST, port:PORT, model:config.model, activePack:config.activePack||ACTION_MANIFEST.defaultPack, locked:config.locked, apiRunning, apiStatus, apiError, eventSource:"Chrome room tab", accepted, duplicates, wrongRoom, lastEvent, slots:config.slots.map(s=>({id:s.id,enabled:s.enabled,label:s.label,minTokens:s.minTokens,maxTokens:s.maxTokens||0,customHtml:!!s.customHtml,customFilename:s.customFilename||"",matchText:s.matchText,durationMs:s.durationMs,animation:s.animation,color:s.color}))};
}
async function pollEventsApi() {
  apiRunning=true; apiAbort=false; apiStatus="CONNECTING"; apiError="";
  // Chaturbate's Events API endpoint is scoped to the broadcaster and token.
  // The API returns a nextUrl cursor; continue using that URL instead of
  // repeatedly requesting a generic /events/ endpoint.
  const username = config.model;
  let nextUrl = `https://eventsapi.chaturbate.com/events/${encodeURIComponent(username)}/${encodeURIComponent(apiToken)}/`;
  while(!apiAbort && apiToken && config.locked && config.model === username) {
    try {
      const url = new URL(nextUrl);
      if (url.hostname !== "eventsapi.chaturbate.com" || !url.pathname.startsWith("/events/")) {
        throw new Error("Events API returned an unexpected nextUrl. Reconnect to reset the event cursor.");
      }
      if (!url.searchParams.has("timeout")) url.searchParams.set("timeout","30");
      const r = await fetch(url,{headers:{"accept":"application/json"},signal:AbortSignal.timeout(95000)});
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          throw new Error(`Events API returned HTTP ${r.status}. Check that the token is valid and has Events API scope.`);
        }
        if (r.status === 404) {
          throw new Error("Events API returned HTTP 404. Verify the broadcaster username and create a token with Events API scope at Chaturbate's API token page.");
        }
        throw new Error(`Events API returned HTTP ${r.status}`);
      }
      const data = await r.json();
      apiStatus="CONNECTED"; apiError="";
      const events = Array.isArray(data.events) ? data.events : (Array.isArray(data) ? data : []);
      for (const item of events) {
        const method=String(item.method || item.type || "").toLowerCase();
        const obj=item.object || item.data || item;
        if (method !== "tip" && method !== "receive_tip" && method !== "event") continue;
        const tip = obj.tip || obj;
        const userObj = obj.user || {};
        const amount=Number(tip.tokens ?? tip.amount ?? obj.tokens ?? obj.amount ?? obj.token_count);
        if (!Number.isSafeInteger(amount) || amount<=0) continue;
        const room=String(obj.broadcaster || obj.room || obj.model || username).toLowerCase();
        const user=String(userObj.username || userObj.user || obj.username || obj.from_user || "");
        const message=String(tip.message ?? obj.message?.message ?? obj.message ?? "");
        const id=String(item.id || obj.id || tip.id || `${room}:${user}:${amount}:${item.timestamp||obj.timestamp||""}:${message}`);
        const timestamp=String(item.timestamp || obj.timestamp || new Date().toISOString());
        await acceptTip({room,username:user,amount,event_id:id,timestamp,message},"events-api");
      }
      const cursor = data.nextUrl || data.next_url;
      if (typeof cursor === "string" && cursor.startsWith("https://eventsapi.chaturbate.com/")) nextUrl=cursor;
      else nextUrl = `https://eventsapi.chaturbate.com/events/${encodeURIComponent(username)}/${encodeURIComponent(apiToken)}/`;
    } catch(e) {
      if (apiAbort) break;
      apiStatus="ERROR"; apiError=e.message;
      // Avoid rapid retries on invalid tokens/endpoints; let user disconnect/reconnect.
      await new Promise(resolve=>setTimeout(resolve,3500));
    }
  }
  apiRunning=false;
  if (apiStatus!=="ERROR") apiStatus="DISCONNECTED";
}
function stopEventsApi() { apiAbort=true; apiToken=""; apiRunning=false; apiStatus="DISCONNECTED"; apiError=""; }

const dashboard = fs.readFileSync(path.join(__dirname,"public","index.html"));
const overlayHtml = fs.readFileSync(path.join(__dirname,"public","overlay.html"));
function masterOverlayPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chaturbate OBS Action Overlay</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:"Segoe UI",Arial,sans-serif;color:#fff}*{box-sizing:border-box}
#action{position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent;z-index:1;pointer-events:none}
#supporter-card{position:fixed;z-index:5;top:28px;left:28px;width:min(360px,calc(100vw - 56px));padding:18px 20px;background:rgba(10,15,24,.91);border:1px solid rgba(57,169,255,.55);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.35);pointer-events:none}
.title{font-size:18px;font-weight:850;letter-spacing:.04em;color:#69c5ff;margin-bottom:12px}
#vip{padding:10px 12px;margin-bottom:12px;background:rgba(57,169,255,.14);border:1px solid rgba(57,169,255,.38);border-radius:10px}
.vip-label{font-size:10px;color:#aeb6c4;text-transform:uppercase;letter-spacing:.1em}
#vip-name{font-size:18px;font-weight:800;margin-top:3px;overflow-wrap:anywhere}#vip-total{color:#69c5ff;font-size:13px;margin-top:2px}
#top-list{display:grid;gap:5px}.tipper{display:grid;grid-template-columns:26px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.07)}
.rank{color:#9ca3af;font-size:12px}.name{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.total{color:#8bd2ff;font-weight:800;font-size:12px;white-space:nowrap}.empty{color:#aeb6c4;font-size:12px;padding:8px 2px}
#last-tipper{position:fixed;z-index:5;left:28px;bottom:28px;min-width:260px;max-width:min(380px,calc(100vw - 56px));padding:12px 16px;background:rgba(10,15,24,.91);border:1px solid rgba(57,169,255,.45);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);pointer-events:none}
#last-tipper .label{color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.1em}#last-tipper-value{font-size:16px;font-weight:800;margin-top:4px;overflow-wrap:anywhere}
</style></head><body>
<iframe id="action" title="Live tip action" allow="autoplay" style="display:none"></iframe>
<section id="supporter-card" aria-label="Top tippers"><div class="title">TOP TIPPERS — THIS SESSION</div><div id="vip"><div class="vip-label">Top Supporter</div><div id="vip-name">Waiting for first tip…</div><div id="vip-total"></div></div><div id="top-list"><div class="empty">Waiting for real tips…</div></div></section>
<section id="last-tipper" aria-label="Last tipper"><div class="label">Last Tipper</div><div id="last-tipper-value">Waiting…</div></section>
<script>
'use strict';
const frame=document.getElementById('action'),topList=document.getElementById('top-list'),vipName=document.getElementById('vip-name'),vipTotal=document.getElementById('vip-total'),lastTipperValue=document.getElementById('last-tipper-value');
const params=new URLSearchParams(location.search);let pack=params.get('pack')||'daily';let manifest=null,lastRun={},supporters={},lastUsername='',lastAmount=0,actionClearTimer=null,activeActionRun=0;
async function loadManifest(){try{const r=await fetch('/api/action-packs',{cache:'no-store'});if(r.ok)manifest=await r.json()}catch(_){}}
const QUEUE_LIMIT=100, DEDUPE_WINDOW_MS=120000;
let actionQueue=[], queueSequence=0, currentJob=null, seenEventIds=new Map(), isFinishing=false;
function publishQueue(){try{fetch('/api/queue-state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({current:currentJob?{slot:currentJob.slot,username:currentJob.username||'',amount:currentJob.amount||0,test:!!currentJob.test}:null,queued:actionQueue.map(j=>({slot:j.slot,username:j.username||'',amount:j.amount||0,test:!!j.test,sequence:j.sequence})),limit:QUEUE_LIMIT})})}catch(_){}}
function queueNotice(){document.documentElement.dataset.queueCount=String(actionQueue.length)}
function dedupeKey(ev){return String(ev.event_id||ev.id||ev.tip_id||'').trim()}
function isDuplicate(ev){const id=dedupeKey(ev);if(!id)return false;const now=Date.now();for(const [key,at] of seenEventIds){if(now-at>DEDUPE_WINDOW_MS)seenEventIds.delete(key)}if(seenEventIds.has(id))return true;seenEventIds.set(id,now);return false}
function enqueue(job){if(actionQueue.length>=QUEUE_LIMIT){console.warn('Tip action queue is full; incoming action was not queued',job);return false}job.sequence=++queueSequence;actionQueue.push(job);queueNotice();publishQueue();processQueue();return true}
function scheduleEmergencyFinish(job,delay){if(!currentJob||currentJob.sequence!==job.sequence)return;if(actionClearTimer)clearTimeout(actionClearTimer);actionClearTimer=setTimeout(()=>finishCurrent('emergency-timeout'),Math.max(0,delay))}
async function startJob(job){if(currentJob)return;currentJob=job;isFinishing=false;const now=Date.now();job.startedAt=now;job.started=false;await loadManifest();try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error('status unavailable');const status=await r.json();const slot=status.slots.find(s=>Number(s.id)===Number(job.slot));if(!slot||(!slot.enabled&&!job.test)){currentJob=null;publishQueue();processQueue();return}let url;if(slot.customHtml){url='/action-file/custom/slot-'+job.slot+'.html'}else{const selectedId=params.has('pack')?pack:(status.activePack||pack);const selected=manifest.packs.find(p=>p.id===selectedId)||manifest.packs.find(p=>p.id===manifest.defaultPack)||manifest.packs[0];const action=selected&&selected.actions.find(a=>Number(a.slot)===Number(job.slot));if(!action)throw new Error('action not found');url='/action-file/'+encodeURIComponent(selected.id)+'/'+encodeURIComponent(action.filename)}activeActionRun=job.sequence;frame.style.display='block';frame.onload=()=>{if(!currentJob||currentJob.sequence!==job.sequence)return;job.started=true;try{const doc=frame.contentDocument;let detectedMs=0;const meta=doc&&doc.querySelector('meta[name="overlay-duration"],meta[name="overlay-duration-ms"],meta[name="duration"]');if(meta){const raw=Number(meta.content);if(Number.isFinite(raw)&&raw>0)detectedMs=meta.name==='overlay-duration-ms'?raw:raw*1000;}if(!detectedMs&&doc&&frame.contentWindow){const toMsList=v=>String(v||'').split(',').map(x=>{x=x.trim();if(x.endsWith('ms'))return Math.max(0,parseFloat(x)||0);if(x.endsWith('s'))return Math.max(0,(parseFloat(x)||0)*1000);return 0});for(const el of doc.querySelectorAll('*')){const cs=frame.contentWindow.getComputedStyle(el);for(const [dur,delay] of [[cs.animationDuration,cs.animationDelay],[cs.transitionDuration,cs.transitionDelay]]){const ds=toMsList(dur),ls=toMsList(delay);for(let i=0;i<Math.max(ds.length,ls.length);i++)detectedMs=Math.max(detectedMs,(ds[i%ds.length]||0)+(ls[i%ls.length]||0));}}}if(detectedMs>0)scheduleEmergencyFinish(job,Math.min(115000,detectedMs+7000));}catch(_){}};
frame.src=url+'?run='+now;
scheduleEmergencyFinish(job,120000);
publishQueue();
}catch(e){console.warn('Queued overlay action could not start',e);finishCurrent('start-failed')}}
function processQueue(){if(currentJob||!actionQueue.length)return;const job=actionQueue.shift();queueNotice();publishQueue();startJob(job)}
function finishCurrent(reason){if(!currentJob||isFinishing)return;isFinishing=true;const finished=currentJob;currentJob=null;if(actionClearTimer)clearTimeout(actionClearTimer);actionClearTimer=null;frame.onload=null;try{frame.contentWindow?.postMessage({type:'overlay-stop'},'*')}catch(_){};frame.src='about:blank';frame.style.display='none';document.documentElement.dataset.lastFinish=reason;publishQueue();isFinishing=false;setTimeout(processQueue,0)}
function play(slotId,forceTest=false,details={}){const slot=Number(slotId);if(!Number.isInteger(slot)||slot<1||slot>20)return;enqueue({slot,test:forceTest,username:String(details.username||''),amount:Number(details.amount)||0,eventId:String(details.eventId||''),receivedAt:Date.now()})}
function stopPlayback(){if(currentJob)finishCurrent('manual-stop');else{frame.onload=null;frame.src='about:blank';frame.style.display='none'} }
function clearQueued(){const count=actionQueue.length;actionQueue=[];queueNotice();publishQueue();return count}
function handleMessage(msg){if(!msg||typeof msg!=='object')return;if(msg.type==='action-stop'){stopPlayback();return}if(msg.type==='action-clear-queue'){const cleared=clearQueued();document.documentElement.dataset.queueCleared=String(cleared);return}if(msg.type==='action-test'){play(Number(msg.slot),true,{username:'Test Run'});return}if(msg.type==='tip'&&msg.event){const ev=msg.event;if(isDuplicate(ev))return;const name=String(ev.username||'').trim();const amount=Math.max(0,Number(ev.amount)||0);if(name&&amount){supporters[name]=(supporters[name]||0)+amount;lastUsername=name;lastAmount=amount;renderSupporters()}if(Array.isArray(ev.activated_slots))ev.activated_slots.forEach(id=>play(Number(id),false,{username:name,amount,eventId:dedupeKey(ev)}))}}
window.addEventListener('message',event=>{const d=event.data;if(d&&(d.type==='overlay-complete'||d.type==='overlay-finished'))finishCurrent('html-complete')});
loadManifest();const events=new EventSource('/api/events');events.onmessage=e=>{try{handleMessage(JSON.parse(e.data))}catch(_){}};let seenTestSequence=0;async function pollTestRun(){try{const r=await fetch('/api/test-state?_='+Date.now(),{cache:'no-store'});if(r.ok){const t=await r.json();if(t.sequence>seenTestSequence){seenTestSequence=t.sequence;play(Number(t.slot),true)}}}catch(_){}setTimeout(pollTestRun,350)}pollTestRun();
</script></body></html>`;
}

function actionPage(packId, action) {
  const title = `${action.name} — ${ACTION_MANIFEST.packs.find(p=>p.id===packId)?.title || (packId === "custom" ? "Custom HTML Action" : "Action Pack")}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<>]/g,"")}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent}.idle{display:none}</style></head><body><iframe id="action" title="${title.replace(/["<>]/g,"")}" allow="autoplay"></iframe><script>const slotId=${action.slot};const pack=${JSON.stringify(packId)};const file=${JSON.stringify(action.filename)};const frame=document.getElementById('action');let lastRun=0;function play(){const now=Date.now();lastRun=now;frame.src='/action-file/'+encodeURIComponent(pack)+'/'+encodeURIComponent(file)+'?run='+now}if(new URLSearchParams(location.search).get('preview')==='1')play();const events=new EventSource('/api/events');events.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.type==='action-test'&&Number(msg.slot)===slotId){play();return;}if(msg.type!=='tip'||!msg.event)return;const ev=msg.event;if(!Array.isArray(ev.activated_slots)||!ev.activated_slots.includes(slotId))return;const now=Date.now();if(now-lastRun<900)return;play();}catch(_){}};</script></body></html>`;
}
let queueState={current:null,queued:[],limit:100,updatedAt:Date.now()};
const server = http.createServer(async (req,res)=>{
  if (req.method==="OPTIONS") { res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"});return res.end(); }
  const url = new URL(req.url,`http://${req.headers.host||HOST}`);
  if (url.pathname==="/") {res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(dashboard);}
  if (url.pathname==="/index.html" || url.pathname==="/obs.html") {res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(masterOverlayPage());}
  if (url.pathname==="/overlay" || /^\/overlay\/\d+$/.test(url.pathname)) {res.writeHead(200,{"content-type":"text/html; charset=utf-8"});return res.end(overlayHtml);}
  if (url.pathname==="/api/action-packs") return json(res,200,ACTION_MANIFEST);
  const actionMatch=url.pathname.match(/^\/action\/(halloween|daily)\/(\d+)$/i);
  if (actionMatch) {
    const pack=ACTION_MANIFEST.packs.find(p=>p.id===actionMatch[1]);
    const action=pack?.actions.find(a=>a.id===Number(actionMatch[2]));
    if(!action)return json(res,404,{ok:false,error:"Action pack item not found."});
    const slot=config.slots.find(s=>s.id===action.slot);
    if(slot?.customHtml) { const custom={id:action.id,slot:action.slot,filename:`slot-${action.slot}.html`,name:slot.label||action.name};res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(actionPage("custom",custom)); }
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(actionPage(pack.id,action));
  }
  const customActionMatch=url.pathname.match(/^\/action\/custom\/(\d+)$/i);
  if(customActionMatch) {
    const id=Number(customActionMatch[1]); const slot=config.slots.find(s=>s.id===id);
    if(!slot || !slot.customHtml) return json(res,404,{ok:false,error:"No custom HTML assigned to this action yet."});
    const action={id,slot:id,filename:`slot-${id}.html`,name:slot.label||`Custom Action ${id}`};
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(actionPage("custom",action));
  }
  const fileMatch=url.pathname.match(/^\/action-file\/([a-z0-9_-]+)\/([^/]+)$/i);
  if(fileMatch && fileMatch[1]==="custom") {
    const name=decodeURIComponent(fileMatch[2]);
    if(!/^slot-(?:[1-9]|1\d|20)\.html$/.test(name)) return json(res,404,{ok:false,error:"Custom action file not found."});
    const file=path.join(DATA,"custom-actions",name);
    if(!fs.existsSync(file)) return json(res,404,{ok:false,error:"Custom action file not found."});
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});return res.end(fs.readFileSync(file));
  }
  if(fileMatch) {
    const pack=ACTION_MANIFEST.packs.find(p=>p.id===fileMatch[1]);
    const filename=decodeURIComponent(fileMatch[2]);
    const action=pack?.actions.find(a=>a.filename===filename);
    if(!action)return json(res,404,{ok:false,error:"Action HTML file not found."});
    const file=pack.custom
      ? path.join(DATA,"custom-packs",pack.id,filename)
      : path.join(ACTION_PACKS_DIR,pack.folder,filename);
    if(!fs.existsSync(file))return json(res,404,{ok:false,error:"Action HTML file not found on disk."});
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});return res.end(fs.readFileSync(file));
  }
  if (url.pathname==="/api/active-pack" && req.method==="POST") {
    try {const b=await body(req);const id=String(b.id||"");if(!ACTION_MANIFEST.packs.some(p=>p.id===id))return json(res,400,{ok:false,error:"Choose a valid action pack."});config.activePack=id;saveConfig();broadcast({type:"config",status:status()});return json(res,200,{ok:true,activePack:id,title:ACTION_MANIFEST.packs.find(p=>p.id===id).title});}
    catch(e){return json(res,400,{ok:false,error:e.message});}
  }
  if (url.pathname==="/api/packs/import" && req.method==="POST") {
    try {
      const b=await body(req); const title=String(b.title||"Imported HTML Pack").trim().slice(0,60);
      const encoded=String(b.zipBase64||"");
      if(!encoded || encoded.length>30000000) return json(res,400,{ok:false,error:"Choose a valid ZIP pack under 20 MB."});
      const zip=new AdmZip(Buffer.from(encoded,"base64"));
      const htmlEntries=zip.getEntries().filter(e=>!e.isDirectory && /\.html?$/i.test(e.entryName) && !e.entryName.split("/").some(part=>part===".." || part==="__MACOSX"));
      const mapped=new Map();
      for(const entry of htmlEntries) {
        const name=entry.entryName.replace(/\\/g,"/");
        let slot=null;
        let m=name.match(/(?:^|\/)action-(\d{1,2})\/(?:overlay|index)\.html$/i);
        if(m) slot=Number(m[1]);
        if(!slot) { m=name.match(/(?:^|\/)(?:action[-_ ]?)?(\d{1,2})[^/]*\.html?$/i); if(m) slot=Number(m[1]); }
        if(slot>=1 && slot<=20 && !mapped.has(slot)) mapped.set(slot,entry);
      }
      if(mapped.size!==20) return json(res,400,{ok:false,error:`This ZIP must contain one HTML file for each of 20 actions. Found ${mapped.size}/20 numbered actions. Use action-01/overlay.html folders or filenames beginning with 01 through 20.`});
      const slugBase=title.toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,36)||"custom-pack";
      let id=slugBase,n=2; while(ACTION_MANIFEST.packs.some(p=>p.id===id)) id=`${slugBase}-${n++}`;
      const folder=path.join(DATA,"custom-packs",id);fs.mkdirSync(folder,{recursive:true});
      const actions=[];
      for(let i=1;i<=20;i++) {
        const entry=mapped.get(i);if(entry.header.size>900000)throw new Error(`Action ${i} is larger than 900 KB.`);const content=entry.getData();
        if(content.length>900000) throw new Error(`Action ${i} is larger than 900 KB.`);
        const text=content.toString("utf8");
        if(!/<html[\s>]/i.test(text)) throw new Error(`Action ${i} is not a valid HTML document.`);
        const filename=`slot-${String(i).padStart(2,"0")}.html`;
        fs.writeFileSync(path.join(folder,filename),content);
        const parent=path.posix.dirname(entry.entryName.replace(/\\/g,"/"));
        const metaEntry=zip.getEntry(`${parent}/action.json`);
        let meta={};try{if(metaEntry)meta=JSON.parse(metaEntry.getData().toString("utf8").replace(/^\uFEFF/,""))}catch{}
        actions.push({id:i,slot:i,filename,name:String(meta.name||meta.label||path.basename(entry.entryName).replace(/\.html?$/i,"")).slice(0,60)});
      }
      const pack={id,title,folder:id,custom:true,actions};
      ACTION_MANIFEST.packs.push(pack);saveUserPacks();
      return json(res,200,{ok:true,pack:{id,title,actions:actions.length},packs:ACTION_MANIFEST.packs.map(p=>({id:p.id,title:p.title,actions:p.actions,custom:!!p.custom}))});
    } catch(e) { return json(res,400,{ok:false,error:`Could not import pack: ${e.message}`}); }
  }
  if (url.pathname==="/api/packs/export" && req.method==="POST") {
    try {
      const b=await body(req);const title=String(b.title||"My 20-Action Pack").trim().slice(0,60)||"My 20-Action Pack";
      const packId=String(b.packId||"daily");const selected=ACTION_MANIFEST.packs.find(p=>p.id===packId)||ACTION_MANIFEST.packs.find(p=>p.id===ACTION_MANIFEST.defaultPack);
      const zip=new AdmZip();const actions=[];
      for(let i=1;i<=20;i++) {
        const slot=config.slots.find(s=>s.id===i);
        let html;
        if(slot?.customHtml) {
          const customPath=path.join(DATA,"custom-actions",`slot-${i}.html`);
          if(fs.existsSync(customPath)) html=fs.readFileSync(customPath);
        }
        const action=selected?.actions.find(a=>Number(a.slot)===i);
        if(!html && action) {
          const file=selected.custom?path.join(DATA,"custom-packs",selected.id,action.filename):path.join(ACTION_PACKS_DIR,selected.folder,action.filename);
          if(fs.existsSync(file)) html=fs.readFileSync(file);
        }
        if(!html) throw new Error(`Could not resolve HTML for action ${i}.`);
        const filename=`actions/action-${String(i).padStart(2,"0")}/overlay.html`;
        zip.addFile(filename,html);
        const meta={id:i,slot:i,name:slot?.label||action?.name||`Action ${i}`,enabled:slot?.enabled!==false,minTokens:slot?.minTokens||1,maxTokens:slot?.maxTokens||0,durationMs:slot?.durationMs||6000,matchText:slot?.matchText||""};
        zip.addFile(`actions/action-${String(i).padStart(2,"0")}/action.json`,Buffer.from(JSON.stringify(meta,null,2)));
        actions.push(meta);
      }
      zip.addFile("pack.json",Buffer.from(JSON.stringify({name:title,version:1,actions},null,2)));
      const buf=zip.toBuffer();
      return json(res,200,{ok:true,filename:title.replace(/[^a-z0-9_-]+/gi,"-")+".zip",zipBase64:buf.toString("base64")});
    } catch(e) { return json(res,400,{ok:false,error:`Could not export pack: ${e.message}`}); }
  }
  if (url.pathname==="/health") return json(res,200,{ok:true});
  if (url.pathname==="/api/status") return json(res,200,status());
  if (url.pathname==="/api/events") {
    res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache","connection":"keep-alive","access-control-allow-origin":"*"});
    res.write(`data: ${JSON.stringify({type:"status",status:status()})}\n\n`);
    clients.add(res);req.on("close",()=>clients.delete(res));return;
  }
  if (url.pathname==="/api/model" && req.method==="POST") {
    try {const b=await body(req);const model=canonicalRoom(b.username||"");
      if (!validRoom(model)) return json(res,400,{ok:false,error:"Enter a valid Chaturbate username or room URL."});
      if (apiRunning) stopEventsApi();
      config.model=model.toLowerCase();config.locked=false;saveConfig();
      return json(res,200,{ok:true,model:config.model,locked:false});
    } catch(e){return json(res,400,{ok:false,error:e.message});}
  }
  if (url.pathname==="/api/lock" && req.method==="POST") {
    try {const b=await body(req); if(!config.model) return json(res,409,{ok:false,error:"Choose a model first."});
      if(b.locked===false){config.locked=false;stopEventsApi();saveConfig();broadcast({type:"status",status:status()});return json(res,200,{ok:true,locked:false});}
      config.locked=true;saveConfig();broadcast({type:"status",status:status()});return json(res,200,{ok:true,locked:true,model:config.model});
    } catch(e){return json(res,400,{ok:false,error:e.message});}
  }
  if (url.pathname==="/api/slots" && req.method==="POST") {
    try {const b=await body(req);const id=Number(b.id);if(!Number.isInteger(id)||id<1||id>20)return json(res,400,{ok:false,error:"Slot ID must be 1–20."});
      const old=config.slots.find(s=>s.id===id);
      const next={...old,enabled:!!b.enabled,label:String(b.label||`Overlay ${id}`).slice(0,60),minTokens:Math.max(1,Math.min(1000000,Math.floor(Number(b.minTokens)||1))),maxTokens:Math.max(0,Math.min(1000000,Math.floor(Number(b.maxTokens)||0))),matchText:String(b.matchText||"").slice(0,80),durationMs:Math.max(1000,Math.min(60000,Math.floor(Number(b.durationMs)||6000))),animation:["cash","glow","confetti","pulse","banner"].includes(b.animation)?b.animation:"cash",color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:"#39a9ff"};
      config.slots=config.slots.map(s=>s.id===id?next:s);saveConfig();broadcast({type:"config",status:status()});return json(res,200,{ok:true,slot:next});
    }catch(e){return json(res,400,{ok:false,error:e.message});}
  }
  if (url.pathname==="/api/action-html" && req.method==="POST") {
    try {
      const b=await body(req); const id=Number(b.id); const name=String(b.name||"custom-action.html").split(/[\\/]/).pop().slice(0,180); const content=String(b.content||"");
      if(!Number.isInteger(id)||id<1||id>20) return json(res,400,{ok:false,error:"Action number must be 1–20."});
      if(!content.trim() || content.length>900000 || !/<html[\s>]/i.test(content)) return json(res,400,{ok:false,error:"Choose a valid HTML file under 900 KB."});
      const dir=path.join(DATA,"custom-actions"); fs.mkdirSync(dir,{recursive:true}); const filename=`slot-${id}.html`; fs.writeFileSync(path.join(dir,filename),content,"utf8");
      const old=config.slots.find(s=>s.id===id); const next={...old,customHtml:true,customFilename:name,label:String(b.label||name.replace(/\.html?$/i,"")).slice(0,60)};
      config.slots=config.slots.map(s=>s.id===id?next:s); saveConfig(); broadcast({type:"config",status:status()});
      return json(res,200,{ok:true,id,filename:name,label:next.label,url:`http://${HOST}:${PORT}/action/custom/${id}`});
    } catch(e) { return json(res,400,{ok:false,error:e.message}); }
  }
  if (url.pathname==="/api/action-reset" && req.method==="POST") {
    try { const b=await body(req); const id=Number(b.id); if(!Number.isInteger(id)||id<1||id>20)return json(res,400,{ok:false,error:"Action number must be 1–20."});
      const old=config.slots.find(s=>s.id===id); const next={...old,customHtml:false,customFilename:""}; config.slots=config.slots.map(s=>s.id===id?next:s);saveConfig();broadcast({type:"config",status:status()});return json(res,200,{ok:true,id,message:`Action ${id} restored to the selected included pack.`});
    } catch(e) { return json(res,400,{ok:false,error:e.message}); }
  }
  if (url.pathname==="/api/test-state" && req.method==="GET") return json(res,200,lastTestAction);
  if (url.pathname==="/api/stop-action" && req.method==="POST") { broadcast({type:"action-stop",at:Date.now()}); return json(res,200,{ok:true,message:"Stop command sent. The active overlay has been cleared."}); }
  if (url.pathname==="/api/clear-queue" && req.method==="POST") { broadcast({type:"action-clear-queue",at:Date.now()}); return json(res,200,{ok:true,message:"Waiting actions cleared. The current action continues."}); }
  if (url.pathname==="/api/queue-state" && req.method==="POST") { try { const b=await body(req); queueState={current:b.current||null,queued:Array.isArray(b.queued)?b.queued.slice(0,100):[],limit:Math.min(100,Number(b.limit)||100),updatedAt:Date.now()}; return json(res,200,{ok:true}); } catch(e) { return json(res,400,{ok:false,error:e.message}); } }
  if (url.pathname==="/api/queue-state" && req.method==="GET") return json(res,200,queueState);
  if (url.pathname==="/api/test-action" && req.method==="POST") {
    try { const b=await body(req); const id=Number(b.id); const slot=config.slots.find(s=>s.id===id); if(!slot) return json(res,400,{ok:false,error:"Action number must be 1–20."});
      // Local Test Run is a preview action and must work even before the model is locked.
      // Model lock is still required by acceptTip() for real Chaturbate tips.
      lastTestAction={sequence:lastTestAction.sequence+1,slot:id,at:Date.now()}; broadcast({type:"action-test",slot:id,at:lastTestAction.at}); return json(res,200,{ok:true,slot:id,sequence:lastTestAction.sequence,message:`Test Run queued for action ${id}.`});
    } catch(e) { return json(res,400,{ok:false,error:e.message}); }
  }
  if (url.pathname==="/api/test-tip" && req.method==="POST") {
    if (!config.locked) return json(res,409,{ok:false,error:"Lock a model first."});
    const b=await body(req).catch(()=>({}));
    const result=await acceptTip({room:config.model,username:String(b.username||"OverlayTest"),amount:Math.max(1,Math.floor(Number(b.amount)||25)),event_id:`test-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`,timestamp:new Date().toISOString(),message:String(b.message||"test tip")},"test");
    return json(res,result.ok?200:422,result);
  }
  if (url.pathname==="/api/connect" && req.method==="POST") {
    const b=await body(req).catch(()=>({}));
    const token=String(b.token||"").trim();
    if(!config.locked) return json(res,409,{ok:false,error:"Lock a model before connecting."});
    if(!token) return json(res,400,{ok:false,error:"Events API is optional. Paste a valid Events API token only if you want to use it as a secondary source."});
    stopEventsApi();apiToken=token;apiAbort=false;pollEventsApi();
    return json(res,200,{ok:true,status:"CONNECTING",tokenStored:false});
  }
  if (url.pathname==="/api/disconnect" && req.method==="POST") {stopEventsApi();return json(res,200,{ok:true});}
  if (url.pathname==="/api/overlay-config") {
    const id=Number(url.searchParams.get("id")||url.pathname.split("/").pop());
    const slot=config.slots.find(s=>s.id===id);
    if(!slot)return json(res,404,{ok:false,error:"Overlay slot not found."});
    return json(res,200,{slot,model:config.model,locked:config.locked});
  }
  if (url.pathname==="/api/tip" && req.method==="POST") {
    const b=await body(req).catch(()=>({}));
    const result=await acceptTip(b,"extension");
    return json(res,result.ok?200:422,result);
  }
  if (url.pathname==="/api/extension-status") return json(res,200,{model:config.model,locked:config.locked});
  res.writeHead(404,{"content-type":"text/plain"});res.end("Not found");
});
server.listen(PORT,HOST,()=>console.log(`Chaturbate 20-Overlay Bridge running at http://${HOST}:${PORT}`));
