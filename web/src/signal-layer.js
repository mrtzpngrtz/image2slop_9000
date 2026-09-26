import * as THREE from 'three';
import {signalAt,signalRandom as random} from './signal-state.js';
import {drawConsole} from './console-graphics.js';
import {loadTextFont} from './text-layer.js';

// Decorative graphics only. User text is painted literally, never executed.
export function createSignalLayer(){
 const group=new THREE.Group();group.visible=false;
 const count=48,geometry=new THREE.PlaneGeometry(1,1);
 geometry.setAttribute('markKind',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i%6),1));
 const material=new THREE.ShaderMaterial({alphaToCoverage:true,depthWrite:true,side:THREE.DoubleSide,
  uniforms:{ink:{value:new THREE.Color('#b9d6d0')},strength:{value:0},style:{value:-1}},
  vertexShader:'attribute float markKind;varying vec2 p;varying float kind;void main(){p=uv;kind=markKind;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 p;varying float kind;uniform vec3 ink;uniform float strength;uniform float style;
   float segment(vec2 a,vec2 b){vec2 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.,1.);return length(p-a-t*d);}
   void main(){
    float k=kind;if(style==0.)k=mod(kind,2.)*4.;if(style==1.)k=mod(kind,3.)*2.+1.;if(style==2.)k=2.;
    float d=1.;
    if(k<.5){d=min(segment(vec2(.08,.5),vec2(.92,.5)),min(segment(vec2(.08,.44),vec2(.08,.56)),segment(vec2(.92,.44),vec2(.92,.56))));}
    else if(k<1.5){d=min(segment(vec2(.25,.5),vec2(.75,.5)),segment(vec2(.5,.25),vec2(.5,.75)));}
    else if(k<2.5){vec2 q=min(p,1.-p);d=min(length(q-vec2(clamp(q.x,.1,.26),.1)),length(q-vec2(.1,clamp(q.y,.1,.26))));}
    else if(k<3.5){d=min(segment(vec2(.2,.5),vec2(.8,.5)),min(segment(vec2(.58,.28),vec2(.8,.5)),segment(vec2(.58,.72),vec2(.8,.5))));}
    else if(k<4.5){d=segment(vec2(.1,.7),vec2(.9,.7));for(int i=0;i<7;i++){float x=.1+float(i)*.13333;d=min(d,segment(vec2(x,.7),vec2(x,mod(float(i),3.)==0.?.48:.6)));}}
    else {d=1.;for(int i=0;i<3;i++)for(int j=0;j<3;j++){vec2 q=abs(p-(vec2(float(i),float(j))*.24+.26));d=min(d,max(q.x,q.y)-.012);}}
    float aa=max(length(fwidth(p)),.0001);float mask=1.-smoothstep(aa*.15,aa*.85,d);
    if(mask*strength<.001)discard;gl_FragColor=vec4(ink,mask*strength);
   }`});
 const marks=new THREE.InstancedMesh(geometry,material,count);marks.frustumCulled=false;marks.renderOrder=-10;group.add(marks);
 const transform=new THREE.Object3D();
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=2;canvas.height=2;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 let cache='';
 return {group,texture,async update(s,time,audio,camera,width,height,fade=1){
  const state=signalAt(s,time,audio,fade);group.visible=state.amount>0;
  material.uniforms.ink.value.set(s.glitchColor||'#b9d6d0');material.uniforms.strength.value=state.amount;
  material.uniforms.style.value={lines:0,marks:1,corners:2}[s.glitchStyle]??-1;
  if(group.visible){
   for(let i=0;i<count;i++){
    const seed=i*19+2,active=i<8+Math.round((s.glitchDensity??.35)*40)&&random(state.tick*31+seed)<.35+state.amount*.45;
    const a=random(seed)*Math.PI*2,r=1.5+random(seed+1)*3.6;
    transform.position.set(Math.cos(a)*r+(random(state.tick+seed)-.5)*state.burst*.5,-1+random(seed+2)*4,Math.sin(a)*r);
    transform.quaternion.copy(camera.quaternion);
    const size=.09+random(seed+3)*.43;transform.scale.set(active?size:0,size,1);
    transform.updateMatrix();marks.setMatrixAt(i,transform.matrix);
   }
   marks.instanceMatrix.needsUpdate=true;
  }
  if(state.consoleOpacity>0){
   const fonts=await Promise.all([loadTextFont(300),loadTextFont(400)]);
   const key=JSON.stringify([width,height,Math.floor(time*100),s.consoleStyle,s.consoleDensity,s.consoleText,s.glitchColor,state.tick,state.burst,audio.bass,audio.mid,audio.high,fonts]);
   if(key!==cache){
    if(canvas.width!==width||canvas.height!==height){texture.dispose();canvas.width=width;canvas.height=height;}
    ctx.clearRect(0,0,width,height);const scale=Math.min(width,height)/720;
    ctx.save();ctx.scale(scale,scale);drawConsole(ctx,s,time,audio,state,width/scale,height/scale);ctx.restore();
    texture.needsUpdate=true;cache=key;
   }
  }
  return state;
 },dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
