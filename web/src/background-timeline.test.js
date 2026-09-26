import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from './motion.js';
import {backgroundSettingsAt,backgroundSegments,backgroundEditorAt,updateBackgroundAt,insertBackgroundCue} from './background-timeline.js';
import {moveTimelinePoint,removeTimelinePoint} from './timeline-editing.js';
import {hasSceneContent} from './signal-state.js';

const settings={...defaults,duration:12,backgroundTimeline:true,backgroundCues:[
 {id:'a',time:0,transition:'cut',blend:0,values:{background:'#000000',gridEnabled:false}},
 {id:'b',time:4,transition:'fade',blend:2,values:{background:'#ffffff',gridEnabled:true,gridStyle:'dots',gridOpacity:.8}},
 {id:'c',time:8,transition:'cut',blend:2,values:{background:'#ff0000',gridEnabled:false}},
]};
test('legacy projects retain their background and grid without a timeline',()=>{
 const s={...defaults,gridEnabled:true,gridStyle:'lines',background:'#183a4d'};
 assert.deepEqual(backgroundSettingsAt(s,5),s);assert.equal(backgroundSegments(s).length,1);
 assert.equal(backgroundSegments(s)[0].end,12);
});
test('background fades interpolate color in linear light and respect cut boundaries',()=>{
 assert.equal(backgroundSettingsAt(settings,4).background,'#000000');
 const middle=backgroundSettingsAt(settings,5);assert.equal(middle.background,'#bcbcbc');assert.equal(middle.gridOpacity,.4);
 assert.equal(backgroundSettingsAt(settings,6).background,'#ffffff');
 assert.equal(backgroundSettingsAt(settings,8).background,'#ff0000');assert.equal(backgroundSettingsAt(settings,8).gridEnabled,false);
 assert.deepEqual(backgroundSettingsAt(settings,5),middle);
});
test('pattern switches fade out before changing style and fade in afterwards',()=>{
 const s={...settings,backgroundCues:[{...settings.backgroundCues[0],values:{gridEnabled:true,gridStyle:'lines',gridOpacity:.8}},settings.backgroundCues[1]]};
 assert.equal(backgroundSettingsAt(s,5).gridOpacity,0);
 assert.equal(backgroundSettingsAt(s,4.5).gridStyle,'lines');assert.equal(backgroundSettingsAt(s,5.5).gridStyle,'dots');
 assert.ok(backgroundSettingsAt(s,4.5).gridOpacity>0);assert.ok(backgroundSettingsAt(s,5.5).gridOpacity>0);
});
test('editing a selected background changes only its own values, even while fading',()=>{
 assert.equal(backgroundEditorAt(settings,4.1,'b').background,'#ffffff');
 const next=updateBackgroundAt(settings,0,{background:'#112233',gridStyle:'lines',assetId:'wrong',textLayers:[]},'b');
 assert.equal(next.backgroundCues[1].values.background,'#112233');assert.equal(next.backgroundCues[0],settings.backgroundCues[0]);
 assert.equal(next.assetId,settings.assetId);assert.equal(next.textLayers,settings.textLayers);assert.equal(next.background,settings.background);
});
test('new cues preserve the original background, avoid collisions and can export alone',()=>{
 const s=insertBackgroundCue(defaults,0,'two','one');assert.deepEqual(s.backgroundCues.map(c=>c.time),[0,6]);
 assert.equal(s.backgroundCues[0].values.background,defaults.background);assert.equal(hasSceneContent(s,false),true);
 const again=insertBackgroundCue(s,6,'three','unused');assert.equal(new Set(again.backgroundCues.map(c=>c.time)).size,3);
 assert.equal(again.keyframes,defaults.keyframes);assert.equal(again.splatClips,defaults.splatClips);
});
test('moving, reordering and removing background switches retain their looks',()=>{
 assert.equal(moveTimelinePoint(settings,'background','a',2),settings);
 const moved=moveTimelinePoint(settings,'background','b',10);assert.deepEqual(moved.backgroundCues.map(c=>c.id),['a','c','b']);
 assert.equal(backgroundSettingsAt(moved,11.9).background,'#ffffff');
 const removed=removeTimelinePoint(settings,'background','a');assert.equal(removed.backgroundCues[0].time,0);assert.equal(backgroundSettingsAt(removed,0).background,'#ffffff');
 const last=removeTimelinePoint({...settings,backgroundCues:[settings.backgroundCues[0]]},'background','a');assert.equal(last.backgroundTimeline,false);assert.equal(backgroundSettingsAt(last,0).background,settings.background);
});
test('shortening a film bounds transitions without discarding later backgrounds',()=>{
 const s={...settings,duration:5};assert.equal(backgroundSegments(s).length,2);assert.equal(backgroundSegments(s)[1].blend,.9);
 assert.equal(s.backgroundCues.length,3);assert.equal(backgroundSettingsAt(s,5).background,'#ffffff');
});
