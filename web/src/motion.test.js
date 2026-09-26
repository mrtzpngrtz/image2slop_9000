import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,audioAt,cameraAt,exportSize,timecode} from './motion.js';
test('camera uses exact endpoint poses and sorts keyframes without mutating them',()=>{
 const a={time:0,position:[0,0,4],target:[0,0,0],fov:40};
 const b={time:10,position:[4,2,0],target:[1,0,0],fov:60};
 const s={...defaults,duration:10,cameraMode:'keyframes',keyframes:[b,a]};
 assert.deepEqual(cameraAt(s,0).position,a.position);assert.deepEqual(cameraAt(s,10).position,b.position);
 assert.deepEqual(cameraAt(s,5).position,[2,1,2]);assert.equal(s.keyframes[0],b);
 assert.deepEqual(cameraAt(s,50).position,b.position);
});
test('audio interpolation, trim and silence use the same deterministic timeline',()=>{
 const analysis={fps:2,duration:2,energy:[0,1,0,1],bass:[0,.4,.8,1],mid:[],high:[],pulse:[]};
 assert.equal(audioAt(analysis,.25,{sensitivity:1}).energy,.5);
 assert.equal(audioAt(analysis,0,{audioOffset:.5,sensitivity:2}).bass,.8);
 assert.equal(audioAt(analysis,2,{sensitivity:1}).energy,0);
 assert.equal(audioAt(null,3,defaults).bass,0);
});
test('orbit radius stays constant and a static camera does not move',()=>{
 const s={...defaults,orbit:360,elevation:0,distance:4};
 for(const t of [0,2,4,8,12])assert.ok(Math.abs(Math.hypot(...cameraAt(s,t).position)-4)<1e-9);
 assert.deepEqual(cameraAt({...s,cameraMode:'still'},0),cameraAt({...s,cameraMode:'still'},12));
});
test('export dimensions are even and match the requested aspect',()=>{
 assert.deepEqual(exportSize({...defaults,resolution:'1080',aspect:'16:9'}),{width:1920,height:1080});
 assert.deepEqual(exportSize({...defaults,resolution:'1080',aspect:'9:16'}),{width:1080,height:1920});
 assert.deepEqual(exportSize({...defaults,resolution:'2160',aspect:'1:1'}),{width:2160,height:2160});
});
test('timeline labels keep exact centiseconds and carry across minute boundaries',()=>{
 assert.equal(timecode(1.2),'00:01.20');assert.equal(timecode(59.999),'01:00.00');assert.equal(timecode(-1),'00:00.00');
});
