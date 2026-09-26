const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const round=v=>Math.round(v*100)/100;

export function textWindow(layer,duration){
 const end=Math.max(0,finite(duration,0));
 return {start:clamp(finite(layer.start,0),0,end),end:clamp(finite(layer.end,end),0,end)};
}

// Lanes are only a view: array order still determines the text's drawing order.
export function textTimeline(settings){
 const lanes=[],clips=(settings.textLayers||[]).map((layer,index)=>({layer,index,...textWindow(layer,settings.duration)}));
 for(const clip of [...clips].sort((a,b)=>a.start-b.start||a.index-b.index)){
  let lane=lanes.findIndex(end=>end<=clip.start);
  if(lane<0)lane=lanes.length;
  lanes[lane]=Math.max(clip.start+.05,clip.end);clip.lane=lane;
 }
 return {clips,rows:Math.max(1,lanes.length)};
}

export function editTextTime(settings,id,mode,value,origin){
 const layer=(settings.textLayers||[]).find(l=>l.id===id);
 if(!layer||!Number.isFinite(value))return settings;
 const duration=Math.max(0,finite(settings.duration,0)),min=Math.min(.05,duration);
 let {start,end}=origin||textWindow(layer,duration);
 start=clamp(start,0,Math.max(0,duration-min));end=clamp(end,start+min,duration);
 let patch;
 if(mode==='move'){
  const length=end-start;start=round(clamp(value,0,duration-length));end=round(start+length);
  patch={start,end};
 }else if(mode==='start')patch={start:round(clamp(value,0,end-min))};
 else if(mode==='end')patch={end:round(clamp(value,start+min,duration))};
 else return settings;
 // A drag against a boundary must not turn an automatic film-end into a fixed one.
 const current=textWindow(layer,duration);
 if(Object.entries(patch).every(([key,v])=>v===current[key]))return settings;
 return {...settings,textLayers:settings.textLayers.map(l=>l.id===id?{...l,...patch}:l)};
}
