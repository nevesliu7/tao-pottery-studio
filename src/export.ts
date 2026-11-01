import {icon} from './icons';
import type {PotteryScene} from './scene';
import type {Hand, HandCamera} from './camera';
import {HAND_CONNECTIONS, mirroredPoint} from './model';
import {coverRect, SIGNATURE_ROI, SIGNATURE_TRACKING_TIMEOUT, SignatureGesture, SignatureInk, type InkPoint} from './signature';
import './export.css';

export const BACKGROUNDS=[
  {id:'paper',name:'Warm paper',description:'Soft light & warm texture'},
  {id:'sage',name:'Sage gallery',description:'A quiet, botanical setting'},
  {id:'midnight',name:'Midnight',description:'A little after-hours drama'},
] as const;
type Background=typeof BACKGROUNDS[number]['id']|'photo';
const SIZE=1600;
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;

export class ArtworkComposer {
  readonly ink=new SignatureInk();
  private gesture=new SignatureGesture(this.ink);
  private dialog:HTMLDialogElement;
  private preview:HTMLCanvasElement;
  private pad:HTMLCanvasElement;
  private background:Background='paper';
  private artwork:HTMLImageElement|null=null;
  private footY=1280;
  private photo:HTMLImageElement|null=null;
  private photoUrl:string|null=null;
  private photoTicket=0;
  private openTicket=0;
  private backgroundCache=document.createElement('canvas');
  private inkColor='#34443b';
  private placement='right';
  private signing=false;
  private ownedCamera=false;
  private pointer:number|null=null;
  private cursor:InkPoint|null=null;
  private drawing=false;
  private latestHands:Hand[]=[];
  private lastHandAt=0;
  private frame=0;
  private dirty=true;
  private photoLoading=false;

  constructor(private scene:PotteryScene,private camera:HandCamera){
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="artwork-dialog" aria-labelledby="export-heading">
        <header class="export-header"><div><div class="eyebrow">YOUR PIECE, YOUR SETTING</div><h2 id="export-heading">Make it yours.</h2><p>A background. Your signature. A piece to keep.</p></div><button id="close-export" class="icon-button" aria-label="Close artwork editor">${icon('close')}</button></header>
        <div class="export-layout">
          <div class="artwork-preview-wrap"><div class="artwork-frame"><canvas id="artwork-preview" width="1600" height="1600" role="img" aria-label="Artwork with selected background and signature"></canvas><div id="artwork-loading" role="status">Preparing your piece…</div></div><p class="export-caption">1600 × 1600 PNG <span>·</span> Made by you</p></div>
          <div class="export-options">
            <section aria-labelledby="background-heading"><div class="export-label"><h3 id="background-heading">Choose your background</h3><span>01</span></div><div class="background-options" role="group" aria-label="Background presets">${BACKGROUNDS.map((b,i)=>`<button class="background-card ${i===0?'selected':''}" data-background="${b.id}" aria-pressed="${i===0}" title="${b.description}"><span class="background-thumb bg-${b.id}"><i></i><b>${icon('check')}</b></span><span>${b.name}</span></button>`).join('')}</div>
            <input id="background-file" type="file" accept="image/jpeg,image/png,image/webp" hidden/><button id="upload-background" class="outline-button wide">${icon('photo')}Upload a photo</button><div id="photo-choice" hidden><button id="use-photo" aria-pressed="false"><img id="photo-thumb" alt="Your uploaded background"/><span>My photo</span>${icon('check')}</button><button id="remove-photo" class="icon-button" aria-label="Remove uploaded photo">${icon('close')}</button></div><p class="export-note">JPG, PNG or WebP · Up to 20 MB. Your photo stays on this device.</p></section>
            <section class="signature-section" aria-labelledby="signature-heading"><div class="export-label"><h3 id="signature-heading">Leave your mark</h3><span>02</span></div><button id="add-signature" class="outline-button wide" aria-expanded="false">${icon('signature')}Add signature</button>
              <div id="signature-workshop" hidden>
                <p class="signature-instructions">Raise only your index finger to write immediately. Raise another finger, including your thumb, or make a fist to stop. Mouse and touch also work.</p>
                <div class="signature-camera-row"><div class="signature-camera-frame"><canvas id="signature-camera" width="320" height="240" aria-label="Camera preview and signature writing guide"></canvas><span id="signature-camera-empty">Camera off</span></div><div class="signature-camera-actions"><button id="signature-camera-toggle" class="camera-toggle">${icon('camera')}Enable camera</button><label><input id="signature-mirror" type="checkbox" checked/>Mirror</label><select id="signature-device" aria-label="Signature camera device"><option value="">Allow access to list cameras</option></select></div></div>
                <p id="signature-status" role="status">Camera off · Enable camera to sign with your index finger.</p>
                <div class="signature-paper"><canvas id="signature-pad" width="1000" height="330" tabindex="0" aria-label="Signature writing area. Draw with your mouse, touch, or pointing index finger."></canvas><span id="signature-placeholder">Your signature goes here</span></div>
                <div class="signature-tools"><button id="signature-undo" class="quiet-button" disabled>${icon('undo')}Undo stroke</button><button id="signature-clear" class="quiet-button" disabled>${icon('close')}Clear</button></div>
              </div>
              <div id="signature-settings" hidden><label>Ink<select id="signature-color"><option value="#34443b">Charcoal</option><option value="#fcf6e9">Chalk</option></select></label><label>Position<select id="signature-placement"><option value="right">Bottom right</option><option value="center">Bottom center</option><option value="left">Bottom left</option></select></label></div>
            </section>
            <p id="export-error" role="alert" hidden></p>
          </div>
        </div>
        <footer class="export-footer"><p>${icon('lock')}Your camera is never included.</p><div><button id="back-to-studio" class="quiet-button">Back to studio</button><button id="download-artwork" class="primary-button" disabled>${icon('save')}Download image</button></div></footer>
      </dialog>`);
    this.dialog=$('#artwork-dialog');this.preview=$('#artwork-preview');this.pad=$('#signature-pad');
    this.backgroundCache.width=this.backgroundCache.height=SIZE;
    $('#close-export').onclick=()=>this.dialog.close();$('#back-to-studio').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('close',()=>this.close());
    this.dialog.onclick=e=>{if(e.target!==this.dialog)return;const r=this.dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.dialog.close();};
    document.querySelectorAll<HTMLButtonElement>('[data-background]').forEach(b=>b.onclick=()=>this.selectBackground(b.dataset.background as Background));
    $('#upload-background').onclick=()=>$<HTMLInputElement>('#background-file').click();
    $('#background-file').onchange=e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(file)void this.loadPhoto(file);input.value='';};
    $('#use-photo').onclick=()=>this.selectBackground('photo');
    $('#remove-photo').onclick=()=>{++this.photoTicket;this.photoLoading=false;if(this.photoUrl)URL.revokeObjectURL(this.photoUrl);this.photoUrl=null;this.photo=null;$<HTMLImageElement>('#photo-thumb').removeAttribute('src');$('#photo-choice').hidden=true;this.selectBackground('paper');this.setDownloadReady();};
    $('#add-signature').onclick=()=>this.setSigning(!this.signing);
    $('#signature-undo').onclick=()=>{this.gesture.reset();this.ink.undo();this.changed();};
    $('#signature-clear').onclick=()=>{this.gesture.reset();this.ink.clear();this.changed();};
    $('#signature-color').onchange=e=>{this.inkColor=(e.target as HTMLSelectElement).value;this.dirty=true;};
    $('#signature-placement').onchange=e=>{this.placement=(e.target as HTMLSelectElement).value;this.dirty=true;};
    $('#signature-camera-toggle').onclick=()=>{
      this.gesture.reset();
      if(this.camera.active||this.camera.busy)this.camera.stop();
      else{this.ownedCamera=true;void this.camera.start($<HTMLSelectElement>('#signature-device').value||undefined);}
    };
    $('#signature-mirror').onchange=e=>{this.gesture.reset();const mirror=(e.target as HTMLInputElement).checked;$<HTMLInputElement>('#mirror').checked=mirror;this.camera.setMirror(mirror);this.cursor=null;this.drawPad();};
    $('#signature-device').onchange=()=>{this.gesture.reset();if(this.camera.active||this.camera.busy)void this.camera.start($<HTMLSelectElement>('#signature-device').value||undefined);};
    this.pad.onpointerdown=e=>{if(!this.signing||this.pointer!==null||e.button!==0)return;e.preventDefault();this.gesture.reset();this.pointer=e.pointerId;this.pad.setPointerCapture(e.pointerId);this.ink.add(this.pointerPoint(e));this.changed();};
    this.pad.onpointermove=e=>{if(this.pointer!==e.pointerId)return;const samples=e.getCoalescedEvents?.();for(const event of samples?.length?samples:[e])this.ink.add(this.pointerPoint(event));this.changed();};
    const lift=()=>{this.pointer=null;this.ink.lift();this.changed();};this.pad.onpointerup=lift;this.pad.onpointercancel=lift;this.pad.onlostpointercapture=lift;
    $('#download-artwork').onclick=()=>this.download();
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.gesture.reset();this.cursor=null;}});
    this.drawBackground();
  }
  async open(){
    const ticket=++this.openTicket;this.artwork=null;this.signing=false;this.ownedCamera=false;this.cursor=null;this.latestHands=[];this.error('');
    $('#signature-workshop').hidden=true;this.updateSignatureButton();this.setDownloadReady();$('#artwork-loading').hidden=false;
    $<HTMLInputElement>('#signature-mirror').checked=this.camera.mirrored;
    this.dialog.showModal();this.syncCamera(this.camera.active?'Camera ready. Point your index finger to write.':'Camera off · Enable camera to sign with your index finger.',this.camera.active?'on':'off');
    this.dirty=true;this.tick();
    try{
      const blob=await this.scene.captureArtwork();const url=URL.createObjectURL(blob);
      try{const image=new Image();image.src=url;await image.decode();if(ticket!==this.openTicket||!this.dialog.open)return;this.artwork=image;
        const probe=document.createElement('canvas');probe.width=1;probe.height=SIZE;const ctx=probe.getContext('2d')!;ctx.drawImage(image,SIZE/2,0,1,SIZE,0,0,1,SIZE);const pixels=ctx.getImageData(0,0,1,SIZE).data;
        for(let y=SIZE-1;y>=0;y--)if(pixels[y*4+3]>32){this.footY=y-64+3;break;}
        this.dirty=true;$('#artwork-loading').hidden=true;this.setDownloadReady();}
      finally{URL.revokeObjectURL(url);}
    }catch{if(ticket===this.openTicket){$('#artwork-loading').hidden=true;this.error('Could not prepare the artwork. Close this editor and try again.');}}
  }
  private close(){++this.openTicket;++this.photoTicket;this.photoLoading=false;$('#upload-background').innerHTML=`${icon('photo')}Upload a photo`;this.signing=false;this.pointer=null;this.cursor=null;this.gesture.reset();cancelAnimationFrame(this.frame);if(this.ownedCamera)this.camera.stop();this.ownedCamera=false;}
  private setDownloadReady(){$<HTMLButtonElement>('#download-artwork').disabled=!this.artwork||this.photoLoading;}
  private error(message:string){$('#export-error').hidden=!message;$('#export-error').textContent=message;}
  private selectBackground(background:Background){
    if(background==='photo'&&!this.photo)return;this.background=background;
    document.querySelectorAll<HTMLElement>('[data-background]').forEach(b=>{const selected=b.dataset.background===background;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('#use-photo').setAttribute('aria-pressed',String(background==='photo'));
    this.inkColor=background==='midnight'?'#fcf6e9':'#34443b';$<HTMLSelectElement>('#signature-color').value=this.inkColor;
    this.drawBackground();this.dirty=true;
  }
  private async loadPhoto(file:File){
    this.error('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){this.error('Choose a JPG, PNG or WebP image.');return;}
    if(file.size>20*1024*1024){this.error('This image is larger than 20 MB. Please choose a smaller photo.');return;}
    const ticket=++this.photoTicket;this.photoLoading=true;this.setDownloadReady();$('#upload-background').textContent='Loading your photo…';
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      if(ticket!==this.photoTicket||!this.dialog.open){URL.revokeObjectURL(url);return;}
      if(image.naturalWidth*image.naturalHeight>48_000_000)throw new Error('large');
      if(this.photoUrl)URL.revokeObjectURL(this.photoUrl);this.photoUrl=url;this.photo=image;
      $<HTMLImageElement>('#photo-thumb').src=url;$('#photo-choice').hidden=false;this.selectBackground('photo');
    }catch(error){URL.revokeObjectURL(url);if(ticket===this.photoTicket)this.error((error as Error).message==='large'?'Please resize this photo to under 48 megapixels.':'This photo could not be opened. Try a JPG, PNG or WebP image.');}
    finally{if(ticket===this.photoTicket){this.photoLoading=false;this.setDownloadReady();$('#upload-background').innerHTML=`${icon('photo')}Upload a photo`;}}
  }
  private setSigning(signing:boolean){this.signing=signing;this.gesture.reset();this.cursor=null;$('#signature-workshop').hidden=!signing;this.updateSignatureButton();this.changed();if(signing){const options=$('.export-options');const scroller=options.scrollHeight>options.clientHeight+1?options:$('.export-layout');scroller.scrollTo({top:scroller.scrollTop+$('.signature-section').getBoundingClientRect().top-scroller.getBoundingClientRect().top,behavior:'smooth'});}}
  private updateSignatureButton(){$('#add-signature').setAttribute('aria-expanded',String(this.signing));$('#add-signature').innerHTML=`${icon(this.signing?'check':'signature')}${this.signing?'Done signing':this.ink.hasInk?'Edit signature':'Add signature'}`;}
  private pointerPoint(event:PointerEvent){const r=this.pad.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};}
  private changed(){this.dirty=true;$('#signature-placeholder').hidden=this.ink.hasInk;$<HTMLButtonElement>('#signature-undo').disabled=this.ink.strokes.length===0;$<HTMLButtonElement>('#signature-clear').disabled=this.ink.strokes.length===0;$('#signature-settings').hidden=!this.ink.hasInk;this.drawPad();}
  syncCamera(message:string,state:'off'|'loading'|'on'|'error'){
    $('#signature-camera-toggle').innerHTML=`${icon(state==='on'||state==='loading'?'close':'camera')}${state==='on'?'Disable camera':state==='loading'?'Cancel':'Enable camera'}`;
    $('#signature-status').textContent=state==='on'?'Pen up · Raise only your index finger to start.':state==='off'?'Camera off · Enable camera to sign with your index finger.':message;
    $('#signature-status').classList.toggle('error',state==='error');$<HTMLSelectElement>('#signature-device').disabled=state==='loading';
    $('#signature-camera-empty').hidden=state==='on';$('#signature-camera-empty').textContent=state==='loading'?'Connecting…':'Camera off';
    if(state!=='on'){this.gesture.reset();this.cursor=null;this.drawing=false;$('#signature-status').classList.remove('writing');this.latestHands=[];$<HTMLCanvasElement>('#signature-camera').getContext('2d')!.clearRect(0,0,320,240);this.drawPad();}
  }
  syncDevices(devices:MediaDeviceInfo[],current:string){
    const select=$<HTMLSelectElement>('#signature-device'),old=select.value;select.replaceChildren();
    if(!devices.length){select.add(new Option('No camera found',''));return;}
    devices.forEach((d,i)=>select.add(new Option(d.label||`Camera ${i+1}`,d.deviceId)));
    if(devices.some(d=>d.deviceId===current))select.value=current;else if(devices.some(d=>d.deviceId===old))select.value=old;
  }
  processHands(hands:Hand[]){
    if(!this.dialog.open)return;this.latestHands=hands;this.lastHandAt=performance.now();
    if(this.pointer!==null)return;
    if(!this.signing){this.gesture.reset();return;}
    const result=this.gesture.update(hands,this.lastHandAt,this.camera.mirrored);this.cursor=result.point;this.drawing=result.drawing;
    if(this.camera.active){$('#signature-status').textContent=result.status;$('#signature-status').classList.toggle('writing',result.drawing);}this.changed();
  }
  private drawPad(){
    const ctx=this.pad.getContext('2d')!;ctx.clearRect(0,0,this.pad.width,this.pad.height);
    ctx.strokeStyle='#34443b';ctx.lineWidth=3.2;ctx.lineCap=ctx.lineJoin='round';
    for(const stroke of this.ink.strokes){if(stroke.length<2)continue;ctx.beginPath();stroke.forEach((p,i)=>i?ctx.lineTo(p.x*1000,p.y*330):ctx.moveTo(p.x*1000,p.y*330));ctx.stroke();}
    if(this.cursor&&this.signing){ctx.strokeStyle=this.drawing?'#a46e50':'#6d9479';ctx.lineWidth=2;ctx.beginPath();ctx.arc(this.cursor.x*1000,this.cursor.y*330,10,0,Math.PI*2);ctx.stroke();}
  }
  private drawCamera(){
    const canvas=$<HTMLCanvasElement>('#signature-camera'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,320,240);
    if(!this.camera.active||this.camera.video.readyState<2)return;
    const video=this.camera.video,scale=Math.min(320/video.videoWidth,240/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale,x=(320-w)/2,y=(240-h)/2;
    ctx.save();if(this.camera.mirrored){ctx.translate(320,0);ctx.scale(-1,1);}ctx.drawImage(video,x,y,w,h);ctx.restore();
    ctx.strokeStyle='#c4efdb';ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.strokeRect(x+SIGNATURE_ROI.x*w,y+SIGNATURE_ROI.y*h,SIGNATURE_ROI.width*w,SIGNATURE_ROI.height*h);ctx.setLineDash([]);
    for(const hand of this.latestHands){const points=hand.points.map(p=>mirroredPoint(p,this.camera.mirrored));ctx.beginPath();for(const [a,b] of HAND_CONNECTIONS){ctx.moveTo(x+points[a].x*w,y+points[a].y*h);ctx.lineTo(x+points[b].x*w,y+points[b].y*h);}ctx.stroke();ctx.fillStyle='#fff7dc';ctx.beginPath();ctx.arc(x+points[8].x*w,y+points[8].y*h,4,0,Math.PI*2);ctx.fill();}
  }
  private drawBackground(){
    const ctx=this.backgroundCache.getContext('2d')!;ctx.clearRect(0,0,SIZE,SIZE);
    if(this.background==='photo'&&this.photo){const r=coverRect(this.photo.naturalWidth,this.photo.naturalHeight,SIZE,SIZE);ctx.drawImage(this.photo,r.x,r.y,r.width,r.height);return;}
    const palettes={paper:['#f4eddf','#ddcfb8'],sage:['#e1e6dc','#a8b9a9'],midnight:['#344c56','#101e25']};
    const colors=palettes[this.background as keyof typeof palettes];
    const gradient=ctx.createLinearGradient(0,0,SIZE,SIZE);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);ctx.fillStyle=gradient;ctx.fillRect(0,0,SIZE,SIZE);
    if(this.background==='paper'){
      ctx.save();ctx.translate(100,-500);ctx.rotate(.45);ctx.fillStyle='#fff9ec36';for(let x=0;x<1300;x+=380)ctx.fillRect(x,0,280,1800);ctx.restore();
      ctx.fillStyle='#aa997c08';for(let y=0;y<SIZE;y+=3)ctx.fillRect(0,y,SIZE,1);
    }else if(this.background==='sage'){
      ctx.fillStyle='#f3f5eb30';ctx.beginPath();ctx.roundRect(345,180,910,1220,[455,455,0,0]);ctx.fill();
      ctx.fillStyle='#f4f4de1f';ctx.fillRect(0,1280,SIZE,320);
    }else{
      const glow=ctx.createRadialGradient(800,520,70,800,700,1050);glow.addColorStop(0,'#d5e8dc24');glow.addColorStop(1,'#07131c00');ctx.fillStyle=glow;ctx.fillRect(0,0,SIZE,SIZE);
    }
  }
  private compose(){
    const ctx=this.preview.getContext('2d')!;ctx.clearRect(0,0,SIZE,SIZE);ctx.drawImage(this.backgroundCache,0,0);
    if(!this.artwork)return;
    ctx.save();ctx.translate(800,this.footY);ctx.scale(1,.16);const shadow=ctx.createRadialGradient(0,0,20,0,0,330);shadow.addColorStop(0,'#16251c44');shadow.addColorStop(1,'#16251c00');ctx.fillStyle=shadow;ctx.fillRect(-340,-340,680,680);ctx.restore();
    ctx.drawImage(this.artwork,0,-64,SIZE,SIZE);
    const b=this.ink.bounds();if(!b)return;
    const width=Math.max((b.maxX-b.minX)*1000,1),height=Math.max((b.maxY-b.minY)*330,1),scale=Math.min(460/width,145/height,1.8);
    const x=this.placement==='left'?110:this.placement==='center'?(SIZE-width*scale)/2:SIZE-110-width*scale,y=SIZE-110-height*scale;
    ctx.save();ctx.translate(x-b.minX*1000*scale,y-b.minY*330*scale);ctx.scale(scale,scale);ctx.strokeStyle=this.inkColor;ctx.lineWidth=3.2;ctx.lineCap=ctx.lineJoin='round';
    for(const stroke of this.ink.strokes){if(stroke.length<2)continue;ctx.beginPath();stroke.forEach((p,i)=>i?ctx.lineTo(p.x*1000,p.y*330):ctx.moveTo(p.x*1000,p.y*330));ctx.stroke();}ctx.restore();
  }
  private tick=()=>{
    if(!this.dialog.open)return;
    if(this.camera.active&&this.signing){this.drawCamera();if(performance.now()-this.lastHandAt>SIGNATURE_TRACKING_TIMEOUT&&this.cursor){this.gesture.reset();this.cursor=null;this.drawing=false;$('#signature-status').textContent='Pen up · Waiting for hand tracking.';$('#signature-status').classList.remove('writing');this.drawPad();}}
    if(this.dirty){this.compose();this.dirty=false;}
    this.frame=requestAnimationFrame(this.tick);
  };
  private download(){
    if(!this.artwork||this.photoLoading)return;
    this.gesture.reset();this.ink.lift();this.compose();
    try{
      // A synchronous data URL preserves the user's download gesture, including on mobile browsers.
      const a=document.createElement('a');a.href=this.preview.toDataURL('image/png');a.download=`TAO-artwork-${new Date().toISOString().slice(0,10)}.png`;document.body.append(a);a.click();a.remove();this.error('');
    }catch{this.error('Could not export this image. Try another photo, then download again.');}
  }
}
