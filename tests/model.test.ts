import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ClayModel, History, HEIGHT, RINGS, SEGMENTS, WALL, PALETTE, linearColor, mirroredPoint, pinchRatio} from '../src/model.ts';

test('local shaping preserves the foot, opposite height and safe wall thickness under extreme input',()=>{
  const m=new ClayModel();const before=m.snapshot();
  m.shape(1.3,.05,.25);
  assert.ok(m.radiusAt(1.3)>before.profile[31]);
  assert.equal(m.profile[0],before.profile[0]);
  assert.ok(Math.abs(m.profile[64]-before.profile[64])<.0001);
  for(let i=0;i<1500;i++)m.shape((i%RINGS)/RINGS*HEIGHT,i%2?-.2:.2,.15);
  for(let i=0;i<RINGS;i++){
    assert.ok(m.profile[i]-WALL>0);
    assert.ok(m.profile[i]>=.319&&m.profile[i]<=1.381);
    if(i)assert.ok(Math.abs(m.profile[i]-m.profile[i-1])<.086);
  }
});
test('brush paints across the angular seam without leaking to the back or foot',()=>{
  const m=new ClayModel();const before=m.colors.slice();m.paint(1.32,0,linearColor(PALETTE[2].hex),.3,1);
  const k=(32*SEGMENTS)*3;
  assert.notEqual(m.colors[k],before[k]);
  assert.notEqual(m.colors[k+(SEGMENTS-1)*3],before[k+(SEGMENTS-1)*3]);
  assert.equal(m.colors[k+48*3],before[k+48*3]);
  assert.equal(m.colors[0],before[0]);
});
test('undo restores an entire stroke including paint; no-op edits do not consume history',()=>{
  const m=new ClayModel(),h=new History(m),original=m.snapshot();h.begin();h.commit();assert.equal(h.length,0);
  h.begin();for(let i=0;i<15;i++)m.shape(1.4,.03,.3);m.fill(linearColor(PALETTE[1].hex));h.commit();
  assert.equal(h.length,1);assert.equal(h.undo(),true);assert.deepEqual(m.snapshot(),original);assert.equal(h.undo(),false);
});
test('mirror is one shared reversible transform and pinch activation is scale invariant',()=>{
  const p={x:.2,y:.4,z:.1};assert.deepEqual(mirroredPoint(mirroredPoint(p,true),true),{...p,x:.19999999999999996});
  assert.deepEqual(mirroredPoint(p,false),p);
  const points=Array.from({length:21},(_,i)=>({x:i*.01,y:i*.02,z:0}));
  assert.ok(Math.abs(pinchRatio(points)-pinchRatio(points.map(p=>({x:p.x*2,y:p.y*2,z:0}))))<1e-10);
});
