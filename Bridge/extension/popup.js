const $=id=>document.getElementById(id);
async function load(){
 const saved=await chrome.storage.local.get(["lockedModel","lastRoomStatus"]);
 $('model').value=saved.lockedModel||"";
 render(saved.lastRoomStatus,saved.lockedModel);
}
function render(s,lockedModel){
 const box=$('status'),fix=$('fix');
 box.className='status';
 if(!s){
  box.textContent='🔴 NOT READY — No Chaturbate room detected.';
  fix.textContent='Fix: open your own Chaturbate room in a tab, then reopen this popup. Enter obsidian_stallion and click Lock selection.';
  return;
 }
 const room=(s.room||'').toLowerCase();
 const match=!!lockedModel && lockedModel.toLowerCase()===room;
 box.className='status '+(match?'good':'');
 box.textContent=match?`🟢 ROOM MATCH — ${room}\n${s.href||''}`:`🔴 ROOM MISMATCH — detected ${room||'(unknown)'}\nLocked: ${lockedModel||'(none)'}\n${s.href||''}`;
 fix.textContent=match
  ?'Room identity matches. Next: open the Bridge Dashboard, confirm the model is locked there too, keep this room tab open, and send a test tip. This green status confirms room identity only, not live tip delivery.'
  :'Fix: enter the exact username shown in the room URL (for example, obsidian_stallion), click Lock selection, then reload the Chaturbate room tab and reopen this popup. Make sure the URL is https://chaturbate.com/obsidian_stallion/.';
}
$('lock').onclick=async()=>{
 let model=$('model').value.trim();
 if(/^https?:\/\//i.test(model)){
  try{const u=new URL(model);if(!/(^|\.)chaturbate\.com$/i.test(u.hostname))throw new Error();const parts=u.pathname.split('/').filter(Boolean);if(parts[0]?.toLowerCase()==='b')parts.shift();model=parts[0]||'';}catch{model='';}
 }else{model=model.replace(/^\/+|\/+$/g,'');const parts=model.split('/');if(parts[0]?.toLowerCase()==='b')parts.shift();model=parts[0]||'';}
 model=model.toLowerCase();
 if(!/^[a-z0-9_]{1,64}$/.test(model)){ $('status').className='status';$('status').textContent='🔴 INVALID USERNAME';$('fix').textContent='Fix: enter a Chaturbate username only, without spaces. Example: obsidian_stallion';return;}
 await chrome.storage.local.set({lockedModel:model});
 const saved=await chrome.storage.local.get('lastRoomStatus');
 render(saved.lastRoomStatus,model);
};
$('unlock').onclick=async()=>{await chrome.storage.local.remove('lockedModel');$('status').className='status';$('status').textContent='🔴 UNLOCKED — room checks are not active.';$('fix').textContent='Fix: enter your room username and click Lock selection.'};
$('open').onclick=()=>chrome.tabs.create({url:'http://127.0.0.1:8788'});
load();