import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from './motion.js';
import {captureEffects,effectEditorAt,effectSettingsAt,updateEffectsAt,insertEffectCue} from './effect-timeline.js';
import {selectSplatEffect} from './splat-effects.js';
import {gradingState} from './color-grading.js';

const tuned={...defaults,splatMode:'explode',splatAmount:.63,splatSpeed:1.7,splatMusic:.73,splatBand:'mid',splatAnimation:'assemble',splatColor:'#ff8833',splatSize:.61,splatDetail:.42,splatTrails:.17,
 waveAmount:.58,waveGlow:.19,wavePeriod:7,glow:.13,chroma:.27,pulse:.35,tint:.14,gradeEnabled:true,gradeSaturation:.32};
const sequence={...tuned,duration:6,effectTimeline:true,effectCues:[
 {id:'first',time:2,values:captureEffects({...tuned,splatMode:'vortex',splatAmount:.81})},
 {id:'second',time:4,values:captureEffects({...tuned,splatMode:'hologram',splatAmount:.24})},
]};
test('switching deformation preserves all custom parameters, including on repeated clicks',()=>{
 for(const mode of ['drift','vortex','hologram','explode','off']){
  const changed=selectSplatEffect(tuned,mode);assert.deepEqual(changed,{...tuned,splatMode:mode});
  assert.deepEqual(selectSplatEffect(changed,mode),changed);
 }
});
test('wave and original buttons only change which effects are enabled',()=>{
 const wave=selectSplatEffect(tuned,'wave');assert.deepEqual(wave,{...tuned,splatMode:'off',waveEnabled:true});
 assert.deepEqual(selectSplatEffect(wave,'original'),{...tuned,splatMode:'off',waveEnabled:false});
});
test('selected cue settings and writes stay pinned when the playhead crosses another cue',()=>{
 assert.equal(effectEditorAt(sequence,5,'first').settings.splatAmount,.81);
 assert.equal(effectSettingsAt(sequence,5).settings.splatAmount,.24);
 const next=updateEffectsAt(sequence,5,{splatAmount:.9,gradeSaturation:.1,distance:99},'first');
 assert.equal(next.effectCues[0].values.splatAmount,.9);assert.equal(next.effectCues[0].values.gradeSaturation,.1);
 assert.equal(next.effectCues[1],sequence.effectCues[1]);assert.equal(next.distance,tuned.distance);assert.equal(next.splatAmount,tuned.splatAmount);
 assert.equal(effectSettingsAt(next,5).settings.splatAmount,.24);
});
test('opening section can be explicitly edited while playback is in a later section',()=>{
 const next=updateEffectsAt(sequence,5,{splatAmount:.91},null);
 assert.equal(next.splatAmount,.91);assert.equal(next.effectCues,sequence.effectCues);
 assert.equal(effectEditorAt(next,5,null).settings.splatAmount,.91);
 assert.equal(effectEditorAt(next,5).settings.splatAmount,.24);
 assert.equal(effectEditorAt(next,5,'deleted').activeId,'second');
});
test('inserting a cue copies the displayed settings without changing other cues',()=>{
 const next=insertEffectCue(sequence,3,'new','second');
 assert.deepEqual(next.effectCues.find(c=>c.id==='new').values,sequence.effectCues[1].values);
 assert.equal(next.effectCues.find(c=>c.id==='first'),sequence.effectCues[0]);
});
test('shortened or disabled timelines cannot silently redirect a selected cue edit',()=>{
 const short={...sequence,duration:3};const changed=updateEffectsAt(short,3,{splatSpeed:1.9},'second');
 assert.equal(changed.effectCues[1].values.splatSpeed,1.9);assert.equal(changed.effectCues[0],sequence.effectCues[0]);
 const disabled=updateEffectsAt({...sequence,effectTimeline:false},3,{splatAmount:.2},'first');
 assert.equal(disabled.splatAmount,.2);assert.equal(disabled.effectCues,sequence.effectCues);
});
test('grading stays fully applied across geometry fades without saturation flashes',()=>{
 for(const time of [1.71,1.99,2,2.01,2.29,3.99,4,4.01]){
  const resolved=effectSettingsAt(sequence,time),grade=gradingState(resolved.settings);
  assert.equal(grade.mix,1);assert.equal(grade.values.saturation,.32);
 }
 assert.equal(effectSettingsAt(sequence,2).fade,0);
 assert.equal(gradingState({...tuned,gradeEnabled:false}).mix,0);
});
