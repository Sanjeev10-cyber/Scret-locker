// js/app.js
const fileReal = document.getElementById('fileReal');
const fileDecoy = document.getElementById('fileDecoy');
const display = document.getElementById('display');
const stage = document.getElementById('stage');
const setupBtn = document.getElementById('setupBtn');
const lockBtn = document.getElementById('lockBtn');
const tryBtn = document.getElementById('tryBtn');
const clearBtn = document.getElementById('clearBtn');
const msg = document.getElementById('msg');

let realDataURL = null;
let decoyDataURL = null;
let mode = 'idle'; // 'setup'|'try'
let taps = [];
let secretPoints = null;
const STORAGE_KEY = 'secret_locked_image_v1';

// Helpers
const showMsg = t => msg.textContent = t || '';
const readFileAsDataURL = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = e => res(e.target.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});
const normCoord = e => {
  const rect = display.getBoundingClientRect();
  let x = (e.clientX - rect.left) / rect.width;
  let y = (e.clientY - rect.top) / rect.height;
  x = Math.min(Math.max(x,0),1); y = Math.min(Math.max(y,0),1);
  return {x,y};
};
function drawDots(arr){
  document.querySelectorAll('.dot').forEach(d=>d.remove());
  arr.forEach(p=>{
    const d = document.createElement('div');
    d.className = 'dot';
    d.style.left = (p.x*100)+'%';
    d.style.top = (p.y*100)+'%';
    stage.appendChild(d);
  });
}

// Crypto helpers
async function deriveKeyFromPoints(points){
  const s = points.map(p=> (p.x.toFixed(4)+','+p.y.toFixed(4)) ).join('|');
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const key = await crypto.subtle.importKey('raw', hash, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
  return key;
}
async function encryptData(key, dataURL){
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const arr = new Uint8Array(await blob.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, arr);
  return {iv: Array.from(iv), ct: Array.from(new Uint8Array(ct))};
}
async function decryptData(key, ivArr, ctArr){
  const iv = new Uint8Array(ivArr);
  const ct = new Uint8Array(ctArr).buffer;
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
  const blob = new Blob([plain]);
  return await new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = e => res(e.target.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

// UI events
fileReal.addEventListener('change', async ev => {
  const f = ev.target.files[0]; if(!f) return;
  realDataURL = await readFileAsDataURL(f);
  showMsg('Real image loaded.');
});
fileDecoy.addEventListener('change', async ev => {
  const f = ev.target.files[0]; if(!f) return;
  decoyDataURL = await readFileAsDataURL(f);
  display.src = decoyDataURL;
  showMsg('Decoy set.');
});

setupBtn.addEventListener('click', ()=>{
  if(!decoyDataURL || !realDataURL){ showMsg('Upload both real and decoy first.'); return; }
  mode='setup'; taps=[]; secretPoints=null; drawDots([]);
  showMsg('Setup: Tap the image in 4 places (order matters).');
});

stage.addEventListener('click', async e=>{
  if(mode!=='setup' && mode!=='try') return;
  if(!display.src){ showMsg('No image displayed. Set decoy first.'); return; }
  const p = normCoord(e);
  taps.push(p);
  drawDots(taps);
  if(mode==='setup'){
    showMsg(`Tapped ${taps.length}/4`);
    if(taps.length===4){
      secretPoints = taps.slice();
      taps=[];
      mode='idle';
      showMsg('4 points recorded. Click "Lock / Save".');
    }
  } else if(mode==='try'){
    showMsg(`Try taps ${taps.length}/4`);
    if(taps.length===4){
      const ok = await attemptUnlock(taps);
      if(ok) showMsg('Unlocked!');
      else showMsg('Wrong taps.');
      taps=[]; drawDots([]); mode='idle';
    }
  }
});

lockBtn.addEventListener('click', async ()=>{
  if(!realDataURL || !decoyDataURL){ showMsg('Upload both images first.'); return; }
  if(!secretPoints){ showMsg('No secret recorded. Press "Setup secret" first.'); return; }
  showMsg('Encrypting...');
  try{
    const key = await deriveKeyFromPoints(secretPoints);
    const enc = await encryptData(key, realDataURL);
    const payload = {decoy: decoyDataURL, iv: enc.iv, ct: enc.ct, created: Date.now()};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    display.src = decoyDataURL;
    showMsg('Locked and saved locally.');
  }catch(err){
    console.error(err);
    showMsg('Lock failed: ' + (err.message || err));
  }
});

tryBtn.addEventListener('click', ()=> {
  if(!localStorage.getItem(STORAGE_KEY)){ showMsg('Nothing locked yet.'); return; }
  mode='try'; taps=[]; showMsg('Try mode: Tap 4 places to unlock.');
});

clearBtn.addEventListener('click', ()=>{
  localStorage.removeItem(STORAGE_KEY);
  realDataURL = null; decoyDataURL = null; secretPoints = null; taps = [];
  display.src = '';
  drawDots([]);
  showMsg('Cleared local data.');
});

async function attemptUnlock(attemptPoints){
  const stored = localStorage.getItem(STORAGE_KEY); if(!stored) return false;
  const obj = JSON.parse(stored);
  display.src = obj.decoy;
  try{
    const key = await deriveKeyFromPoints(attemptPoints);
    const dataURL = await decryptData(key, obj.iv, obj.ct);
    display.src = dataURL;
    return true;
  }catch(e){
    display.src = obj.decoy;
    return false;
  }
}

// On load, if stored, show decoy
(function init(){
  const s = localStorage.getItem(STORAGE_KEY);
  if(s){ display.src = JSON.parse(s).decoy; showMsg('Locked item found. Use Try Unlock.'); }
})();￼Enter
