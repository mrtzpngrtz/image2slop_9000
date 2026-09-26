import * as THREE from 'three';
import {dyno} from '@sparkjsdev/spark';
import {splatEffectAt,waveEffectAt} from './splat-effects.js';

// Modify the actual Gaussian centers/scales after normalization into world space.
// Source splats remain immutable; uniforms use the film's time, never wall time.
export function createSplatModifier(){
  const floats=['mode','time','amount','detail','size','trails','energy','waveStrength','waveWidth','waveFront','waveAxis','waveGlow','clipOpacity','clipScatter','clipWipe','clipProgress'];
  const uniforms=Object.fromEntries(floats.map(key=>[key,dyno.dynoFloat(0)]));
  uniforms.color=dyno.dynoVec3(new THREE.Vector3(.6,.8,1));
  uniforms.waveColor=dyno.dynoVec3(new THREE.Vector3(.4,.8,1));
  const modifier=dyno.dynoBlock({gsplat:dyno.Gsplat},{gsplat:dyno.Gsplat},({gsplat})=>{
    const effect=new dyno.Dyno({
      inTypes:{gsplat:dyno.Gsplat,...Object.fromEntries(floats.map(key=>[key,'float'])),color:'vec3',waveColor:'vec3'},
      outTypes:{gsplat:dyno.Gsplat},inputs:{gsplat,...uniforms},
      globals:()=>[`
        vec3 studioHash(float n){return fract(sin(vec3(n*1.13+1.7,n*1.71+9.2,n*2.31+2.8))*vec3(43758.5453,22578.1459,19642.349));}
        vec3 studioFlow(vec3 p,float t){return vec3(sin(p.y*4.1+t)*cos(p.z*3.3-t*.7),sin(p.z*4.7+t*.8)*cos(p.x*3.9+t*.3),sin(p.x*4.3-t*.6)*cos(p.y*3.5+t*.5));}
      `],
      statements:({inputs:i,outputs:o})=>[`
        ${o.gsplat} = ${i.gsplat};
        if (${i.mode}>0.5 && (${i.amount}>0.00001 || ${i.detail}>0.00001)) {
          vec3 p=${i.gsplat}.center;
          vec3 seed=studioHash(float(${i.gsplat}.index)+1.);
          vec3 noise=seed*2.-1.;
          float t=${i.time};
          float a=${i.amount};
          float release=smoothstep(.12,.95,seed.x);
          vec3 flow=studioFlow(p,t);
          vec3 delta=vec3(0.);
          if(${i.mode}<1.5){
            vec3 direction=normalize(p*.65+noise*.55+vec3(.001));
            delta=direction*a*a*(.25+release*2.8)+flow*a*release*.22;
          }else if(${i.mode}<2.5){
            float sweep=smoothstep(-.6,.85,p.x+a*.7);
            delta=vec3(-1.8,.45,.15)*a*(.15+release*1.3)*sweep;
            delta+=flow*a*release*.45+noise*a*release*.18;
          }else if(${i.mode}<3.5){
            float theta=a*(p.y*2.6+sin(t*.8+p.y)*.7);
            vec2 spin=mat2(cos(theta),-sin(theta),sin(theta),cos(theta))*p.xz;
            delta=vec3(spin.x-p.x,0.,spin.y-p.z);
            delta+=normalize(vec3(p.x,.12,p.z)+noise*.15)*a*release*.75+flow*a*.23;
          }else{
            float band=floor(p.y*32.);
            float flicker=sin(band*1.7+t*3.);
            delta=vec3(sin(band*2.3+t*2.1)*pow(max(0.,flicker),10.)*.8,0.,sin(p.y*16.+t)*.07)*a;
            delta+=noise*a*release*.09;
          }
          ${o.gsplat}.center=p+delta;
          float detail=max(${i.detail},smoothstep(0.,.22,length(delta)));
          float radius=mix(.0012,.008,${i.size})*(.55+seed.y*.9);
          float streak=step(.84,seed.z)*${i.trails}*min(1.,length(delta)*2.);
          vec3 tangent=normalize(delta+flow*.08+vec3(.0001));
          vec4 rotation=tangent.z<-.999?vec4(1.,0.,0.,0.):normalize(vec4(-tangent.y,tangent.x,0.,1.+tangent.z));
          ${o.gsplat}.scales=mix(${i.gsplat}.scales,vec3(radius*(1.-streak*.65),radius*(1.-streak*.65),radius+streak*.13),detail);
          vec4 original=${i.gsplat}.quaternion;
          if(dot(original,rotation)<0.)rotation=-rotation;
          ${o.gsplat}.quaternion=normalize(mix(original,rotation,detail));
          float luminance=dot(${i.gsplat}.rgba.rgb,vec3(.2126,.7152,.0722));
          float twinkle=.85+.15*sin(t*2.+seed.z*60.);
          vec3 light=mix(vec3(.92,.96,1.),${i.color},.35+seed.y*.4);
          vec3 color=mix(${i.gsplat}.rgba.rgb,light*(.25+luminance*.9),detail*.88)*twinkle;
          if(${i.mode}>3.5)color*=.72+.28*sin(p.y*110.-t*5.);
          ${o.gsplat}.rgba.rgb=mix(${i.gsplat}.rgba.rgb,color,detail);
          ${o.gsplat}.rgba.a*=mix(1.,.8+seed.y*.4,detail);
        }
        if(${i.waveStrength}>0.00001 || ${i.waveGlow}>0.00001){
          vec3 p=${i.gsplat}.center;
          float coord=${i.waveAxis}<.5?p.y:(${i.waveAxis}<1.5?p.x:(${i.waveAxis}<2.5?p.z:length(p)));
          float distance=(coord-${i.waveFront})/max(.08,${i.waveWidth});
          float band=exp(-distance*distance*2.);
          float ripple=sin(distance*3.14159265)*band;
          vec3 axis=${i.waveAxis}<.5?vec3(0.,1.,0.):(${i.waveAxis}<1.5?vec3(1.,0.,0.):vec3(0.,0.,1.));
          vec3 sideways=normalize(p-axis*dot(p,axis)+vec3(.12,.04,.15));
          if(${i.waveAxis}>2.5)sideways=normalize(p+vec3(.001));
          ${o.gsplat}.center+=sideways*ripple*${i.waveStrength}*.8;
          ${o.gsplat}.scales*=1.+band*${i.waveStrength}*.18;
          ${o.gsplat}.rgba.rgb=mix(${o.gsplat}.rgba.rgb,${i.waveColor}*(.7+band*.3),band*${i.waveGlow}*.9);
        }
        ${o.gsplat}.rgba.a*=${i.clipOpacity};
        if(${i.clipScatter}>0.00001){
          vec3 seed=studioHash(float(${i.gsplat}.index)+7.);
          vec3 direction=normalize(${i.gsplat}.center*.5+seed*2.-1.+vec3(.001));
          ${o.gsplat}.center+=direction*${i.clipScatter}*${i.clipScatter}*(.5+seed.y*2.5);
          ${o.gsplat}.scales=mix(${o.gsplat}.scales,vec3(.003+seed.x*.004),smoothstep(0.,.5,${i.clipScatter}));
        }
        if(abs(${i.clipWipe})>.5){
          float front=mix(-1.65,1.65,${i.clipProgress});
          float mask=1.-smoothstep(front-.09,front+.09,${i.gsplat}.center.y);
          if(${i.clipProgress}<=0.)mask=0.;
          if(${i.clipProgress}>=1.)mask=1.;
          ${o.gsplat}.rgba.a*=${i.clipWipe}>0.?mask:1.-mask;
        }
      `],
    });
    return {gsplat:effect.outputs.gsplat};
  });
  let previous='';
  const color=new THREE.Color();
  return {modifier,update(settings,time,audio,timeline,clip={}){
    const state={...splatEffectAt(settings,time,audio,timeline),...waveEffectAt(settings,time,audio,timeline),clipOpacity:clip.clipOpacity??1,clipScatter:clip.clipScatter??0,clipWipe:clip.clipWipe??0,clipProgress:clip.clipProgress??1};
    // An inactive effect must not regenerate/re-sort an otherwise still scene.
    const signature=state.mode||state.enabled?JSON.stringify(state):JSON.stringify([state.clipOpacity,state.clipScatter,state.clipWipe,state.clipProgress]);
    if(signature===previous)return {changed:false,state};
    previous=signature;
    for(const key of floats)uniforms[key].value=state[key];
    color.set(state.color);uniforms.color.value.set(color.r,color.g,color.b);
    color.set(state.waveColor);uniforms.waveColor.value.set(color.r,color.g,color.b);
    return {changed:true,state};
  }};
}
