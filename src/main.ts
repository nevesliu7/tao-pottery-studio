import './style.css';
import { icon } from './icons';
import {ArtworkComposer} from './export';
import { ClayModel, History, PALETTE, HAND_CONNECTIONS, linearColor, mirroredPoint, pinchRatio, clamp } from './model';
import { PotteryScene } from './scene';
import { HandCamera, type Hand } from './camera';

const $ = <T extends HTMLElement = HTMLElement>(selector:string) => document.querySelector<T>(selector)!;
$('#app').innerHTML = `
<header class="topbar">
  <a class="brand" href="/" aria-label="TAO Studio home"><span class="brand-seal">${icon('pot')}</span><span class="brand-name">TAO Studio<span>TAO · POTTERY STUDIO</span></span></a>
  <div class="studio-nav"><span class="nav-active">Studio</span><span class="nav-separator"></span><span class="nav-note">A moment for your hands.</span></div>
  <div class="header-actions"><button class="quiet-button" id="help">${icon('help')}<span>How to create</span></button><button class="primary-button" id="save">${icon('save')}<span>Save artwork</span></button></div>
</header>
<main class="workbench">
  <section class="stage" aria-label="3D pottery workspace">
    <div class="window-light" aria-hidden="true"></div><div class="wall-grain" aria-hidden="true"></div>
    <div class="stage-intro"><div class="eyebrow"><span></span> YOUR MOMENT OF SLOW</div><h1>Take shape. Take your time.</h1><p>A little clay. A pair of hands. Something entirely yours.</p></div>
    <div class="connection-badge" id="connection"><span class="status-dot"></span><span id="connection-label">Mouse / touch mode</span></div>
    <canvas id="scene" aria-label="Editable 3D pottery. Choose Shape and drag the wall, or choose Glaze and brush the surface." tabindex="0"></canvas>
    <canvas id="hand-overlay" aria-hidden="true"></canvas>
    <div class="stage-hint" id="stage-hint">${icon('hand')}<span>Drag the wall inward to narrow it, outward to widen it.</span></div>
    <div class="piece-note"><span class="piece-line"></span><span>An untitled piece<small>Made by hand. Made your own.</small></span></div>
    <section class="camera-panel" id="camera-panel" aria-label="Camera and hand tracking">
      <div class="camera-header" id="camera-drag"><span>${icon('camera')}<b>Your hands</b></span><div><button id="camera-size" class="icon-button" aria-label="Enlarge camera preview" title="Resize preview">${icon('expand')}</button><span class="drag-grip" title="Drag to move">⠿</span></div></div>
      <div class="camera-view" id="camera-view">
        <video id="video" aria-hidden="true" muted playsinline autoplay></video><canvas id="camera-bones"></canvas>
        <div class="camera-placeholder" id="camera-placeholder">${icon('hand')}<span>Your hands are the tools.</span><small>Mouse and touch work too</small></div>
        <span class="hand-count" id="hand-count" hidden>0 / 2 hands</span>
      </div>
      <div class="camera-controls"><button id="camera-toggle" class="camera-toggle">${icon('camera')}<span>Enable camera</span></button><label class="mirror-control" title="Mirror video, hand landmarks and controls together"><input id="mirror" type="checkbox" checked/><span>Mirror</span></label></div>
      <div class="device-field"><select id="devices" aria-label="Select camera"><option value="">Allow access to list cameras</option></select></div>
      <p class="camera-message" id="camera-message" role="status" hidden></p>
      <p class="privacy">${icon('lock')}On-device · No recording or uploads</p>
    </section>
    <div id="render-error" class="render-error" hidden></div>
  </section>
  <aside class="glaze-panel" aria-label="Glazes and tool settings">
    <div class="panel-heading"><div class="eyebrow">THE GLAZE SHELF</div><h2>A touch of color.</h2><p>Quiet colors, made to last.</p></div>
    <div class="swatches" role="group" aria-label="Choose a glaze">${PALETTE.map((p,i)=>`<button class="swatch ${i===1?'selected':''}" style="--swatch:${p.hex}" data-color="${i}" aria-label="${p.name} glaze" aria-pressed="${i===1}"><span class="swatch-circle"><span>${icon('check')}</span></span><span class="swatch-name">${p.name}</span></button>`).join('')}</div>
    <div class="selected-glaze"><span id="selected-name">Celadon</span><span id="selected-english">Celadon</span><i id="selected-dot" style="background:#86a59b"></i></div>
    <button id="fill" class="outline-button">${icon('sparkle')}Glaze all</button>
    <div class="setting-group"><label class="setting-label">Finish</label><div class="finish-options" role="group" aria-label="Finish"><button id="gloss" aria-pressed="true" class="active">Glossy</button><button id="matte" aria-pressed="false">Matte</button></div></div>
    <div class="setting-group brush-setting"><label class="setting-label" for="brush-size"><span id="brush-label">Shaping area</span><output id="brush-output">Medium</output></label><input id="brush-size" type="range" min="15" max="55" value="32"/><div class="range-labels"><span>Fine</span><span>Broad</span></div></div>
    <div class="shelf-note">${icon('sun')}<p>Take it slowly.<br/>Your touch is part of the piece.</p></div>
  </aside>
</main>
<footer class="toolbar">
  <div class="history-controls"><button id="undo" class="quiet-button" disabled title="Undo · ⌘ / Ctrl + Z">${icon('undo')}<span>Undo</span></button><button id="reset" class="quiet-button">${icon('reset')}<span>Start over</span></button></div>
  <div class="mode-switch" role="group" aria-label="Pottery tools"><button id="shape-mode" class="active" aria-pressed="true">${icon('hand')}<span>Shape</span><kbd>1</kbd></button><button id="paint-mode" aria-pressed="false">${icon('brush')}<span>Glaze</span><kbd>2</kbd></button></div>
  <div class="wheel-control"><span class="wheel-label"><i></i>Slow wheel</span><button id="rotation" class="quiet-button" aria-pressed="false">${icon('pause')}<span>Pause</span></button></div>
</footer>
<div id="toast" role="status" aria-live="polite"></div>
<dialog id="guide-dialog"><button class="dialog-close icon-button" data-close aria-label="Close guide">${icon('close')}</button><div class="eyebrow">A LITTLE GUIDANCE</div><h2>Let your hands lead.</h2><div class="guide-grid"><article>${icon('hand')}<h3>Shape your piece</h3><p>Choose Shape and drag the wall sideways. Push toward the center to narrow it; pull outward to widen it. Work at different heights to create a curve.</p></article><article>${icon('brush')}<h3>Find your glaze</h3><p>Choose Glaze and a color, then brush the surface. The wheel carries color around the piece. Glaze all covers the entire pot.</p></article><article>${icon('camera')}<h3>Bring in your hands</h3><p>Enable your camera and bring your hands into view. Pinch your thumb and index finger near the pot to shape or glaze. Release to stop. Both hands can shape together.</p></article><article>${icon('move')}<h3>Get comfortable</h3><p>Drag the camera header to move the preview; resize it with the corner button. Mirror keeps video and controls aligned. On a phone, try landscape.</p></article></div><p class="guide-privacy">${icon('lock')}Video stays in this browser. It is never recorded or uploaded. The first camera session loads the on-device hand model.</p><div class="shortcuts"><span><kbd>1</kbd> Shape</span><span><kbd>2</kbd> Glaze</span><span><kbd>Space</kbd> Pause wheel</span><span><kbd>⌘ / Ctrl Z</kbd> Undo</span></div><button data-close class="primary-button">Start creating ${icon('hand')}</button></dialog>
<dialog id="reset-dialog"><div class="eyebrow">A FRESH PIECE OF CLAY</div><h2>Start with fresh clay?</h2><p>This resets the shape and glaze. You can undo it to recover your current piece.</p><div class="dialog-actions"><button class="outline-button" data-close>Keep this piece</button><button class="primary-button" id="confirm-reset">Start over</button></div></dialog>
`;

const model=new ClayModel();const history=new History(model);
let scene: PotteryScene;
try { scene=new PotteryScene($('#scene'),model); }
catch { $('#render-error').hidden=false;$('#render-error').textContent='Could not start the 3D canvas. Enable hardware acceleration or open a browser with WebGL 2 support.';throw new Error('WebGL renderer unavailable'); }
let mode: 'shape'|'paint'='shape';let selected=1;let brush=.32;
let toastTimer=0;
function toast(text:string) {$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('#toast').classList.remove('show'),2800);}
function updateUndo() {$('#undo').toggleAttribute('disabled',history.length===0);}
function commit() {history.commit();updateUndo();}
function setMode(next: typeof mode) {
  finishPointer();releaseHands();mode=next;
  for(const n of ['shape','paint']) {$(`#${n}-mode`).classList.toggle('active',n===mode);$(`#${n}-mode`).setAttribute('aria-pressed',String(n===mode));}
  $('#brush-label').textContent=mode==='shape'?'Shaping area':'Brush size';
  $('#stage-hint').innerHTML=`${icon(mode==='shape'?'hand':'brush')}<span>${mode==='shape'?'Drag the wall inward to narrow it, outward to widen it.':'Brush the surface. Let the wheel carry the color around.'}</span>`;
  $('#scene').classList.toggle('painting',mode==='paint');
}
$('#shape-mode').onclick=()=>setMode('shape');$('#paint-mode').onclick=()=>setMode('paint');
document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button=>button.onclick=()=>{
  selected=Number(button.dataset.color);const p=PALETTE[selected];
  document.querySelectorAll('[data-color]').forEach(b=>{const is=b===button;b.classList.toggle('selected',is);b.setAttribute('aria-pressed',String(is));});
  $('#selected-name').textContent=p.name;$('#selected-english').textContent=p.english;$('#selected-dot').style.background=p.hex;
  setMode('paint');
});
$('#fill').onclick=()=>{finishPointer();releaseHands();history.begin();model.fill(linearColor(PALETTE[selected].hex));commit();toast(`Applied ${PALETTE[selected].name} to the whole piece`);};
for(const name of ['gloss','matte']) $(`#${name}`).onclick=()=>{scene.setFinish(name==='gloss');for(const n of ['gloss','matte']) {$(`#${n}`).classList.toggle('active',name===n);$(`#${n}`).setAttribute('aria-pressed',String(name===n));}};
$('#brush-size').oninput=e=>{brush=Number((e.target as HTMLInputElement).value)/100;$('#brush-output').textContent=brush<.25?'Fine':brush>.42?'Broad':'Medium';};
function updateRotation() {$('#rotation').innerHTML=`${icon(scene.rotating?'pause':'play')}<span>${scene.rotating?'Pause':'Resume'}</span>`;$('#rotation').setAttribute('aria-pressed',String(!scene.rotating));$('.wheel-label').classList.toggle('paused',!scene.rotating);}
$('#rotation').onclick=()=>{scene.rotating=!scene.rotating;updateRotation();};updateRotation();
$('#undo').onclick=()=>{finishPointer();releaseHands();if(history.undo()){updateUndo();toast('Last step undone');}};
$('#help').onclick=()=>$<HTMLDialogElement>('#guide-dialog').showModal();
$('#reset').onclick=()=>$<HTMLDialogElement>('#reset-dialog').showModal();
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
document.querySelectorAll('dialog').forEach(d=>d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('#confirm-reset').onclick=()=>{finishPointer();releaseHands();history.begin();model.reset();commit();($('#reset-dialog') as HTMLDialogElement).close();toast('Fresh clay. A fresh start.');};
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,select,textarea,button')||document.querySelector('dialog[open]'))return;
  if(e.key==='1')setMode('shape');if(e.key==='2')setMode('paint');
  if(e.code==='Space'){e.preventDefault();$('#rotation').click();}
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();$('#undo').click();}
});

type Stroke={id:number;x:number;y:number;lastX:number;hitY:number;side:number};
let pointer:Stroke|null=null;
const canvas=$<HTMLCanvasElement>('#scene');
function position(e:PointerEvent){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
canvas.onpointerdown=e=>{
  if(e.button!==0||pointer||document.querySelector('dialog[open]'))return;
  const p=position(e);const hit=scene.nearSurface(p.x,p.y);if(!hit)return;
  e.preventDefault();releaseHands();canvas.setPointerCapture(e.pointerId);history.begin();
  pointer={id:e.pointerId,...p,lastX:p.x,hitY:hit.y,side:hit.side};canvas.classList.add('dragging');
  if(mode==='paint')model.paint(hit.y,hit.angle,linearColor(PALETTE[selected].hex),brush,.65);
};
canvas.onpointermove=e=>{
  const p=position(e);scene.showCursor(p.x,p.y,brush*.6,mode==='shape'?'#a76543':PALETTE[selected].hex);
  if(!pointer||e.pointerId!==pointer.id)return;
  if(mode==='shape')model.shape(pointer.hitY,scene.worldDelta(p.x-pointer.lastX)*pointer.side,brush);
  pointer.x=p.x;pointer.y=p.y;pointer.lastX=p.x;
};
function finishPointer(){if(pointer){if(canvas.hasPointerCapture(pointer.id))canvas.releasePointerCapture(pointer.id);pointer=null;commit();}canvas.classList.remove('dragging');}
canvas.onpointerup=finishPointer;canvas.onpointercancel=finishPointer;canvas.onlostpointercapture=finishPointer;
canvas.onpointerleave=()=>{if(!pointer)scene.hideCursor();};

const camera=new HandCamera($('#video'),$('#camera-bones'));
const cameraToggle=$<HTMLButtonElement>('#camera-toggle');const deviceSelect=$<HTMLSelectElement>('#devices');
camera.onStatus=(message,state)=>{
  const connected=state==='on',loading=state==='loading';
  $('#camera-panel').classList.toggle('connected',connected||loading);
  $('#camera-placeholder').hidden=connected||loading;
  $('#hand-count').hidden=!connected;
  cameraToggle.innerHTML=`${icon(connected||loading?'close':'camera')}<span>${connected?'Disable camera':loading?'Cancel':'Enable camera'}</span>`;
  deviceSelect.disabled=loading;
  $('#camera-message').hidden=state==='off'||connected;$('#camera-message').textContent=message;
  $('#camera-message').classList.toggle('error',state==='error');
  $('#connection').classList.toggle('live',connected);$('#connection-label').textContent=connected?'Hand tracking · On-device':loading?'Connecting camera…':'Mouse / touch mode';
};
camera.onDevices=(devices,current)=>{
  const old=deviceSelect.value;deviceSelect.replaceChildren();
  if(!devices.length){deviceSelect.add(new Option('No camera found',''));return;}
  devices.forEach((d,i)=>deviceSelect.add(new Option(d.label||`Camera ${i+1}${!d.deviceId?' · Access needed':''}`,d.deviceId)));
  if(current&&devices.some(d=>d.deviceId===current))deviceSelect.value=current;else if(devices.some(d=>d.deviceId===old))deviceSelect.value=old;
};
cameraToggle.onclick=()=>{if(camera.active||camera.busy)camera.stop();else void camera.start(deviceSelect.value||undefined);};
deviceSelect.onchange=()=>{if(camera.active||camera.busy)void camera.start(deviceSelect.value||undefined);};
$('#mirror').onchange=e=>{releaseHands();camera.setMirror((e.target as HTMLInputElement).checked);};camera.setMirror(true);
void camera.refreshDevices();

type HandStroke={x:number;y:number;hitY:number;side:number;pinched:boolean;engaged:boolean;points:{x:number;y:number}[];label:string};
const handStrokes=new Map<number,HandStroke>();
let latestHands:Hand[]=[];
function releaseHands(){const hadStroke=[...handStrokes.values()].some(h=>h.engaged);handStrokes.clear();if(hadStroke&&!pointer)commit();}
camera.onHands=hands=>{latestHands=hands;$('#hand-count').textContent=`${hands.length} / 2 hands`;if(!hands.length)releaseHands();};
const overlay=$<HTMLCanvasElement>('#hand-overlay');
function updateHands(dt:number){
  const w=canvas.clientWidth,h=canvas.clientHeight;const dpr=Math.min(window.devicePixelRatio,2);
  if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);}
  const ctx=overlay.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!camera.active||document.querySelector('dialog[open]')){releaseHands();return;}
  const seen=new Set<number>();let activeCount=0;
  for(const hand of latestHands){
    seen.add(hand.id);const old=handStrokes.get(hand.id);
    const points=hand.points.map(p=>{const m=mirroredPoint(p,camera.mirrored);return scene.handPoint(m.x,m.y);});
    const ratio=pinchRatio(hand.points);const pinched=ratio<(old?.pinched?.66:.43);
    const target={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
    const x=old?old.x+(target.x-old.x)*.42:target.x;const y=old?old.y+(target.y-old.y)*.42:target.y;
    let engaged=old?.engaged??false,hitY=old?.hitY??0,side=old?.side??1;
    if(pinched&&!engaged&&!pointer){const hit=scene.nearSurface(x,y);if(hit){engaged=true;hitY=hit.y;side=hit.side;history.begin();}}
    if(!pinched)engaged=false;
    if(engaged&&!pointer){activeCount++;
      if(mode==='shape'&&old?.engaged&&Math.abs(x-old.x)>.55)model.shape(hitY,scene.worldDelta(x-old.x)*side*.72,brush);
      if(mode==='paint'){const hit=scene.hit(x,y);if(hit)model.paint(hit.y,hit.angle,linearColor(PALETTE[selected].hex),brush,Math.min(dt*9,.4));}
    }
    handStrokes.set(hand.id,{x,y,hitY,side,pinched,engaged,points,label:hand.label});
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1.7;ctx.strokeStyle=engaged?'rgba(174,107,68,.78)':'rgba(102,165,152,.65)';ctx.fillStyle=engaged?'#dba77b':'#c0ede0';ctx.shadowBlur=8;ctx.shadowColor='#eefff8';
    for(const [a,b] of HAND_CONNECTIONS){ctx.beginPath();ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);ctx.stroke();}
    for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,2.6,0,Math.PI*2);ctx.fill();}
    ctx.shadowBlur=0;ctx.beginPath();ctx.arc(x,y,engaged?12:8,0,Math.PI*2);ctx.stroke();
    ctx.font='11px system-ui';ctx.fillStyle='#58796e';ctx.fillText(`${hand.label} · ${engaged?(mode==='shape'?'Shaping':'Glazing'):pinched?'Move to the pot':'Pinch to start'}`,points[0].x-24,points[0].y+20);
  }
  for(const id of handStrokes.keys())if(!seen.has(id))handStrokes.delete(id);
  if(!activeCount&&!pointer)commit();
}
scene.onFrame=dt=>{if(pointer&&mode==='paint'){const hit=scene.hit(pointer.x,pointer.y);if(hit)model.paint(hit.y,hit.angle,linearColor(PALETTE[selected].hex),brush,Math.min(dt*10,.4));}updateHands(dt);};

// The camera card can move and resize without changing hand-to-pot coordinates.
const panel=$('#camera-panel');let panelDrag:{id:number;x:number;y:number;left:number;top:number}|null=null;
$('#camera-drag').onpointerdown=e=>{if((e.target as HTMLElement).closest('button'))return;const r=panel.getBoundingClientRect(),parent=panel.parentElement!.getBoundingClientRect();panelDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left-parent.left,top:r.top-parent.top};$('#camera-drag').setPointerCapture(e.pointerId);};
$('#camera-drag').onpointermove=e=>{if(!panelDrag)return;const parent=panel.parentElement!.getBoundingClientRect();panel.style.left=`${clamp(panelDrag.left+e.clientX-panelDrag.x,8,parent.width-panel.offsetWidth-8)}px`;panel.style.top=`${clamp(panelDrag.top+e.clientY-panelDrag.y,8,parent.height-panel.offsetHeight-8)}px`;panel.style.bottom='auto';};
$('#camera-drag').onpointerup=()=>{panelDrag=null;};$('#camera-drag').onpointercancel=()=>{panelDrag=null;};
function clampPanel(){if(panel.style.top){const parent=panel.parentElement!;panel.style.left=`${clamp(parseFloat(panel.style.left),8,Math.max(8,parent.clientWidth-panel.offsetWidth-8))}px`;panel.style.top=`${clamp(parseFloat(panel.style.top),8,Math.max(8,parent.clientHeight-panel.offsetHeight-8))}px`;}}
$('#camera-size').onclick=()=>{panel.classList.toggle('large');$('#camera-size').setAttribute('aria-label',panel.classList.contains('large')?'Shrink camera preview':'Enlarge camera preview');clampPanel();};window.addEventListener('resize',clampPanel);
const composer=new ArtworkComposer(scene,camera);
const studioStatus=camera.onStatus;camera.onStatus=(message,state)=>{studioStatus(message,state);composer.syncCamera(message,state);};
const studioDevices=camera.onDevices;camera.onDevices=(devices,current)=>{studioDevices(devices,current);composer.syncDevices(devices,current);};
const studioHands=camera.onHands;camera.onHands=hands=>{studioHands(hands);composer.processHands(hands);};
void camera.refreshDevices();
$('#save').onclick=async()=>{const button=$<HTMLButtonElement>('#save');button.disabled=true;finishPointer();releaseHands();try{await composer.open();}finally{button.disabled=false;}};
// Browser tests inspect real model state without fabricating recognition results.
if(import.meta.env.DEV)Object.assign(window,{__pottery:{model,history,scene,camera,composer,get mode(){return mode;}}});
