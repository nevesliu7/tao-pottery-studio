import type {Point} from '../src/model.ts';
import type {Hand} from '../src/camera.ts';
export function pointingHand(id=1,dx=0,pose:'point'|'palm'|'fist'='point'):Hand{
  const p:Point[]=Array.from({length:21},()=>({x:.5+dx,y:.65,z:0}));
  p[0]={x:.5+dx,y:.85,z:0};
  for(let f=0;f<4;f++){
    const base=5+f*4,x=.4+f*.07+dx,extended=pose==='palm'||(pose==='point'&&f===0);
    p[base]={x,y:.65,z:0};p[base+1]={x,y:.46,z:0};
    p[base+2]={x:x+(extended?0:.035),y:extended?.34:.54,z:0};
    p[base+3]={x:x+(extended?0:.045),y:extended?.24:.67,z:0};
  }
  return{id,label:'Right hand',points:p};
}
