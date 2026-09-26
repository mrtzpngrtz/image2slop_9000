import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextLayer} from './text-layer.js';
import {newTextLayer} from './text-layout.js';

test('switching rear text effects clears the old pass and retains coverage, timing and other layers',async()=>{
 const originalDocument=globalThis.document;
 globalThis.document={createElement(){
  const canvas={width:2,height:2,draws:[]};
  const ctx={font:'',measureText(t){return {width:t.length*12};},fillText(t){canvas.draws.push(t);},clearRect(){canvas.draws=[];},save(){},restore(){}};
  canvas.getContext=()=>ctx;return canvas;
 }};
 const titles=createTextLayer();
 try{
  const front={...newTextLayer('front'),text:'Front',font:'mono'};
  const legacy={...newTextLayer('rear'),text:'Rear',font:'mono',placement:'back'};delete legacy.sceneEffects;
  const clean={...legacy,id:'clean',text:'Clean',sceneEffects:false,end:3};
  const settings={duration:6,textLayers:[front,legacy,clean]};
  const first=await titles.update(settings,1,1280,720);
  const rear=titles.backgroundMesh.material.uniforms.titles.value;
  assert.deepEqual(titles.texture.image.draws,['Front']);
  assert.deepEqual(rear.image.draws,['Rear']);
  assert.deepEqual(titles.protectedTexture.image.draws,['Clean']);
  assert.equal(titles.hasProtectedText,true);assert.equal(titles.backgroundMesh.visible,true);
  legacy.sceneEffects=false;
  assert.equal(await titles.update(settings,1,1280,720),null,'changing effects leaves drag geometry unchanged');
  assert.deepEqual(rear.image.draws,[]);assert.equal(rear.image.width,2);
  assert.equal(titles.backgroundMesh.visible,false);
  assert.deepEqual(titles.protectedTexture.image.draws,['Rear','Clean']);
  assert.deepEqual(titles.texture.image.draws,['Front']);
  legacy.sceneEffects=true;
  const later=await titles.update(settings,4,1280,720);
  assert.equal(titles.hasProtectedText,false);assert.equal(titles.protectedTexture.image.width,2);
  assert.deepEqual(titles.protectedTexture.image.draws,[]);
  assert.equal(first.find(b=>b.id==='clean').visible,true);
  assert.equal(later.find(b=>b.id==='clean').visible,false);
  assert.deepEqual(rear.image.draws,['Rear']);
 }finally{titles.dispose();if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
