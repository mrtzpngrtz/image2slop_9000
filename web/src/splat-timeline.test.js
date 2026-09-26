import test from 'node:test';
import assert from 'node:assert/strict';
import {addSplatClip,splatsAt,splatSegments} from './splat-timeline.js';
import {moveTimelinePoint,removeTimelinePoint} from './timeline-editing.js';

const settings={duration:12,splatTimeline:true,splatClips:[
 {id:'a',assetId:'one',time:0,orientation:[180,0,0]},
 {id:'b',assetId:'two',time:4,transition:'fade',blend:2},
 {id:'c',assetId:'one',time:8,transition:'cut',blend:1},
]};
test('legacy single models keep orientation, while empty sequences stay empty',()=>{
 assert.deepEqual(splatsAt({assetId:'one',orientation:[180,0,0]},5),[{id:'single',assetId:'one',orientation:[180,0,0],clipOpacity:1,clipScatter:0,clipWipe:0,clipProgress:1}]);
 assert.deepEqual(splatsAt({...settings,splatClips:[],assetId:'one'},4),[]);
});
test('crossfade uses both files, exact endpoints and deterministic backward seeks',()=>{
 assert.deepEqual(splatsAt(settings,4).map(c=>[c.assetId,c.clipOpacity]),[['one',1],['two',0]]);
 assert.deepEqual(splatsAt(settings,5).map(c=>c.clipOpacity),[.5,.5]);
 assert.deepEqual(splatsAt(settings,6).map(c=>c.assetId),['two']);
 assert.deepEqual(splatsAt(settings,8).map(c=>c.id),['c']);
 assert.deepEqual(splatsAt(settings,12).map(c=>c.id),['c']);
 assert.deepEqual(splatsAt(settings,5).map(c=>c.clipOpacity),[.5,.5]);
});
test('particle and wipe transitions are reversible and never overlap a third clip',()=>{
 for(const transition of ['particles','wipe']){
  const s={...settings,splatClips:settings.splatClips.map(c=>({...c,transition,blend:99}))};
  const segment=splatSegments(s)[1];assert.equal(segment.blend,3.6);
  const pair=splatsAt(s,5.8);assert.equal(pair.length,2);
  if(transition==='particles'){assert.ok(Math.abs(pair[0].clipScatter-.5)<1e-8);assert.ok(Math.abs(pair[1].clipScatter-.5)<1e-8);}
  else assert.deepEqual(pair.map(c=>c.clipWipe),[-1,1]);
  assert.equal(splatsAt(s,7.9).length,1);
  assert.equal(splatsAt(s,8).length,2);
 }
});
test('adding preserves camera and base orientation; recurring files have unique clips',()=>{
 const original={assetId:'one',orientation:[180,180,0],cameraMode:'keyframes',keyframes:[{time:0}],duration:12};
 const s=addSplatClip(original,{id:'two'},0,'b','a');
 assert.equal(s.splatClips[1].time,6);assert.equal(s.cameraMode,'keyframes');assert.deepEqual(s.keyframes,original.keyframes);
 assert.deepEqual(s.splatClips[0].orientation,[180,180,0]);
 const again=addSplatClip(s,{id:'one'},9,'c','unused');assert.equal(again.splatClips.length,3);assert.equal(again.splatClips[2].assetId,'one');
 const collision=addSplatClip(again,{id:'two'},9,'d','unused');assert.equal(new Set(collision.splatClips.map(c=>c.time)).size,4);
});
test('clips move across neighbors, first anchors at zero, deleting first closes the gap',()=>{
 assert.equal(moveTimelinePoint(settings,'splat','a',3),settings);
 const moved=moveTimelinePoint(settings,'splat','b',9);assert.deepEqual(moved.splatClips.map(c=>c.id),['a','c','b']);
 assert.equal(settings.splatClips[1].time,4);
 const removed=removeTimelinePoint(settings,'splat','a');assert.equal(removed.splatClips[0].time,0);assert.equal(settings.splatClips[1].time,4);
 const last=removeTimelinePoint({...settings,splatClips:[settings.splatClips[0]]},'splat','a');assert.deepEqual(splatsAt(last,0),[]);
});
test('shortened films ignore out-of-range clips and cap transition length',()=>{
 const s={...settings,duration:5};assert.equal(splatSegments(s).length,2);assert.equal(splatSegments(s)[1].blend,.9);
 assert.equal(splatsAt(s,5)[0].assetId,'two');
});
