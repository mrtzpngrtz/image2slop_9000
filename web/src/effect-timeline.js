import {clamp} from './motion.js';
import {gradingKeys} from './color-grading.js';

export const effectKeys = ['splatMode','splatAmount','splatDetail','splatSize','splatTrails','splatSpeed','splatMusic','splatBand','splatAnimation','splatColor','glow','chroma','pulse','particles','tint','waveEnabled','waveAmount','waveWidth','wavePeriod','waveDirection','waveGlow','waveColor','waveMusic','waveBand','glitchEnabled','glitchAmount','glitchSpeed','glitchMusic','glitchBand','glitchColor','consoleEnabled','consoleDensity','consoleOpacity','consoleText'];
effectKeys.push('consoleStyle','glitchStyle','glitchDensity',...gradingKeys);
export const captureEffects = settings => Object.fromEntries(effectKeys.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));
export function orderedEffectCues(settings){
  const unique=new Map();
  for(const cue of settings.effectCues||[]){
    if(Number.isFinite(cue.time)&&cue.time>=0&&cue.time<settings.duration)unique.set(cue.time,cue);
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
export function effectSettingsAt(settings,time){
  const cues=settings.effectTimeline?orderedEffectCues(settings):[];
  const t=clamp(time,0,settings.duration||12);
  let active=null,next=null;
  for(const cue of cues){if(cue.time<=t)active=cue;else{next=cue;break;}}
  const start=active?.time||0,end=next?.time??(settings.duration||12);
  const span=Math.max(.01,end-start),transition=clamp((settings.effectTransition??.6)/2,0,span/2);
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  let fade=1;
  if(transition>0){
    if(active&&start>0)fade*=smooth((t-start)/transition);
    if(next)fade*=smooth((end-t)/transition);
  }
  return {settings:active?{...settings,...captureEffects(active.values||{})}:settings,activeId:active?.id??null,start,end,localTime:t-start,duration:span,fade};
}
// Editing follows an explicitly selected cue; rendering always follows film time.
// undefined follows the playhead, null explicitly selects the opening section.
export function effectEditorAt(settings,time,selectedId){
  const current=effectSettingsAt(settings,time);
  if(!settings.effectTimeline||selectedId===undefined)return current;
  if(selectedId===null){
    const end=orderedEffectCues(settings)[0]?.time??settings.duration;
    return {...current,settings,activeId:null,start:0,end,duration:end};
  }
  const cue=(settings.effectCues||[]).find(c=>c.id===selectedId);
  if(!cue)return current;
  const end=(settings.effectCues||[]).filter(c=>c.time>cue.time).sort((a,b)=>a.time-b.time)[0]?.time??settings.duration;
  return {...current,settings:{...settings,...captureEffects(cue.values||{})},activeId:cue.id,start:cue.time,end,duration:Math.max(.01,end-cue.time)};
}
export function updateEffectsAt(settings,time,patch,selectedId){
  const {activeId}=effectEditorAt(settings,time,selectedId),values=captureEffects(patch);
  if(!activeId)return {...settings,...values};
  return {...settings,effectCues:settings.effectCues.map(c=>c.id===activeId?{...c,values:{...c.values,...values}}:c)};
}
export function insertEffectCue(settings,time,id,selectedId){
  const t=Math.round(clamp(time,0,Math.max(0,settings.duration-.01))*100)/100;
  const values=captureEffects(effectEditorAt(settings,t,selectedId).settings);
  return {...settings,effectTimeline:true,effectCues:[...(settings.effectCues||[]).filter(c=>Math.abs(c.time-t)>.05),{id,time:t,values}].sort((a,b)=>a.time-b.time)};
}
export function effectName(settings){
  const name={explode:'Explosion',drift:'Sternenstaub',vortex:'Wirbel',hologram:'Hologramm'}[settings.splatMode];
  return [name,settings.waveEnabled&&'Welle',settings.glitchEnabled&&'Glitch',settings.consoleEnabled&&'Console',settings.gradeEnabled&&'Grading'].filter(Boolean).join(' + ')||'Original';
}
export function effectSegments(settings){
  if(!settings.effectTimeline)return [{id:null,start:0,end:settings.duration,name:effectName(settings)}];
  const points=[0,...orderedEffectCues(settings).map(c=>c.time)].filter((v,i,a)=>a.indexOf(v)===i);
  return points.map((start,i)=>{const resolved=effectSettingsAt(settings,start);return {id:resolved.activeId,start,end:points[i+1]??settings.duration,name:effectName(resolved.settings)};});
}
