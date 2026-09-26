import test from 'node:test';
import assert from 'node:assert/strict';
import {signalAt,hasSceneContent} from './signal-state.js';
import {volumeLayout} from './volume-grid.js';
import {defaults} from './motion.js';
import {effectSettingsAt,insertEffectCue,updateEffectsAt} from './effect-timeline.js';

test('raster-only projects can play and export without a splat',()=>{
 assert.equal(hasSceneContent(defaults,false),false);
 assert.equal(hasSceneContent({...defaults,spaceGrid:'volume',subjectVisible:false},false),true);
 assert.equal(hasSceneContent({...defaults,subjectVisible:false},true),false);
 assert.equal(hasSceneContent({...defaults,consoleEnabled:true},false),true);
 assert.equal(hasSceneContent({...defaults,spaceGrid:'invalid'},false),false);
});

test('glitch and console are deterministic on reverse seeks, respect music band and effect cues',()=>{
 const settings={...defaults,glitchEnabled:true,glitchBand:'bass',consoleEnabled:true};
 const before=signalAt(settings,2.3,{bass:.6});
 signalAt(settings,6);assert.deepEqual(signalAt(settings,2.3,{bass:.6}),before);
 assert.ok(before.amount>signalAt(settings,2.3,{high:1}).amount);
 assert.equal(signalAt(settings,2.3,{},0).amount,0);
 assert.equal(signalAt(defaults,2.3).consoleOpacity,0);
 const sequence=insertEffectCue(settings,2,'cue');
 const changed=updateEffectsAt(sequence,2.5,{glitchEnabled:false,consoleText:'Custom',subjectVisible:false});
 assert.equal(effectSettingsAt(changed,2.5).settings.glitchEnabled,false);
 assert.equal(effectSettingsAt(changed,1).settings.glitchEnabled,true);
 assert.equal(effectSettingsAt(changed,2.5).settings.consoleText,'Custom');
 assert.equal(changed.subjectVisible,true);
});

test('volume density has a memory bound even for imported extreme values',()=>{
 for(const args of [[30,15,.1],[Infinity,NaN,-1],[10,5,.5]]){
  const {xs,ys,spacing}=volumeLayout(...args);
  assert.ok(xs.length*xs.length*ys.length<=48000);
  assert.ok(spacing>0&&Number.isFinite(spacing));
  assert.ok([...xs,...ys].every(Number.isFinite));
 }
});

test('graphic variants and mark density are captured and restored at effect changes',()=>{
 const base={...defaults,consoleEnabled:true,glitchEnabled:true};
 let sequence=insertEffectCue(base,2,'register');
 sequence=updateEffectsAt(sequence,2.5,{consoleStyle:'register',glitchStyle:'corners',glitchDensity:.1});
 sequence=insertEffectCue(sequence,4,'minimal');
 sequence=updateEffectsAt(sequence,4.5,{consoleStyle:'minimal',glitchStyle:'lines'});
 assert.equal(effectSettingsAt(sequence,1).settings.consoleStyle,'editorial');
 assert.equal(effectSettingsAt(sequence,3).settings.consoleStyle,'register');
 assert.equal(effectSettingsAt(sequence,5).settings.consoleStyle,'minimal');
 assert.equal(effectSettingsAt(sequence,3).settings.glitchStyle,'corners');
 assert.equal(effectSettingsAt(sequence,5).settings.glitchDensity,.1);
 assert.equal(effectSettingsAt(sequence,1).settings.glitchDensity,.35);
});
