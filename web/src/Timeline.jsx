import React,{useRef} from 'react';
import {Camera,AudioLines,Sparkles,Box,Plus,Type,Square,Diamond,Trash2} from 'lucide-react';
import {timecode} from './motion.js';
import {effectSegments,orderedEffectCues} from './effect-timeline.js';
import {pointTimeLimit,timelineDragTime} from './timeline-editing.js';
import {splatSegments,splatTransitions} from './splat-timeline.js';
import {textTimeline} from './text-timeline.js';
import {TextTrack,TextClipEditor} from './TextTimeline.jsx';
import {backgroundSegments} from './background-timeline.js';
import {BackgroundTrack,BackgroundClipEditor} from './BackgroundTimeline.jsx';

function TimelinePoint({kind,point,index,duration,selected,onSelect,onMove,onRemove}){
 const drag=useRef(null),moved=useRef(false);
 const name=`${kind==='background'?'Hintergrundwechsel':kind==='splat'?'Splat-Wechsel':kind==='camera'?'Kamerapunkt':'Effektwechsel'} ${index+1}`;
 const select=()=>onSelect(kind,point.id);
 function start(e){
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});
  const rect=e.currentTarget.parentElement.getBoundingClientRect();
  drag.current={x:e.clientX,time:point.time,width:rect.width,pointerId:e.pointerId};
  moved.current=false;e.currentTarget.setPointerCapture(e.pointerId);select();
 }
 function move(e){
  const origin=drag.current;
  if(!origin||e.pointerId!==origin.pointerId)return;
  e.stopPropagation();const dx=e.clientX-origin.x;
  if(!moved.current&&Math.abs(dx)<3)return;
  moved.current=true;onMove(kind,point.id,timelineDragTime(origin.time,dx,origin.width,duration));
 }
 function end(e){
  if(!drag.current)return;
  drag.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 function keyDown(e){
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(['ArrowLeft','ArrowRight','Home','End','Delete','Backspace','Escape'].includes(e.key)){
   e.preventDefault();e.stopPropagation();
   if(e.key==='Delete'||e.key==='Backspace'){onRemove(kind,point.id);return;}
   if(e.key==='Escape'){
    const origin=drag.current;
    if(origin){onMove(kind,point.id,origin.time);drag.current=null;e.currentTarget.releasePointerCapture(origin.pointerId);}
    onSelect(null,null);e.currentTarget.blur();return;
   }
   select();
   const next=e.key==='Home'?0:e.key==='End'?duration:point.time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:.1);
   onMove(kind,point.id,next);
  }
 }
 return <button type="button" className={`timeline-point ${kind}-point${selected?' selected':''}`}
  aria-label={`${name} bei ${timecode(point.time)}`} aria-pressed={selected}
  title={`${name} · ${timecode(point.time)} · Ziehen zum Verschieben`}
  style={{left:`clamp(9px, ${point.time/duration*100}%, calc(100% - 9px))`}}
  onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>{const origin=drag.current;if(origin)onMove(kind,point.id,origin.time);end(e);}}
  onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={keyDown}
  onClick={e=>{e.stopPropagation();if(!moved.current)select();moved.current=false;}}>
  <Diamond size={kind==='camera'?13:11} fill="currentColor"/>
 </button>;
}

export function Timeline({settings,time,analysis,music,selection,onSelect,onMove,onRemove,onSeek,onPickMusic,onEffectSeek,assets,onPatchClip,onAddSplat,onPatchText,onTextTime,onAddText,onAddBackground,onPatchBackground}){
 const cameraPoints=[...settings.keyframes].sort((a,b)=>a.time-b.time);
 const effectPoints=settings.effectTimeline?orderedEffectCues(settings):[];
 const segments=effectSegments(settings);
 const splats=settings.splatTimeline?splatSegments(settings):[];
 const texts=textTimeline(settings),selectedText=texts.clips.find(c=>selection?.kind==='text'&&c.layer.id===selection.id);
 const backgrounds=backgroundSegments(settings),backgroundIndex=backgrounds.findIndex(c=>selection?.kind==='background'&&c.id===selection.id),selectedBackground=backgrounds[backgroundIndex];
 const selectedPoints=['text','background'].includes(selection?.kind)?[]:selection?.kind==='splat'?splats:selection?.kind==='camera'?cameraPoints:effectPoints;
 const index=selectedPoints.findIndex(p=>p.id===selection?.id),point=selectedPoints[index];
 const selectPoint=(kind,id)=>selection?.kind===kind&&selection?.id===id;
 const seekTrack=e=>onSeek((e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.clientWidth*settings.duration);
 return <>
  <div className="timeline has-effects has-splats has-text has-background" style={{'--text-track-height':`${Math.min(3,texts.rows)*25}px`}}>
   <div className="timeline-labels"><span title="Splats"><Box size={13}/><span className="sr-only">Splats</span></span><span title="Kamera"><Camera size={13}/><span className="sr-only">Kamera</span></span><span title="Musik"><AudioLines size={13}/><span className="sr-only">Musik</span></span><span title="Effekte"><Sparkles size={13}/><span className="sr-only">Effekte</span></span><span className="background-track-label"><button type="button" aria-label="Hintergrundwechsel hinzufügen" title="Hintergrundwechsel hinzufügen" onClick={onAddBackground}><Square size={12}/><Plus size={7}/></button></span><span className="text-track-label"><button type="button" aria-label="Textclip hinzufügen" title="Text hinzufügen" disabled={(settings.textLayers||[]).length>=12} onClick={onAddText}><Type size={12}/><Plus size={7}/></button></span></div>
   <div className="timeline-body">
    <div className="ruler">{Array.from({length:7},(_,i)=><span key={i}>{Math.round(settings.duration*i/6)}s</span>)}</div>
    <div className="splat-track" aria-label="Splat-Spur">
     {splats.map((clip,i)=><React.Fragment key={clip.id}>
      <button className={`splat-segment${time>=clip.start&&time<clip.end?' active':''}${selectPoint('splat',clip.id)?' selected':''}`}
       aria-label={`Splat-Clip ${i+1}: ${assets.find(a=>a.id===clip.assetId)?.name||'Fehlendes Splat'}`} aria-pressed={selectPoint('splat',clip.id)}
       title={`${assets.find(a=>a.id===clip.assetId)?.name||'Fehlendes Splat'} · ${timecode(clip.start)}–${timecode(clip.end)}`}
       style={{left:`${clip.start/settings.duration*100}%`,width:`${(clip.end-clip.start)/settings.duration*100}%`}} onClick={()=>onSelect('splat',clip.id)}>
       {!!clip.blend&&<i className="splat-blend" style={{width:`${clip.blend/(clip.end-clip.start)*100}%`}}/>}<span>{String(i+1).padStart(2,'0')}</span>
      </button>
      {i>0&&<TimelinePoint kind="splat" point={clip} index={i} duration={settings.duration} selected={selectPoint('splat',clip.id)} onSelect={onSelect} onMove={onMove} onRemove={onRemove}/>}
     </React.Fragment>)}
     {!splats.length&&<button className="splat-track-add" onClick={onAddSplat} aria-label="Splat-Sequenz hinzufügen"><Plus size={12}/><span>Splats</span></button>}
    </div>
    <div className="camera-track" aria-label="Kameraspur" onClick={seekTrack}>
     {cameraPoints.map((p,i)=>p.time>=0&&p.time<=settings.duration&&<TimelinePoint key={p.id} kind="camera" point={p} index={i} duration={settings.duration} selected={selectPoint('camera',p.id)} onSelect={onSelect} onMove={onMove} onRemove={onRemove}/>)}
    </div>
    <div className={'music-track '+(music?'has-music':'')} onClick={e=>music?seekTrack(e):onPickMusic()}>
     {analysis?<svg viewBox="0 0 960 42" preserveAspectRatio="none" aria-label="Musik-Wellenform">{Array.from({length:240},(_,i)=>{const t=settings.audioOffset+i/239*settings.duration;const index=Math.floor(t/analysis.duration*analysis.waveform.length);const amp=t<analysis.duration?(analysis.waveform[index]||0):0;return <rect key={i} x={i*4} y={21-amp*18} width="2" height={Math.max(1,amp*36)} rx="1"/>;})}</svg>:<button className="music-track-add" aria-label={music?'Musik wird analysiert':'Musik hinzufügen'} title={music?'Musik wird analysiert':'Musik hinzufügen'}><AudioLines size={13}/></button>}
    </div>
    <div className="effect-track" aria-label="Effektspur">
     {segments.map((segment,i)=><button key={segment.start} className={'effect-segment '+(time>=segment.start&&(time<segment.end||i===segments.length-1)?'active':'')+(selection?.kind==='effect'&&selection.id===segment.id?' selected':'')} aria-pressed={selection?.kind==='effect'&&selection.id===segment.id} style={{left:`${segment.start/settings.duration*100}%`,width:`${(segment.end-segment.start)/settings.duration*100}%`}} aria-label={`${segment.name} ab ${timecode(segment.start)}`} title={`${segment.name} ab ${timecode(segment.start)}`} onClick={()=>onSelect('effect',segment.id)}/>) }
     {effectPoints.map((p,i)=><TimelinePoint key={p.id} kind="effect" point={p} index={i} duration={settings.duration} selected={selectPoint('effect',p.id)} onSelect={onSelect} onMove={onMove} onRemove={onRemove}/>)}
    </div>
    <BackgroundTrack segments={backgrounds} settings={settings} time={time} selection={selection} onSelect={onSelect} onMove={onMove} onRemove={onRemove} Point={TimelinePoint}/>
    <TextTrack layout={texts} settings={settings} time={time} selection={selection} onSelect={onSelect} onTime={onTextTime} onPatch={onPatchText} onRemove={onRemove} onAdd={onAddText}/>
    <input className="timeline-scrub" aria-label="Abspielposition" type="range" min="0" max={settings.duration} step=".01" value={time} onChange={e=>onSeek(Number(e.target.value))}/>
    <div className="playhead" style={{left:`${time/settings.duration*100}%`}}><i/></div>
   </div>
  </div>
  <div className={'timeline-editbar '+(point||selectedText||selectedBackground?'has-selection':'')}>
   {selectedBackground?<BackgroundClipEditor clip={selectedBackground} index={backgroundIndex} settings={settings} onPatch={onPatchBackground} onMove={onMove} onRemove={onRemove}/>:selectedText?<TextClipEditor layer={selectedText.layer} index={selectedText.index} duration={settings.duration} onPatch={onPatchText} onTime={onTextTime} onRemove={onRemove}/>:point?<>
    <span className="timeline-selection" title={`${selection.kind==='splat'?'Splat-Clip':selection.kind==='camera'?'Kamerapunkt':'Effektwechsel'} ${index+1}`}><Diamond size={12}/>{String(index+1).padStart(2,'0')}</span>
    {selection.kind==='splat'&&<>
     <select aria-label="Splat für Clip" value={point.assetId} onChange={e=>{const a=assets.find(a=>a.id===e.target.value);onPatchClip(point.id,{assetId:a.id,orientation:a.recommendedView?.orientation||[0,0,0]});}}>{assets.filter(a=>a.kind==='splat').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
     {index>0&&<><select aria-label="Splat-Übergang" value={point.transition||'fade'} onChange={e=>onPatchClip(point.id,{transition:e.target.value})}>{Object.entries(splatTransitions).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
     {point.transition!=='cut'&&<label title="Übergangsdauer"><span>Blende</span><input aria-label="Übergangsdauer (Sek.)" type="number" min="0" max={Math.floor((point.end-point.start)*90)/100} step=".1" value={Math.round(point.blend*100)/100} onChange={e=>{if(e.target.value!=='')onPatchClip(point.id,{blend:Math.max(0,Number(e.target.value))});}}/><span>s</span></label>}</>}
    </>}
    <label title={selection.kind==='splat'&&index===0?'Erster Clip beginnt bei 0':'Startzeit'}><span>Zeit</span><input aria-label="Zeitpunkt des Timelinepunkts (Sek.)" type="number" disabled={selection.kind==='splat'&&index===0} min="0" max={pointTimeLimit(settings,selection.kind)} step=".01" value={point.time} onChange={e=>{if(e.target.value!=='')onMove(selection.kind,point.id,Number(e.target.value));}}/><span>s</span></label>
    <button className="timeline-delete" aria-label={selection.kind==='splat'?'Clip löschen':'Punkt löschen'} title="Löschen · Entf" onClick={()=>onRemove(selection.kind,point.id)}><Trash2 size={13}/></button>
   </>:null}
  </div>
 </>;
}
