const pointKey = kind => kind==='camera'?'keyframes':kind==='effect'?'effectCues':kind==='splat'?'splatClips':kind==='background'?'backgroundCues':null;

export function pointTimeLimit(settings,kind){
 return Math.max(0,Math.round(settings.duration*100)-(kind==='camera'?0:1))/100;
}

// Work in centiseconds so adjacent points cannot collapse through rounding.
// Moving across another point reorders them; neither point is overwritten.
export function moveTimelinePoint(settings,kind,id,value){
 const key=pointKey(kind),points=key?settings[key]||[]:[];
 const point=points.find(p=>p.id===id);
 if(!point||!Number.isFinite(value))return settings;
 // The opening clip anchors the sequence at zero. Later clips can cross/reorder.
 if(['splat','background'].includes(kind)&&point.id===[...points].sort((a,b)=>a.time-b.time)[0]?.id)return settings;
 const end=Math.round(pointTimeLimit(settings,kind)*100);
 const wanted=Math.max(0,Math.min(end,Math.round(value*100)));
 const others=points.filter(p=>p.id!==id).map(p=>Math.round(p.time*100));
 const candidates=[wanted,0,end,...others.flatMap(t=>[t-5,t+5])]
  .filter(t=>t>=0&&t<=end&&others.every(other=>Math.abs(t-other)>=5));
 candidates.sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted)||Math.abs(a-point.time*100)-Math.abs(b-point.time*100));
 if(!candidates.length)return settings;
 const time=candidates[0]/100;
 if(time===point.time)return settings;
 return {...settings,[key]:points.map(p=>p.id===id?{...p,time}:p).sort((a,b)=>a.time-b.time)};
}

export function removeTimelinePoint(settings,kind,id){
 const key=pointKey(kind);
 if(!key||!(settings[key]||[]).some(p=>p.id===id))return settings;
 const points=settings[key].filter(p=>p.id!==id);
 if(['splat','background'].includes(kind)&&points.length){points.sort((a,b)=>a.time-b.time);points[0]={...points[0],time:0};}
 return {...settings,[key]:points,...(kind==='camera'&&!points.length&&settings.cameraMode==='keyframes'?{cameraMode:'still'}:{}),...(kind==='background'&&!points.length?{backgroundTimeline:false}:{})};
}

export function timelineDragTime(time,deltaX,width,duration){
 return width>0?time+deltaX/width*duration:time;
}
