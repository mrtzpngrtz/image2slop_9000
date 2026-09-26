import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,cameraAt} from './motion.js';
import {effectSettingsAt} from './effect-timeline.js';
import {moveTimelinePoint,removeTimelinePoint,timelineDragTime} from './timeline-editing.js';

const scene={...defaults,duration:6,cameraMode:'keyframes',effectTimeline:true,effectTransition:0,
 keyframes:[{id:'a',time:0,position:[0,0,4],target:[0,0,0],fov:40},{id:'b',time:2,position:[4,2,0],target:[0,0,0],fov:50},{id:'c',time:6,position:[0,0,-4],target:[0,0,0],fov:60}],
 effectCues:[{id:'e1',time:0,values:{splatMode:'explode'}},{id:'e2',time:3,values:{splatMode:'vortex'}}]};

test('dragging camera points reorders the route, preserves poses and leaves other tracks untouched',()=>{
 const before=structuredClone(scene);
 const time=timelineDragTime(2,200,600,6);
 const changed=moveTimelinePoint(scene,'camera','b',time);
 assert.deepEqual(changed.keyframes.map(p=>p.time),[0,4,6]);
 assert.deepEqual(cameraAt(changed,4).position,[4,2,0]);
 assert.notDeepEqual(cameraAt(changed,2).position,cameraAt(scene,2).position);
 assert.equal(changed.effectCues,scene.effectCues);
 const crossed=moveTimelinePoint(changed,'camera','a',5);
 assert.deepEqual(crossed.keyframes.map(p=>p.id),['b','a','c']);
 assert.deepEqual(scene,before);
});

test('dragging effect switches changes playback at the new time without changing their looks',()=>{
 const changed=moveTimelinePoint(scene,'effect','e2',4.25);
 assert.equal(effectSettingsAt(changed,4.24).settings.splatMode,'explode');
 assert.equal(effectSettingsAt(changed,4.25).settings.splatMode,'vortex');
 assert.equal(changed.effectCues[1].values,scene.effectCues[1].values);
 assert.equal(changed.keyframes,scene.keyframes);
});

test('points stay in range and cannot overwrite another point when dragged together',()=>{
 const moved=moveTimelinePoint(scene,'camera','b',0);
 assert.equal(moved.keyframes.length,3);
 assert.equal(moved.keyframes.find(p=>p.id==='b').time,.05);
 assert.equal(moved.keyframes.find(p=>p.id==='a').time,0);
 assert.equal(moveTimelinePoint(scene,'camera','c',99).keyframes.at(-1).time,6);
 assert.equal(moveTimelinePoint(scene,'effect','e2',99).effectCues.at(-1).time,5.99);
 assert.equal(moveTimelinePoint(scene,'camera','a',-5).keyframes[0].time,0);
 assert.equal(moveTimelinePoint(scene,'camera','b',NaN),scene);
 assert.equal(moveTimelinePoint(scene,'camera','missing',3),scene);
 assert.equal(timelineDragTime(2,50,0,6),2);
});

test('deleting affects only the chosen point and the last camera point becomes static',()=>{
 const changed=removeTimelinePoint(scene,'effect','e2');
 assert.equal(changed.effectCues.length,1);
 assert.equal(effectSettingsAt(changed,5).settings.splatMode,'explode');
 assert.equal(changed.keyframes,scene.keyframes);
 let camera=removeTimelinePoint(scene,'camera','b');
 assert.deepEqual(camera.keyframes.map(p=>p.id),['a','c']);
 camera=removeTimelinePoint(removeTimelinePoint(camera,'camera','a'),'camera','c');
 assert.equal(camera.cameraMode,'still');
 assert.deepEqual(cameraAt(camera,0),cameraAt(camera,6));
 assert.equal(camera.effectCues,scene.effectCues);
 assert.equal(removeTimelinePoint(scene,'camera','missing'),scene);
 assert.equal(scene.keyframes.length,3);
});
