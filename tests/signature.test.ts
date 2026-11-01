import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isIndexPointing,SignatureInk,SignatureGesture,signaturePoint,coverRect} from '../src/signature.ts';
import {pointingHand} from './signature-fixtures.ts';

test('signature gesture accepts an index finger, rejects palms and fists, and tolerates rotation',()=>{
  const point=pointingHand();assert.equal(isIndexPointing(point.points),true);
  assert.equal(isIndexPointing(pointingHand(1,0,'palm').points),false);assert.equal(isIndexPointing(pointingHand(1,0,'fist').points),false);
  const rotated=point.points.map(p=>({x:1-p.y,y:p.x,z:p.z}));assert.equal(isIndexPointing(rotated),true);
  assert.equal(isIndexPointing([]),false);
});
test('signature starts immediately, lifts between letters, and never joins across tracking loss',()=>{
  const ink=new SignatureInk(),gesture=new SignatureGesture(ink);
  assert.equal(gesture.update([pointingHand()],0,false).drawing,true);
  gesture.update([pointingHand(1,.03)],60,false);assert.equal(ink.hasInk,true);
  assert.equal(gesture.update([pointingHand(1,.03,'fist')],120,false).drawing,false);
  gesture.update([pointingHand(1,.08)],180,false);gesture.update([pointingHand(1,.11)],240,false);assert.equal(ink.strokes.length,2);
  gesture.update([],300,false);gesture.update([pointingHand()],360,false);gesture.update([pointingHand(1,.03)],420,false);assert.equal(ink.strokes.length,3);
});
test('hand identity changes, large jumps and stale frames lift the pen before writing again',()=>{
  const ink=new SignatureInk(),g=new SignatureGesture(ink);
  for(const t of [0,60,120,180])g.update([pointingHand()],t,false);
  g.update([pointingHand(1,.03)],240,false);
  assert.equal(g.update([pointingHand(2,.3)],300,false).drawing,true);
  g.update([pointingHand(2,.32)],360,false);assert.equal(ink.strokes.length,2);
  assert.equal(g.update([pointingHand(2,.3)],1500,false).drawing,true);
  g.update([pointingHand(2,.32)],1560,false);assert.equal(ink.strokes.length,3);
});
test('mirroring keeps the camera guide and ink mapping consistent; out-of-guide points lift',()=>{
  const p={x:.3,y:.5,z:0};const left=signaturePoint(p,false)!,right=signaturePoint(p,true)!;
  assert.ok(Math.abs(left.x+right.x-1)<1e-10);assert.equal(left.y,right.y);
  assert.equal(signaturePoint({x:.05,y:.5,z:0},false)?.x,.05);
  assert.equal(signaturePoint({x:-.05,y:.5,z:0},false),null);
});
test('signature undo removes one stroke, clear removes all, and tapping does not export a dot',()=>{
  const ink=new SignatureInk();ink.add({x:.2,y:.2});ink.lift();assert.equal(ink.strokes.length,0);
  ink.add({x:.2,y:.3});ink.add({x:.3,y:.6});ink.lift();ink.add({x:.6,y:.3});ink.add({x:.7,y:.5});ink.lift();
  assert.equal(ink.strokes.length,2);ink.undo();assert.equal(ink.strokes.length,1);assert.equal(ink.bounds()?.maxX,.3);ink.clear();assert.equal(ink.hasInk,false);
});
test('uploaded photos cover a square without being stretched',()=>{
  assert.deepEqual(coverRect(2000,1000,1600,1600),{x:-800,y:0,width:3200,height:1600});
  assert.deepEqual(coverRect(1000,2000,1600,1600),{x:0,y:-800,width:1600,height:3200});
});
