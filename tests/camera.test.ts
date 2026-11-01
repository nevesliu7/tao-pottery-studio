import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandCamera} from '../src/camera.ts';

function setup(getUserMedia: (...args:any[])=>Promise<any>){
  const devices=[{kind:'videoinput',deviceId:'built-in',label:'Built in'},{kind:'audioinput',deviceId:'mic',label:'Microphone'},{kind:'videoinput',deviceId:'usb',label:'USB camera'}];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia,enumerateDevices:async()=>devices,addEventListener(){}}}});
  Object.assign(globalThis,{window:{isSecureContext:true,addEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},document:{hidden:false}});
  const video={srcObject:null,play:async()=>{},pause(){},style:{},readyState:0};
  const c=new HandCamera(video as any,{width:640,height:480,getContext:()=>({clearRect(){}})} as any);
  (c as any).loadDetector=async()=>({});
  const statuses:any[]=[];c.onStatus=(message,state)=>statuses.push({message,state});
  return{c,video,statuses};
}
function stream(id:string){
  const track={stopped:false,stop(){this.stopped=true;},getSettings:()=>({deviceId:id}),addEventListener(_type:string,callback:()=>void){this.ended=callback;},ended:()=>{}};
  return{track,getTracks:()=>[track],getVideoTracks:()=>[track]};
}
test('camera switch releases old stream before requesting the next and enumerates only actual video inputs',async()=>{
  const a=stream('built-in'),b=stream('usb');let requests=0;
  const {c,video}=setup(async options=>{requests++;if(requests===1)return a;assert.equal(a.track.stopped,true);assert.equal(options.video.deviceId.exact,'usb');return b;});
  let reported:any[]=[];c.onDevices=devices=>reported=devices;
  await c.start();assert.equal(c.active,true);assert.equal(reported.length,2);
  await c.start('usb');assert.equal(video.srcObject,b);assert.equal(c.active,true);
  c.stop();assert.equal(b.track.stopped,true);assert.equal(video.srcObject,null);assert.equal(c.active,false);
});
test('closing during a pending permission request stops the late stream and does not reconnect',async()=>{
  const a=stream('late');let resolve!:(s:any)=>void;
  const {c,video}=setup(()=>new Promise(r=>resolve=r));
  const pending=c.start();c.stop();resolve(a);await pending;
  assert.equal(a.track.stopped,true);assert.equal(video.srcObject,null);assert.equal(c.active,false);
});
test('an older failed request cannot stop a newer successful connection',async()=>{
  const b=stream('usb');let reject!:(e:Error)=>void;let count=0;
  const {c,video}=setup(()=>++count===1?new Promise((_r,j)=>reject=j):Promise.resolve(b));
  const first=c.start();await c.start('usb');reject(new Error('Old permission request failed'));await first;
  assert.equal(c.active,true);assert.equal(video.srcObject,b);assert.equal(b.track.stopped,false);c.stop();
});
test('permission denial, detector failure and device disconnection all report errors and release streams',async()=>{
  const denied=setup(async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});});
  await denied.c.start();assert.equal(denied.c.active,false);assert.equal(denied.statuses.at(-1).state,'error');assert.match(denied.statuses.at(-1).message,/permission/);
  const a=stream('a');const failed=setup(async()=>a);(failed.c as any).loadDetector=async()=>{throw new Error('model failed');};
  await failed.c.start();assert.equal(a.track.stopped,true);assert.equal(failed.video.srcObject,null);
  const b=stream('b');const ended=setup(async()=>b);await ended.c.start();b.track.ended();assert.equal(ended.c.active,false);assert.equal(b.track.stopped,true);assert.equal(ended.statuses.at(-1).state,'error');
});
