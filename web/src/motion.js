import {gradingDefaults} from './color-grading.js';
export const defaults = {
  assetId:'', musicId:'', duration:12, fps:30, resolution:'1080', aspect:'16:9',
  splatTimeline:false,splatClips:[],backgroundTimeline:false,backgroundCues:[],
  cameraMode:'orbit', orbit:100, azimuth:0, elevation:5, distance:3.9, fov:42,
  keyframes:[], easing:true, background:'#111614', orientation:[0,0,0],
  glow:.22, chroma:.15, pulse:.18, particles:.12, tint:.2, sensitivity:1, volume:.8,
  splatMode:'off',splatAmount:.45,splatDetail:.95,splatSize:.5,splatTrails:.4,
  splatSpeed:.6,splatMusic:.35,splatBand:'bass',splatAnimation:'hold',splatColor:'#b4dcff',
  effectTimeline:false,effectCues:[],effectTransition:.6,
  waveEnabled:false,waveAmount:.25,waveWidth:.35,wavePeriod:4,waveDirection:'up',
  waveGlow:.7,waveColor:'#93e8ff',waveMusic:.25,waveBand:'bass',
  gridEnabled:false,gridStyle:'nodes',gridDensity:16,gridOpacity:.3,gridColor:'#b0b7bd',
  spaceGrid:'off',spaceSpacing:.5,spaceSize:10,spaceHeight:5,spaceY:-1.2,
  spaceOpacity:.45,spaceColor:'#91a0a8',floorEnabled:false,floorColor:'#182125',
  subjectVisible:true,spaceStyle:'lines',spacePointSize:2.5,spaceClearance:.65,
  glitchEnabled:false,glitchAmount:.3,glitchSpeed:.6,glitchMusic:.3,glitchBand:'high',glitchColor:'#b9d6d0',
  glitchStyle:'mixed',glitchDensity:.35,
  consoleEnabled:false,consoleStyle:'editorial',consoleDensity:.4,consoleOpacity:.55,consoleText:'FIELD / SCAN\nPOINT STREAM\nSYNC',
  ...gradingDefaults,textLayers:[],
  audioOffset:0, crop:false, cropSize:[2.5,2.7,2.5], cropY:0,
  comfyUrl:'http://127.0.0.1:8188', seed:42, videoDuration:10, turbo:true, comfyImageFit:'contain',
  maskPrompt:'person, sword', masks:true, maxFrames:180, steps:30000,
};
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const lerp = (a,b,t) => a+(b-a)*t;
export function audioAt(analysis,time,settings){
  const t=time+(settings.audioOffset||0);
  if(!analysis || t<0 || t>=analysis.duration) return {energy:0,bass:0,mid:0,high:0,pulse:0};
  const x=t*analysis.fps,i=Math.floor(x),f=x-i;
  return Object.fromEntries(['energy','bass','mid','high','pulse'].map(key=>{
    const a=analysis[key]||[];
    return [key,clamp(lerp(a[i]||0,a[Math.min(i+1,a.length-1)]||0,f)*(settings.sensitivity??1),0,1)];
  }));
}
export function cameraAt(s,time){
  const t=clamp(time,0,s.duration), frames=[...(s.keyframes||[])].sort((a,b)=>a.time-b.time);
  if(s.cameraMode==='keyframes' && frames.length){
    if(t<=frames[0].time) return structuredClone(frames[0]);
    if(t>=frames.at(-1).time) return structuredClone(frames.at(-1));
    let n=frames.findIndex(k=>k.time>t);
    const a=frames[n-1],b=frames[n];
    let u=(t-a.time)/Math.max(.001,b.time-a.time);
    if(s.easing)u=u*u*(3-2*u);
    return {position:a.position.map((v,i)=>lerp(v,b.position[i],u)),target:a.target.map((v,i)=>lerp(v,b.target[i],u)),fov:lerp(a.fov,b.fov,u)};
  }
  const u=s.cameraMode==='still'?0:t/Math.max(.1,s.duration);
  const angle=(s.azimuth + s.orbit*u)*Math.PI/180, elev=s.elevation*Math.PI/180;
  const r=s.distance*(s.cameraMode==='push'?lerp(1,.65,u):1);
  return {position:[Math.sin(angle)*Math.cos(elev)*r,Math.sin(elev)*r,Math.cos(angle)*Math.cos(elev)*r],target:[0,0,0],fov:s.fov};
}
export function exportSize(s){
  const short=Number(s.resolution),aspect=s.aspect==='9:16'?9/16:s.aspect==='1:1'?1:16/9;
  const h=aspect>=1?short:Math.round(short/aspect/2)*2,w=aspect>=1?Math.round(short*aspect/2)*2:short;
  return {width:w,height:h};
}
export function timecode(t){const ticks=Math.round(Math.max(0,t)*100);return `${String(Math.floor(ticks/6000)).padStart(2,'0')}:${String(Math.floor(ticks/100)%60).padStart(2,'0')}.${String(ticks%100).padStart(2,'0')}`;}
