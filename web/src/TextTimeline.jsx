import React,{useRef} from 'react';
import {Plus,Trash2,Type} from 'lucide-react';
import {timecode} from './motion.js';
import {textWindow} from './text-timeline.js';

function TextClip({clip,duration,selected,time,onSelect,onTime,onPatch,onRemove}){
 const drag=useRef(null),moved=useRef(false),root=useRef(null);
 const {layer,index,start,end,lane}=clip,name=`Text ${index+1}`,excerpt=String(layer.text||'Text').replace(/\s+/g,' ').trim().slice(0,60)||'Text';
 function begin(e,mode){
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});
  drag.current={mode,x:e.clientX,width:root.current.parentElement.getBoundingClientRect().width,start,end,rawStart:layer.start,rawEnd:layer.end,target:e.currentTarget,pointer:e.pointerId};
  moved.current=false;e.currentTarget.setPointerCapture(e.pointerId);onSelect('text',layer.id);
 }
 function move(e){
  const d=drag.current;if(!d||e.pointerId!==d.pointer)return;
  const dx=e.clientX-d.x;if(!moved.current&&Math.abs(dx)<3)return;
  moved.current=true;onTime(layer.id,d.mode,(d.mode==='end'?d.end:d.start)+dx/Math.max(1,d.width)*duration,d);
 }
 function finish(cancel=false){
  const d=drag.current;if(!d)return;drag.current=null;
  if(cancel)onPatch(layer.id,{start:d.rawStart??0,end:d.rawEnd??null});
  if(d.target.hasPointerCapture(d.pointer))d.target.releasePointerCapture(d.pointer);
 }
 function keys(e,mode){
  if(e.ctrlKey||e.altKey||e.metaKey)return;
  if(!['ArrowLeft','ArrowRight','Home','End','Delete','Backspace','Escape'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();
  if(e.key==='Escape'){finish(true);return;}
  if(e.key==='Delete'||e.key==='Backspace'){onRemove('text',layer.id);return;}
  onSelect('text',layer.id);
  const value=e.key==='Home'?0:e.key==='End'?duration:(mode==='end'?end:start)+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:.1);
  onTime(layer.id,mode,value);
 }
 const bind=mode=>({onPointerDown:e=>begin(e,mode),onKeyDown:e=>keys(e,mode),onClick:e=>{e.stopPropagation();if(!moved.current)onSelect('text',layer.id);moved.current=false;}});
 return <div ref={root} className={`text-timeline-clip${selected?' selected':''}${time>=start&&time<end?' active':''}${layer.enabled===false?' muted':''}${end<=start?' outside':''}`}
  style={{left:`min(${start/duration*100}%, calc(100% - 20px))`,width:`max(20px, ${(Math.max(0,end-start))/duration*100}%)`,top:lane*25}}
  onPointerMove={move} onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>{drag.current=null;}}>
  <button type="button" className="text-trim start" aria-label={`${name}: Anfang verschieben`} title="Anfang ziehen" {...bind('start')}/>
  <button type="button" className="text-clip-body" aria-label={`Textclip ${index+1}: ${excerpt}`} aria-pressed={selected} title={`${excerpt} · ${timecode(start)}–${timecode(end)} · Ziehen zum Verschieben`} {...bind('move')}>
   <span>{excerpt}</span>
  </button>
  <button type="button" className="text-trim end" aria-label={`${name}: Ende verschieben`} title="Ende ziehen" {...bind('end')}/>
 </div>;
}

export function TextTrack({layout,settings,time,selection,onSelect,onTime,onPatch,onRemove,onAdd}){
 return <div className="text-track" aria-label="Textspur" title={layout.rows>3?'Weitere Texte: in der Spur scrollen':undefined}>
  <div className="text-track-content" style={{height:layout.rows*25}}>
   {layout.clips.map(clip=><TextClip key={clip.layer.id} clip={clip} duration={settings.duration} time={time} selected={selection?.kind==='text'&&selection.id===clip.layer.id} onSelect={onSelect} onTime={onTime} onPatch={onPatch} onRemove={onRemove}/>)}
   {!layout.clips.length&&<button className="text-track-empty" onClick={onAdd}><Plus size={12}/>Text</button>}
  </div>
 </div>;
}

export function TextClipEditor({layer,index,duration,onPatch,onTime,onRemove}){
 const range=textWindow(layer,duration);
 return <>
  <span className="timeline-selection" title={`Text ${index+1}`}><Type size={12}/>{String(index+1).padStart(2,'0')}</span>
  <textarea className="timeline-text-content" aria-label="Text im Timeline-Clip" rows={1} maxLength={1000} value={layer.text||''} onChange={e=>onPatch(layer.id,{text:e.target.value})}/>
  <label className="text-time-field"><span>Von</span><input type="number" aria-label="Textanfang (Sek.)" min="0" max={Math.max(0,range.end-.05)} step=".05" value={range.start} onChange={e=>{if(e.target.value!=='')onTime(layer.id,'start',Number(e.target.value));}}/><span>s</span></label>
  <label className="text-time-field"><span>Bis</span><input type="number" aria-label="Textende (Sek.)" min={Math.min(duration,range.start+.05)} max={duration} step=".05" value={range.end} onChange={e=>{if(e.target.value!=='')onTime(layer.id,'end',Number(e.target.value));}}/><span>s</span></label>
  <button className="timeline-delete" aria-label="Textclip löschen" title="Text löschen · Entf" onClick={()=>onRemove('text',layer.id)}><Trash2 size={13}/></button>
 </>;
}
