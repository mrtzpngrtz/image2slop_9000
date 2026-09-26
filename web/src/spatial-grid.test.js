import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSpatialGrid} from './spatial-grid.js';
import {defaults} from './motion.js';

test('old projects stay unchanged; a floor can be used without a grid',()=>{
 const space=createSpatialGrid();
 assert.equal(space.update({gridEnabled:true}),false);
 assert.equal(space.group.visible,false);
 assert.equal(space.update({...defaults,floorEnabled:true,spaceY:-.8,spaceSize:8}),false);
 const visible=space.group.children.filter(m=>m.visible);
 assert.equal(visible.length,1);
 space.group.updateMatrixWorld(true);
 const floor=visible[0];
 for(const x of [-.5,.5])for(const y of [-.5,.5]){
  const corner=floor.localToWorld(new THREE.Vector3(x,y,0));
  assert.ok(Math.abs(corner.y+.8)<1e-6);
  assert.ok(Math.abs(Math.abs(corner.x)-4)<1e-6);
  assert.ok(Math.abs(Math.abs(corner.z)-4)<1e-6);
 }
 space.dispose();
});

test('room walls face inward and geometry keeps its world position as the camera moves',()=>{
 const space=createSpatialGrid();space.update({...defaults,spaceGrid:'room',spaceSize:8,spaceHeight:4});
 space.group.updateMatrixWorld(true);
 const center=new THREE.Vector3(0,.8,0),walls=space.group.children.slice(2,6);
 for(const wall of walls){
  const inward=new THREE.Vector3(0,0,1).transformDirection(wall.matrixWorld);
  assert.ok(inward.dot(center.clone().sub(wall.position))>0);
  assert.equal(wall.material.depthWrite,true);
  assert.equal(wall.material.alphaToCoverage,true);
 }
 const p=space.group.children[1].localToWorld(new THREE.Vector3(.2,.2,0));
 const camera=new THREE.PerspectiveCamera(42,16/9,.01,100);
 camera.position.set(0,1,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const first=p.clone().project(camera);
 camera.position.set(5,1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 assert.ok(first.distanceTo(p.clone().project(camera))>.1);
 space.update({...defaults,spaceGrid:'floor'});
 assert.equal(space.group.children.filter(m=>m.visible).length,1);
 space.update(defaults);assert.equal(space.group.visible,false);
 space.dispose();
});

test('imported invalid dimensions cannot create unbounded or non-finite scene geometry',()=>{
 const space=createSpatialGrid();
 space.update({...defaults,spaceGrid:'room',spaceSize:Infinity,spaceHeight:-100,spaceY:NaN,spaceSpacing:0,spaceOpacity:5});
 space.group.updateMatrixWorld(true);
 for(const mesh of space.group.children.filter(child=>child.isMesh)){
  assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));
  assert.ok(mesh.scale.x>=2&&mesh.scale.x<=30);
 }
 const material=space.group.children[1].material;
 assert.equal(material.uniforms.spacing.value,.1);
 assert.equal(material.uniforms.strength.value,1);
 space.dispose();
});

test('volume points occupy the interior and line mode reuses the same lattice',()=>{
 const space=createSpatialGrid(),s={...defaults,spaceGrid:'volume',spaceStyle:'dots',spaceSize:4,spaceHeight:3,spaceSpacing:1};
 space.update(s);const volume=space.group.children.at(-1),points=volume.children[0];
 assert.equal(points.isPoints,true);assert.equal(volume.visible,true);
 assert.equal(space.group.children[1].visible,false);
 const positions=points.geometry.attributes.position;
 assert.equal(positions.count,100);
 assert.ok(Array.from(positions.array).every(Number.isFinite));
 assert.ok(Array.from({length:positions.count},(_,i)=>[positions.getX(i),positions.getY(i),positions.getZ(i)]).some(([x,y,z])=>x===0&&y===1&&z===0));
 space.update({...s,spaceStyle:'lines'});
 assert.equal(volume.children[0].isLineSegments,true);
 assert.equal(volume.children[0].geometry.attributes.position.count,130);
 space.update({...s,spaceGrid:'off'});assert.equal(volume.visible,false);
 space.dispose();
});
