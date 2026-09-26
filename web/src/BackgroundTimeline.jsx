import React,{useEffect,useState} from 'react';
import {Square,Trash2} from 'lucide-react';
import {timecode} from './motion.js';

export function BackgroundTrack({segments,settings,time,selection,onSelect,onMove,onRemove,Point}){
 return <div className="background-track" aria-label="Hintergrundspur">
  {segments.map((clip,i)=>{
   const color=clip.values.background||'#111614',rgb=parseInt(color.slice(1),16),light=((rgb>>16)*.2126+((rgb>>8)&255)*.7152+(rgb&255)*.0722)>145;
   return <React.Fragment key={clip.id}>
    <button className={`background-segment${selection?.kind==='background'&&selection.id===clip.id?' selected':''}${time>=clip.start&&time<clip.end?' active':''}`} aria-label={`Hintergrund ${i+1} ab ${timecode(clip.start)}`} aria-pressed={selection?.kind==='background'&&selection.id===clip.id}
     title={`Hintergrund ${i+1} · ${timecode(clip.start)}–${timecode(clip.end)}`} onClick={()=>onSelect('background',clip.id)}
     style={{left:`${clip.start/settings.duration*100}%`,width:`${(clip.end-clip.start)/settings.duration*100}%`,backgroundColor:color,color:light?'#272a24':'#eef0e7'}}>
     {!!clip.blend&&<i className="background-blend" style={{width:`${clip.blend/(clip.end-clip.start)*100}%`,background:`linear-gradient(90deg, ${segments[i-1].values.background}, ${color})`}}/>}
     <span>{String(i+1).padStart(2,'0')}{clip.values.gridEnabled&&<Square size={8}/>}</span>
    </button>
    {i>0&&<Point kind="background" point={clip} index={i} duration={settings.duration} selected={selection?.kind==='background'&&selection.id===clip.id} onSelect={onSelect} onMove={onMove} onRemove={onRemove}/>}
   </React.Fragment>;
  })}
 </div>;
}

export function BackgroundClipEditor({clip,index,settings,onPatch,onMove,onRemove}){
 const color=clip.values.background||'#111614',grid=clip.values.gridEnabled?(clip.values.gridStyle||'nodes'):'off';
 const [hex,setHex]=useState(color);useEffect(()=>setHex(color),[color,clip.id]);
 const edit=values=>onPatch(clip.id,{values});
 return <>
  <span className="timeline-selection" title={`Hintergrund ${index+1}`}><Square size={12}/>{String(index+1).padStart(2,'0')}</span>
  <input className="background-color" type="color" aria-label="Farbe des Hintergrundabschnitts" value={color} onChange={e=>edit({background:e.target.value})}/>
  <input className="background-hex" type="text" aria-label="Hintergrundfarbe als Hex" value={hex} maxLength={7} spellCheck={false} onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))edit({background:e.target.value});}} onBlur={()=>setHex(color)}/>
  <select aria-label="Hintergrundraster im Abschnitt" value={grid} onChange={e=>edit({gridEnabled:e.target.value!=='off',...(e.target.value!=='off'?{gridStyle:e.target.value}:{})})}>
   <option value="off">Ohne Raster</option><option value="lines">Linien</option><option value="dots">Punkte</option><option value="nodes">Linien + Punkte</option>
  </select>
  {index>0&&<>
   <select aria-label="Hintergrundübergang" value={clip.transition||'fade'} onChange={e=>onPatch(clip.id,{transition:e.target.value})}><option value="cut">Schnitt</option><option value="fade">Überblenden</option></select>
   {clip.transition!=='cut'&&<label title="Übergangsdauer"><span>Blende</span><input aria-label="Hintergrundblende (Sek.)" type="number" min="0" max={Math.floor((clip.end-clip.start)*90)/100} step=".1" value={Math.round(clip.blend*100)/100} onChange={e=>{if(e.target.value!=='')onPatch(clip.id,{blend:Math.max(0,Number(e.target.value))});}}/><span>s</span></label>}
  </>}
  <label title={index===0?'Erster Hintergrund beginnt bei 0':'Startzeit'}><span>Zeit</span><input aria-label="Hintergrundbeginn (Sek.)" type="number" min="0" max={settings.duration-.01} step=".01" value={clip.start} disabled={index===0} onChange={e=>{if(e.target.value!=='')onMove('background',clip.id,Number(e.target.value));}}/><span>s</span></label>
  <button className="timeline-delete" aria-label="Hintergrundabschnitt löschen" title="Hintergrund löschen · Entf" disabled={!settings.backgroundTimeline} onClick={()=>onRemove('background',clip.id)}><Trash2 size={13}/></button>
 </>;
}
