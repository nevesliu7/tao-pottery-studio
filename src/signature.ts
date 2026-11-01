import {clamp, mirroredPoint, type Point} from './model.ts';
import type {Hand} from './camera.ts';

export type InkPoint = {x:number;y:number};
export type InkStroke = InkPoint[];
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function straight(a:Point,b:Point,c:Point){
  const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];
  const length=Math.hypot(...u)*Math.hypot(...v);
  return length>1e-8 && (u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/length<-.6;
}
export function raisedFingers(points:Point[]):boolean[]|null{
  if(points.length!==21||points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return null;
  const extended=(mcp:number,pip:number,tip:number)=>straight(points[mcp],points[pip],points[tip])&&distance(points[tip],points[mcp])>distance(points[pip],points[mcp])*1.35;
  // Measure thumb spread in the palm plane: depth toward the camera is not extension.
  const vector=(a:Point,b:Point)=>[a.x-b.x,a.y-b.y,a.z-b.z];
  const u=vector(points[5],points[0]),v=vector(points[17],points[0]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross);
  if(length<1e-8)return null;
  const normal=cross.map(n=>n/length);
  const palmDistance=(a:Point,b:Point)=>{const d=vector(a,b),depth=d.reduce((sum,n,i)=>sum+n*normal[i],0);return Math.sqrt(Math.max(0,d.reduce((sum,n)=>sum+n*n,0)-depth*depth));};
  const thumb=extended(2,3,4)&&palmDistance(points[4],points[17])>palmDistance(points[3],points[17])*1.12&&palmDistance(points[4],points[17])>palmDistance(points[2],points[17])*1.25;
  return [thumb,extended(5,6,8),extended(9,10,12),extended(13,14,16),extended(17,18,20)];
}
export function isIndexPointing(points:Point[]){
  const fingers=raisedFingers(points);return !!fingers&&fingers[1]&&fingers.filter(Boolean).length===1;
}

// The whole camera image is writable; there is no hidden central activation zone.
export const SIGNATURE_ROI={x:0,y:0,width:1,height:1};
export const SIGNATURE_TRACKING_TIMEOUT=1000;
export function signaturePoint(point:Point,mirror:boolean):InkPoint|null{
  const p=mirroredPoint(point,mirror),r=SIGNATURE_ROI;
  const x=(p.x-r.x)/r.width,y=(p.y-r.y)/r.height;
  return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;
}

export class SignatureInk {
  strokes:InkStroke[]=[];
  private current:InkStroke|null=null;
  private count=0;
  readonly maxPoints=24000;
  get hasInk(){return this.strokes.some(s=>s.length>1);}
  add(p:InkPoint){
    if(this.count>=this.maxPoints)return false;
    const point={x:clamp(p.x,0,1),y:clamp(p.y,0,1)};
    if(!this.current){this.current=[];this.strokes.push(this.current);}
    const last=this.current.at(-1);
    if(last&&Math.hypot(point.x-last.x,point.y-last.y)<.001)return false;
    this.current.push(point);this.count++;return true;
  }
  lift(){if(this.current?.length===1){this.strokes.pop();this.count--;}this.current=null;}
  undo(){this.lift();const stroke=this.strokes.pop();if(stroke)this.count-=stroke.length;}
  clear(){this.strokes=[];this.current=null;this.count=0;}
  bounds(){
    const points=this.strokes.flat();if(points.length<2)return null;
    return {minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))};
  }
}

// Exactly one raised finger, the index, writes immediately. No dwell/hold gate.
export class SignatureGesture {
  private handId:number|null=null;
  private lastTime:number|null=null;
  private filtered:InkPoint|null=null;
  constructor(private ink:SignatureInk){}
  reset(){this.ink.lift();this.handId=null;this.filtered=null;this.lastTime=null;}
  update(hands:Hand[],time:number,mirror:boolean):{point:InkPoint|null;drawing:boolean;status:string}{
    if(this.lastTime!==null&&time-this.lastTime>SIGNATURE_TRACKING_TIMEOUT)this.reset();
    this.lastTime=time;
    // World coordinates avoid camera aspect ratio and perspective distorting joint angles.
    const poses=hands.map(hand=>({hand,fingers:raisedFingers(hand.worldPoints??hand.points)}));
    const count=poses.reduce((sum,p)=>sum+(p.fingers?.filter(Boolean).length??0),0);
    const candidate=poses.find(p=>p.fingers?.[1]);
    if(!candidate||count!==1||poses.some(p=>!p.fingers)){
      this.reset();
      const status=!hands.length?'Pen up · No hand detected.':count===0?'Pen up · No fingers raised.':count>1?`Pen up · ${count} fingers raised. Raise only your index finger.`:'Pen up · Raise only your index finger.';
      return {point:null,drawing:false,status};
    }
    const hand=candidate.hand;
    if(this.handId!==hand.id){this.reset();this.handId=hand.id;}
    this.lastTime=time;
    const point=signaturePoint(hand.points[8],mirror);
    if(!point){this.ink.lift();this.filtered=null;return {point:null,drawing:false,status:'Pen up · Keep your fingertip visible in the camera.'};}
    if(this.filtered&&Math.hypot(point.x-this.filtered.x,point.y-this.filtered.y)>.2){this.ink.lift();this.filtered=null;}
    this.filtered=this.filtered?{x:this.filtered.x+(point.x-this.filtered.x)*.55,y:this.filtered.y+(point.y-this.filtered.y)*.55}:point;
    this.ink.add(this.filtered);
    return {point:this.filtered,drawing:true,status:'Pen down · Index finger only. Move to sign.'};
  }
}

export function coverRect(imageWidth:number,imageHeight:number,width:number,height:number){
  const scale=Math.max(width/imageWidth,height/imageHeight);
  return {x:(width-imageWidth*scale)/2,y:(height-imageHeight*scale)/2,width:imageWidth*scale,height:imageHeight*scale};
}
