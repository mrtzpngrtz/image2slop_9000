import test from 'node:test';
import assert from 'node:assert/strict';
import {newTextLayer,textOpacityAt,layoutText,moveText} from './text-layout.js';
import {hasSceneContent} from './signal-state.js';
import {defaults} from './motion.js';
import {gradingValues,gradingDefaults,gradingPresets} from './color-grading.js';
import {insertEffectCue,updateEffectsAt,effectSettingsAt} from './effect-timeline.js';

test('titles have deterministic time windows and fades; text-only scenes can export',()=>{
 const layer={...newTextLayer('title'),start:2,end:5,fade:.5};
 assert.equal(textOpacityAt(layer,1,6),0);assert.equal(textOpacityAt(layer,3,6),1);
 assert.equal(textOpacityAt(layer,2.25,6),.5);assert.equal(textOpacityAt(layer,4.75,6),.5);
 assert.equal(textOpacityAt(layer,5.1,6),0);assert.equal(textOpacityAt({...layer,enabled:false},3,6),0);
 assert.equal(textOpacityAt({...layer,start:5,end:2},3,6),0);
 assert.equal(hasSceneContent({...defaults,textLayers:[layer]},false),true);
 assert.equal(hasSceneContent({...defaults,textLayers:[{...layer,text:' \n'}]},false),false);
});

test('titles wrap long words and retain placement across preview/export resolutions',()=>{
 const layer={...newTextLayer('title'),text:'Akzidenz\nÄÖÜ / 123',x:.5,y:.7,align:'center',tracking:.02};
 const measure=(text,size)=>Array.from(text).length*size*.5;
 const preview=layoutText(layer,640,360,measure),film=layoutText(layer,1920,1080,measure);
 for(const key of ['x','y','width','height','size'])assert.ok(Math.abs(preview[key]*3-film[key])<1e-8);
 const narrow=layoutText({...layer,text:'unbroken'.repeat(30),size:10},405,720,measure);
 assert.ok(narrow.lines.length>1);assert.ok(narrow.lines.every(l=>narrow.length(l)<=405));
 assert.ok(narrow.x>=0);assert.ok(narrow.width<=405);
 const moved=moveText(layer,1,-1);assert.equal(moved.x,1);assert.equal(moved.y,0);assert.equal(layer.x,.5);
});

test('grading defaults are neutral, imported values are bounded, and cues preserve titles',()=>{
 assert.deepEqual(gradingValues(gradingDefaults),{exposure:0,contrast:1,saturation:1,temperature:0,tint:0,shadows:0,highlights:0});
 assert.equal(gradingValues({gradeExposure:Infinity,gradeSaturation:-30}).exposure,0);
 assert.equal(gradingValues({gradeExposure:9,gradeContrast:NaN}).exposure,3);
 const base={...defaults,textLayers:[newTextLayer('title')]};
 const sequence=insertEffectCue(base,3,'look');
 const changed=updateEffectsAt(sequence,4,{...gradingPresets.mono,textLayers:[]});
 assert.equal(effectSettingsAt(changed,4).settings.gradeSaturation,0);
 assert.equal(effectSettingsAt(changed,1).settings.gradeSaturation,1);
 assert.deepEqual(changed.textLayers,base.textLayers);
});

test('decorated text keeps its entire draggable frame inside every video format and scales with export',()=>{
 const measure=(text,size)=>Array.from(text).length*size*.55;
 for(const decoration of ['none','rule','corners','register','arrow'])for(const align of ['left','center','right'])for(const [w,h] of [[1280,720],[720,1280],[720,720]]){
  const layer={...newTextLayer('label'),text:'Motion\nStudy / 01',decoration,align,x:1,y:1,size:8};
  const a=layoutText(layer,w,h,measure),b=layoutText(layer,w*3,h*3,measure);
  for(const key of ['x','y','width','height','textX','textY','textWidth'])assert.ok(Math.abs(a[key]*3-b[key])<1e-7,`${decoration}: ${key}`);
  assert.ok(a.x>=0&&a.y>=0&&a.x+a.width<=w&&a.y+a.height<=h);
  assert.ok(a.textX>=a.x&&a.textY>=a.y&&a.textX+a.textWidth<=a.x+a.width+.001);
  const large=layoutText({...layer,text:'WIDE\nTEXT\n'.repeat(20),size:35,lineHeight:2},w,h,measure);
  assert.ok(large.x+large.width<=w&&large.y+large.height<=h);
 }
});
