import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from './motion.js';
import {effectSettingsAt,insertEffectCue,updateEffectsAt,effectSegments} from './effect-timeline.js';
import {splatEffectAt,waveEffectAt} from './splat-effects.js';

const sequence={...defaults,duration:6,splatMode:'off',effectTimeline:true,effectTransition:0,effectCues:[
 {id:'second',time:4,values:{splatMode:'hologram',waveEnabled:false}},
 {id:'first',time:2,values:{splatMode:'explode',splatAnimation:'cycle',waveEnabled:true}},
]};
test('effect switches use exact boundaries and leave the base project intact',()=>{
 assert.equal(effectSettingsAt(sequence,1.99).settings.splatMode,'off');
 assert.equal(effectSettingsAt(sequence,2).settings.splatMode,'explode');
 assert.equal(effectSettingsAt(sequence,4).settings.splatMode,'hologram');
 assert.equal(effectSettingsAt(sequence,6).activeId,'second');
 assert.equal(sequence.effectCues[0].id,'second');
 assert.equal(effectSettingsAt({...sequence,effectTimeline:false},3).settings.splatMode,'off');
 assert.deepEqual(effectSegments(sequence).map(s=>[s.start,s.end]),[[0,2],[2,4],[4,6]]);
});
test('a cue captures its own values and edits cannot overwrite camera or another cue',()=>{
 const s=insertEffectCue(sequence,3,'new');
 assert.equal(s.effectCues.find(c=>c.id==='new').values.splatMode,'explode');
 const edited=updateEffectsAt(s,3.2,{splatAmount:.9,waveEnabled:false,distance:999,gridEnabled:true});
 assert.equal(effectSettingsAt(edited,3.2).settings.splatAmount,.9);
 assert.equal(effectSettingsAt(edited,2.5).settings.splatAmount,defaults.splatAmount);
 assert.equal(edited.distance,defaults.distance);assert.equal(edited.gridEnabled,false);
 assert.equal(sequence.effectCues.length,2);
 const replaced=insertEffectCue(s,3.01,'replacement');
 assert.equal(replaced.effectCues.length,3);
});
test('short segments and soft switches are bounded and deterministic on reverse seeks',()=>{
 const s={...sequence,effectTransition:3};
 assert.equal(effectSettingsAt(s,2).fade,0);
 assert.equal(effectSettingsAt(s,4).fade,0);
 for(const time of [0,1.9,2,2.2,3,3.8,4,4.2,6]){
  const frame=splatEffectAt(s,time,{bass:.5});
  splatEffectAt(s,6-time,{bass:.2});
  assert.deepEqual(splatEffectAt(s,time,{bass:.5}),frame);
  assert.ok(frame.amount>=0&&frame.amount<=1);
 }
 assert.equal(splatEffectAt(sequence,2).envelope,0);
 assert.equal(splatEffectAt(sequence,3).envelope,1);
});
test('shortening a film ignores out-of-range cues without deleting them',()=>{
 const s={...sequence,duration:3};
 assert.equal(effectSettingsAt(s,3).activeId,'first');
 assert.equal(effectSegments(s).at(-1).end,3);
 assert.equal(s.effectCues.length,2);
});
test('waves move through space, repeat, combine with splats and follow selected audio',()=>{
 const s={...defaults,waveEnabled:true,wavePeriod:4,waveMusic:.5,waveAmount:.2,waveBand:'high'};
 assert.ok(waveEffectAt(s,1).waveFront<waveEffectAt(s,2).waveFront);
 assert.deepEqual(waveEffectAt(s,1),waveEffectAt(s,5));
 assert.equal(waveEffectAt(s,1,{bass:1}).waveStrength,.2);
 assert.equal(waveEffectAt(s,1,{high:1}).waveStrength,.7);
 assert.equal(waveEffectAt({...s,waveEnabled:false},1,{high:1}).waveStrength,0);
 assert.equal(waveEffectAt({...s,waveDirection:'down'},1).waveFront,-waveEffectAt(s,1).waveFront);
 assert.equal(waveEffectAt({...s,waveDirection:'radial'},1).waveAxis,3);
 assert.equal(waveEffectAt(sequence,3).enabled,1);
 assert.equal(waveEffectAt(sequence,4).enabled,0);
});
