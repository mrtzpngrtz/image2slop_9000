import {Color} from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const backgroundKeys=['background','gridEnabled','gridStyle','gridDensity','gridOpacity','gridColor'];
export const captureBackground=s=>Object.fromEntries(backgroundKeys.filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
export function backgroundSegments(s){
 const cues=s.backgroundTimeline?(s.backgroundCues||[]).filter(c=>c.id&&Number.isFinite(c.time)&&c.time>=0&&c.time<s.duration).sort((a,b)=>a.time-b.time):[];
 const base=captureBackground(s);
 if(!cues.length)return [{id:'background-base',time:0,start:0,end:s.duration,blend:0,transition:'cut',values:base}];
 return cues.map((c,i)=>({...c,values:{...base,...captureBackground(c.values||{})},start:i?c.time:0,end:cues[i+1]?.time??s.duration,
  blend:i&&c.transition!=='cut'?clamp(Number(c.blend)||0,0,((cues[i+1]?.time??s.duration)-c.time)*.9):0}));
}
function activeSegment(segments,time){return Math.max(0,segments.findLastIndex(c=>c.start<=time));}
export function backgroundEditorAt(s,time,id){
 const segments=backgroundSegments(s),clip=segments.find(c=>c.id===id)||segments[activeSegment(segments,time)];
 return {...s,...clip.values};
}
const mix=(a,b,t)=>a+(b-a)*t;
const color=(a,b,t)=>'#'+new Color(a).lerp(new Color(b),t).getHexString();
export function backgroundSettingsAt(s,time){
 const segments=backgroundSegments(s),index=activeSegment(segments,time),clip=segments[index];
 const to=clip.values;
 if(!index||!clip.blend||time>=clip.start+clip.blend)return {...s,...to};
 const from=segments[index-1].values,x=clamp((time-clip.start)/clip.blend,0,1),u=x*x*(3-2*x);
 const switching=from.gridEnabled&&to.gridEnabled&&from.gridStyle!==to.gridStyle;
 const opacity=mix(from.gridEnabled?(from.gridOpacity??.3):0,to.gridEnabled?(to.gridOpacity??.3):0,u)*(switching?Math.abs(1-2*u):1);
 return {...s,...to,
  background:color(from.background||'#111614',to.background||'#111614',u),
  gridEnabled:!!(from.gridEnabled||to.gridEnabled),gridOpacity:opacity,
  gridStyle:(u<.5&&from.gridEnabled?from:to.gridEnabled?to:from).gridStyle,
  gridColor:color(from.gridColor||'#b0b7bd',to.gridColor||'#b0b7bd',u),
  gridDensity:mix(from.gridDensity??16,to.gridDensity??16,u),
 };
}
export function updateBackgroundAt(s,time,patch,id){
 const values=captureBackground(patch),segments=backgroundSegments(s);
 const clip=segments.find(c=>c.id===id)||segments[activeSegment(segments,time)];
 if(!s.backgroundTimeline||!(s.backgroundCues||[]).some(c=>c.id===clip.id))return {...s,...values};
 return {...s,backgroundCues:s.backgroundCues.map(c=>c.id===clip.id?{...c,values:{...c.values,...values}}:c)};
}
export function insertBackgroundCue(s,time,id,baseId){
 const values=captureBackground(backgroundSettingsAt(s,time));
 const cues=s.backgroundTimeline&&s.backgroundCues?.length?[...s.backgroundCues]:[{id:baseId,time:0,transition:'cut',blend:0,values:captureBackground(s)}];
 const end=Math.max(0,Math.round((s.duration-.05)*100));
 let wanted=Math.round(clamp(time,0,end/100)*100);
 if(wanted<5){const last=Math.max(0,...cues.filter(c=>c.time<s.duration).map(c=>c.time));wanted=Math.round((last+s.duration)/2*100);}
 const others=cues.map(c=>Math.round(c.time*100));
 const candidates=[wanted,end,...others.flatMap(t=>[t-5,t+5])].filter(t=>t>=5&&t<=end&&others.every(o=>Math.abs(t-o)>=5));
 candidates.sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted));
 if(!candidates.length)return s;
 cues.push({id,time:candidates[0]/100,transition:'fade',blend:1,values});cues.sort((a,b)=>a.time-b.time);
 return {...s,backgroundTimeline:true,backgroundCues:cues};
}
