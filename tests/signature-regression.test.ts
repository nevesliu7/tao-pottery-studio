import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SignatureInk,SignatureGesture,isIndexPointing} from '../src/signature.ts';
import {pointingHand} from './signature-fixtures.ts';
import {readFileSync} from 'node:fs';

test('index-only begins writing on the first detected frame',()=>{
  const ink=new SignatureInk(),g=new SignatureGesture(ink);
  assert.equal(g.update([pointingHand()],0,false).drawing,true);
  g.update([pointingHand(1,.02)],60,false);
  assert.equal(ink.hasInk,true);
});
test('slow recognition cannot permanently prevent pen-down',()=>{
  const ink=new SignatureInk(),g=new SignatureGesture(ink);
  for(let i=0;i<6;i++)assert.equal(g.update([pointingHand(1,i*.02)],i*300,false).drawing,true);
  assert.equal(ink.hasInk,true);
});
test('an extended thumb plus index is two fingers and must lift',()=>{
  const hand=pointingHand();
  hand.points[1]={x:.43,y:.76,z:0};hand.points[2]={x:.34,y:.7,z:0};
  hand.points[3]={x:.25,y:.64,z:0};hand.points[4]={x:.16,y:.58,z:0};
  assert.equal(isIndexPointing(hand.points),false);
});
test('two visible pointing fingers must not write, including across hands',()=>{
  const g=new SignatureGesture(new SignatureInk());
  for(const t of [0,60,120,180,240,300])assert.equal(g.update([pointingHand(1),pointingHand(2,.15)],t,false).drawing,false);
});
test('each extra raised finger stops an existing stroke on that frame',()=>{
  for(const finger of [1,2,3]){
    const ink=new SignatureInk(),g=new SignatureGesture(ink);
    g.update([pointingHand()],0,false);g.update([pointingHand(1,.02)],60,false);
    const two=pointingHand(1,.04),palm=pointingHand(1,.04,'palm');
    for(let i=5+finger*4;i<9+finger*4;i++)two.points[i]=palm.points[i];
    const before=JSON.stringify(ink.strokes);
    assert.equal(g.update([two],120,false).drawing,false);
    assert.equal(JSON.stringify(ink.strokes),before);
    g.update([pointingHand(1,.08)],180,false);g.update([pointingHand(1,.1)],240,false);
    assert.equal(ink.strokes.length,2);
  }
});
test('only the index can write, and a closed second hand does not prevent writing',()=>{
  for(let finger=0;finger<4;finger++){
    const hand=pointingHand(1,0,'fist'),palm=pointingHand(1,0,'palm');
    for(let i=5+finger*4;i<9+finger*4;i++)hand.points[i]=palm.points[i];
    assert.equal(isIndexPointing(hand.points),finger===0);
  }
  assert.equal(new SignatureGesture(new SignatureInk()).update([pointingHand(1),pointingHand(2,.15,'fist')],0,false).drawing,true);
});
test('world landmarks drive pose classification while camera coordinates place ink',()=>{
  const hand={...pointingHand(1,0,'fist'),worldPoints:pointingHand().points};
  const result=new SignatureGesture(new SignatureInk()).update([hand],0,false);
  assert.equal(result.drawing,true);assert.equal(result.point?.x,hand.points[8].x);
});
test('real pointing sample with thumb resting against the fist is index-only',()=>{
  const {hand}=JSON.parse(readFileSync(new URL('./fixtures/pointing-landmarks.json',import.meta.url),'utf8'));
  assert.equal(isIndexPointing(hand.worldPoints),true);
});
