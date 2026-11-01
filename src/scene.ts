import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BASE, ClayModel, HEIGHT, RINGS, SEGMENTS, WALL, clamp } from './model';

export class PotteryScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-3,3,2.4,-2.4,.1,100);
  wheel = new THREE.Group();
  pot: THREE.Mesh<THREE.LatheGeometry, THREE.MeshPhysicalMaterial>;
  private rowInfo: { ring: number; inner: boolean }[] = [];
  private ray = new THREE.Raycaster();
  private cursor = new THREE.Mesh(new THREE.TorusGeometry(.13,.008,8,48),new THREE.MeshBasicMaterial({color: '#b26f4d',transparent:true,opacity:.8,depthTest:false}));
  private geometryRevision = -1;
  private shapeRevision = -1;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  rotating = !this.reducedMotion;
  onFrame: (dt: number) => void = () => {};
  private lastTime = 0;
  private disposed = false;
  private exporting = false;
  private observer: ResizeObserver;
  constructor(public canvas: HTMLCanvasElement, public model: ClayModel) {
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, preserveDrawingBuffer:true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=.86;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.camera.position.set(0,3.6,8);
    this.camera.lookAt(0,1.18,0);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment,.04).texture;
    environment.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#fff7e7','#a49a86',.85));
    const sunlight = new THREE.DirectionalLight('#fff6e7',2.7);
    sunlight.position.set(-3.5,6,4); sunlight.castShadow=true;
    sunlight.shadow.mapSize.set(2048,2048);
    sunlight.shadow.camera.left=-5; sunlight.shadow.camera.right=5;
    sunlight.shadow.camera.top=6; sunlight.shadow.camera.bottom=-5;
    sunlight.shadow.normalBias=.02; sunlight.shadow.bias=-.0002;
    sunlight.shadow.radius=4;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight('#e2ede7',.65); fill.position.set(4,3,-2); this.scene.add(fill);
    const material = new THREE.MeshPhysicalMaterial({
      color:0xffffff, vertexColors:true, roughness:.27, metalness:0,
      clearcoat:.65, clearcoatRoughness:.22, envMapIntensity:.85,
      bumpMap:this.clayTexture(), bumpScale:.008,
    });
    this.pot = new THREE.Mesh(this.makeGeometry(),material);
    this.pot.castShadow=true; this.pot.receiveShadow=true;
    this.wheel.add(this.pot);
    this.makeWheel(); this.makeTable();
    this.scene.add(this.wheel);
    this.cursor.visible=false; this.cursor.renderOrder=20; this.scene.add(this.cursor);
    this.observer = new ResizeObserver(()=>this.resize());
    this.observer.observe(canvas.parentElement!);
    this.resize(); this.animate(0);
  }
  private clayTexture() {
    const c=document.createElement('canvas'); c.width=512; c.height=512;
    const ctx=c.getContext('2d')!;
    ctx.fillStyle='#8f8f8f'; ctx.fillRect(0,0,512,512);
    let seed=2309; const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<17000;i++) { const n=100+Math.floor(rand()*100); ctx.fillStyle=`rgba(${n},${n},${n},.35)`; ctx.fillRect(rand()*512,rand()*512,rand()*1.5+.3,rand()*1.5+.3); }
    for(let y=0;y<512;y+=5) { ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(0,y,512,.6); }
    const texture=new THREE.CanvasTexture(c); texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(3,2); return texture;
  }
  private makeGeometry() {
    const points: THREE.Vector2[]=[]; this.rowInfo=[];
    const add=(x:number,y:number,ring:number,inner=false)=>{points.push(new THREE.Vector2(x,y));this.rowInfo.push({ring,inner});};
    add(0,0,0); add(this.model.profile[0]-.04,0,0);
    for(let i=0;i<RINGS;i++) add(this.model.profile[i],HEIGHT*i/(RINGS-1)+.025,i);
    const rim=this.model.profile[RINGS-1];
    for(let k=1;k<=8;k++) { const a=Math.PI*k/8; add(rim-WALL/2+Math.cos(a)*WALL/2,HEIGHT+.025+Math.sin(a)*WALL/2,RINGS-1); }
    for(let i=RINGS-2;i>=3;i--) add(this.model.profile[i]-WALL,HEIGHT*i/(RINGS-1)+.025,i,true);
    add(this.model.profile[3]-WALL-.035,BASE,3,true); add(0,BASE,3,true);
    const geometry=new THREE.LatheGeometry(points,SEGMENTS);
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3),3));
    this.applyColors(geometry);
    return geometry;
  }
  private applyColors(geometry: THREE.LatheGeometry) {
    const colors=geometry.getAttribute('color') as THREE.BufferAttribute;
    const rows=this.rowInfo.length;
    // LatheGeometry stores all profile points for each angular segment.
    for(let s=0;s<=SEGMENTS;s++) for(let r=0;r<rows;r++) {
      const {ring,inner}=this.rowInfo[r]; const k=(ring*SEGMENTS+(s%SEGMENTS))*3;
      const shade=inner?.78:1;
      colors.setXYZ(s*rows+r,this.model.colors[k]*shade,this.model.colors[k+1]*shade,this.model.colors[k+2]*shade);
    }
    colors.needsUpdate=true;
  }
  private makeWheel() {
    const dark=new THREE.MeshStandardMaterial({color:'#595b50',roughness:.6,metalness:.25});
    const metal=new THREE.MeshStandardMaterial({color:'#b6b2a3',roughness:.35,metalness:.65});
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(1.19,1.27,.19,96),dark); lower.position.y=-.22; lower.receiveShadow=true; lower.castShadow=true; this.scene.add(lower);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(1.36,1.36,.13,128),metal); top.position.y=-.075; top.receiveShadow=true; top.castShadow=true; this.wheel.add(top);
    const surface=new THREE.Mesh(new THREE.CylinderGeometry(1.34,1.34,.012,128),new THREE.MeshStandardMaterial({color:'#c6c2b5',roughness:.58,metalness:.35})); surface.position.y=-.003; surface.receiveShadow=true; this.wheel.add(surface);
    for(const radius of [.99,1.13,1.27,1.33]) {
      const line=new THREE.Mesh(new THREE.TorusGeometry(radius,.003,5,128),new THREE.MeshStandardMaterial({color:'#85877b',roughness:.6}));
      line.rotation.x=Math.PI/2; line.position.y=.006; this.wheel.add(line);
    }
    const marker=new THREE.Mesh(new THREE.BoxGeometry(.08,.004,.014),new THREE.MeshBasicMaterial({color:'#8b8f7f'}));marker.position.set(1.24,.007,0);this.wheel.add(marker);
  }
  private makeTable() {
    const c=document.createElement('canvas');c.width=1024;c.height=512;
    const ctx=c.getContext('2d')!;ctx.fillStyle='#c4aa83';ctx.fillRect(0,0,1024,512);
    let seed=321;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let y=0;y<512;y++) {
      ctx.strokeStyle=`rgba(${rand()>.5?'94,65,33':'241,218,173'},${rand()*.11})`;ctx.lineWidth=rand()*1.2+.3;ctx.beginPath();
      for(let x=0;x<=1024;x+=16) {const yy=y+Math.sin(x*.009+y*.022)*3+Math.sin(x*.03+y)*.7; if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);texture.anisotropy=4;
    const table=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({map:texture,color:'#e8ddc9',roughness:.85}));
    table.rotation.x=-Math.PI/2;table.position.y=-.33;table.receiveShadow=true;
    // Keep the tabletop inside a low, finite plane so the warm studio wall remains visible.
    table.geometry.dispose();table.geometry=new THREE.PlaneGeometry(30,7);table.position.z=2.3;
    this.scene.add(table);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(30,.12,.08),new THREE.MeshStandardMaterial({color:'#b4a087',roughness:.9}));edge.position.set(0,-.38,-1.2);this.scene.add(edge);
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6),new THREE.MeshBasicMaterial({map:this.shadowTexture(),transparent:true,depthWrite:false,opacity:.45}));
    contact.rotation.x=-Math.PI/2;contact.position.set(.1,-.319,.05);this.scene.add(contact);
  }
  private shadowTexture() {
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
    const g=ctx.createRadialGradient(64,64,16,64,64,64);g.addColorStop(0,'rgba(40,33,22,.8)');g.addColorStop(.5,'rgba(40,33,22,.3)');g.addColorStop(1,'rgba(40,33,22,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  }
  setFinish(gloss: boolean) { this.pot.material.roughness=gloss?.27:.72;this.pot.material.clearcoat=gloss?.65:.08; }
  updateGeometry() {
    if(this.geometryRevision===this.model.revision)return;
    if(this.shapeRevision!==this.model.shapeRevision){
      const old=this.pot.geometry;this.pot.geometry=this.makeGeometry();old.dispose();this.shapeRevision=this.model.shapeRevision;
    }else this.applyColors(this.pot.geometry);
    this.geometryRevision=this.model.revision;
  }
  resize() {
    const {width,height}=this.canvas.parentElement!.getBoundingClientRect();
    this.renderer.setSize(width,height,false);
    const aspect=width/Math.max(height,1);
    const viewHeight=aspect<.85?5.8:4.75;
    this.camera.left=-viewHeight*aspect/2;this.camera.right=viewHeight*aspect/2;this.camera.top=viewHeight/2;this.camera.bottom=-viewHeight/2;this.camera.updateProjectionMatrix();
  }
  project(point: THREE.Vector3) {
    const p=point.clone().project(this.camera);const {width,height}=this.canvas.getBoundingClientRect();
    return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};
  }
  handPoint(x:number,y:number) {
    // A fixed world-space plane; preview position, preview size and wheel angle never enter this mapping.
    return this.project(new THREE.Vector3((x-.5)*4.5,(1-y)*3.6-.35,1));
  }
  hit(x:number,y:number) {
    const rect=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(x/rect.width*2-1,1-y/rect.height*2),this.camera);
    this.wheel.updateMatrixWorld(true);
    const hits=this.ray.intersectObject(this.pot);
    if(!hits.length)return null;
    const point=hits[0].point;
    const local=this.pot.worldToLocal(point.clone());
    return {point, y:clamp(local.y,0,HEIGHT), angle:Math.atan2(local.x,local.z), side:point.x<0?-1:1};
  }
  nearSurface(x:number,y:number) {
    const direct=this.hit(x,y);if(direct)return direct;
    // A small tolerance outside the silhouette makes fingertip pinches comfortable.
    for(const dx of [-12,12,-24,24]) {const near=this.hit(x+dx,y);if(near)return near;}
    return null;
  }
  worldDelta(pixelDelta:number) {return pixelDelta/this.canvas.clientWidth*(this.camera.right-this.camera.left);}
  showCursor(x:number,y:number,size:number,color:string) {
    const hit=this.hit(x,y);this.cursor.visible=!!hit;
    if(!hit)return;
    this.cursor.position.copy(hit.point);this.cursor.position.z+=.04;
    this.cursor.quaternion.copy(this.camera.quaternion);this.cursor.scale.setScalar(size/.13);this.cursor.material.color.set(color);
  }
  hideCursor() {this.cursor.visible=false;}
  async captureArtwork(): Promise<Blob> {
    const oldSize=this.renderer.getSize(new THREE.Vector2());const ratio=this.renderer.getPixelRatio();
    const exportCamera=this.camera.clone();exportCamera.left=-1.9;exportCamera.right=1.9;exportCamera.top=1.9;exportCamera.bottom=-1.9;
    exportCamera.lookAt(0,HEIGHT/2,0);exportCamera.updateProjectionMatrix();
    const isolated=new THREE.Scene();isolated.environment=this.scene.environment;
    const lights=this.scene.children.filter(c=>c instanceof THREE.Light).map(l=>l.clone());lights.forEach(l=>isolated.add(l));
    this.exporting=true;
    try {
      this.updateGeometry();const piece=new THREE.Mesh(this.pot.geometry,this.pot.material);piece.rotation.copy(this.wheel.rotation);piece.castShadow=true;piece.receiveShadow=true;isolated.add(piece);
      this.renderer.setPixelRatio(1);this.renderer.setSize(1600,1600,false);this.renderer.setClearColor(0,0);this.renderer.render(isolated,exportCamera);
      return await new Promise<Blob>((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image generation failed')),'image/png'));
    } finally {
      this.renderer.setPixelRatio(ratio);this.renderer.setSize(oldSize.x,oldSize.y,false);this.renderer.setClearColor(0,0);
      lights.forEach(l=>(l as THREE.DirectionalLight).shadow?.dispose());isolated.clear();this.exporting=false;
    }
  }
  private animate=(time:number)=> {
    if(this.disposed)return;
    requestAnimationFrame(this.animate);
    const dt=Math.min((time-this.lastTime)/1000,.05);this.lastTime=time;
    if(document.hidden||this.exporting)return;
    if(this.rotating)this.wheel.rotation.y+=dt*.23;
    this.onFrame(dt);this.updateGeometry();this.renderer.render(this.scene,this.camera);
  };
}
