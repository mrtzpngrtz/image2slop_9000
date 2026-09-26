import test from 'node:test';
import assert from 'node:assert/strict';
import {editTextTime,textTimeline,textWindow} from './text-timeline.js';
import {newTextLayer,textOpacityAt} from './text-layout.js';

const layer={...newTextLayer('a'),text:'A\nB',start:2,end:5,fade:.2,placement:'back',sceneEffects:false};
const settings={duration:12,textLayers:[layer,{...newTextLayer('b'),start:4,end:9}]};
test('moving a title preserves duration, drawing order and all design properties',()=>{
 const s=editTextTime(settings,'a','move',7);
 assert.deepEqual(s.textLayers[0],{...layer,start:7,end:10});assert.equal(s.textLayers[1],settings.textLayers[1]);
 assert.equal(settings.textLayers[0].start,2);
 assert.equal(editTextTime(settings,'a','move',-20).textLayers[0].start,0);
 const end=editTextTime(settings,'a','move',20).textLayers[0];assert.equal(end.start,9);assert.equal(end.end,12);
});
test('pointer moves use the original duration even after clamping and reversing',()=>{
 const origin={start:2,end:5},edge=editTextTime(settings,'a','move',15,origin);
 const reverse=editTextTime(edge,'a','move',4.37,origin);
 assert.equal(reverse.textLayers[0].start,4.37);assert.equal(reverse.textLayers[0].end,7.37);
});
test('both trim edges have a minimum interval and update rendered time windows',()=>{
 const trimmed=editTextTime(editTextTime(settings,'a','start',3),'a','end',4).textLayers[0];
 assert.equal(textOpacityAt(trimmed,2.9,12),0);assert.equal(textOpacityAt(trimmed,3.5,12),1);assert.equal(textOpacityAt(trimmed,4,12),0);
 assert.equal(editTextTime(settings,'a','start',100).textLayers[0].start,4.95);
 assert.equal(editTextTime(settings,'a','end',-1).textLayers[0].end,2.05);
 assert.equal(editTextTime(settings,'a','move',NaN),settings);
});
test('automatic film ends remain automatic until intentionally trimmed',()=>{
 const s={duration:12,textLayers:[newTextLayer('all')]};
 assert.equal(editTextTime(s,'all','move',9),s);
 const trimmed=editTextTime(s,'all','start',3);assert.equal(trimmed.textLayers[0].end,null);
 assert.deepEqual(textWindow(trimmed.textLayers[0],20),{start:3,end:20});
 assert.equal(editTextTime(trimmed,'all','end',8).textLayers[0].end,8);
});
test('overlapping titles get separate lanes while adjacent ones can share a lane',()=>{
 const s={duration:12,textLayers:[{id:'z',start:5,end:9},{id:'x',start:0,end:5},{id:'y',start:2,end:6},{id:'disabled',start:0,end:null,enabled:false}]};
 const timeline=textTimeline(s);
 assert.equal(timeline.rows,3);assert.deepEqual(timeline.clips.map(c=>c.layer.id),['z','x','y','disabled']);
 assert.equal(timeline.clips[0].lane,timeline.clips[1].lane);assert.notEqual(timeline.clips[1].lane,timeline.clips[2].lane);
 assert.equal(textOpacityAt({...newTextLayer('x'),start:0,end:5},5,12),0);
 assert.equal(textOpacityAt({...newTextLayer('z'),start:5,end:9},5,12),1);
});
test('shortening the film only clips the view; restoring duration restores hidden titles',()=>{
 const s={duration:3,textLayers:settings.textLayers};
 assert.deepEqual(textTimeline(s).clips.map(c=>[c.start,c.end]),[[2,3],[3,3]]);
 assert.deepEqual(textTimeline({...s,duration:12}).clips.map(c=>[c.start,c.end]),[[2,5],[4,9]]);
});
