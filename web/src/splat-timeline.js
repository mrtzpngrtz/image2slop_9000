const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const splatTransitions={cut:'Schnitt',fade:'Überblenden',particles:'Partikel',wipe:'Wipe'};

export function orderedSplatClips(settings){
 return (settings.splatClips||[]).filter(c=>c.id&&c.assetId&&Number.isFinite(c.time)&&c.time>=0&&c.time<settings.duration).sort((a,b)=>a.time-b.time);
}
export function splatSegments(settings){
 const clips=orderedSplatClips(settings);
 return clips.map((c,i)=>({...c,start:i?c.time:0,end:clips[i+1]?.time??settings.duration,
  blend:i&&c.transition!=='cut'?clamp(Number(c.blend)||0,0,((clips[i+1]?.time??settings.duration)-c.time)*.9):0}));
}
const neutral={clipOpacity:1,clipScatter:0,clipWipe:0,clipProgress:1};
export function splatsAt(settings,time){
 if(!settings.splatTimeline)return settings.assetId?[{id:'single',assetId:settings.assetId,orientation:settings.orientation,...neutral}]:[];
 const clips=splatSegments(settings);
 if(!clips.length)return [];
 const t=clamp(time,0,settings.duration),index=Math.max(0,clips.findLastIndex(c=>c.start<=t)),clip=clips[index];
 if(!index||!clip.blend||t>=clip.start+clip.blend)return [{...clip,...neutral}];
 const progress=clamp((t-clip.start)/clip.blend,0,1),u=progress*progress*(3-2*progress);
 const outgoing={...clips[index-1],...neutral},incoming={...clip,...neutral};
 if(clip.transition==='wipe'){
  Object.assign(outgoing,{clipWipe:-1,clipProgress:u});Object.assign(incoming,{clipWipe:1,clipProgress:u});
 }else{
  outgoing.clipOpacity=1-u;incoming.clipOpacity=u;
  if(clip.transition==='particles'){outgoing.clipScatter=u;incoming.clipScatter=1-u;}
 }
 return [outgoing,incoming];
}

export function addSplatClip(settings,asset,time,id,baseId){
 let clips=settings.splatTimeline?[...(settings.splatClips||[])]:settings.assetId?[{id:baseId,assetId:settings.assetId,time:0,transition:'cut',blend:0,orientation:[...(settings.orientation||[0,0,0])]}]:[];
 const sorted=[...clips].sort((a,b)=>a.time-b.time),end=Math.max(0,settings.duration-.05);
 let at=clips.length?clamp(Number(time)||0,0,end):0;
 if(clips.length&&at<.05)at=((sorted.at(-1)?.time||0)+settings.duration)/2;
 const others=clips.map(c=>Math.round(c.time*100)),wanted=Math.round(at*100);
 const choices=[wanted,...others.flatMap(t=>[t+5,t-5])].filter(t=>t>=0&&t<=Math.round(end*100)&&others.every(o=>Math.abs(t-o)>=5));
 choices.sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted));
 if(!choices.length)return settings;
 clips.push({id,assetId:asset.id,time:choices[0]/100,transition:'fade',blend:1,orientation:[...(asset.recommendedView?.orientation||[0,0,0])]});
 clips.sort((a,b)=>a.time-b.time);
 return {...settings,splatTimeline:true,splatClips:clips,subjectVisible:true};
}
