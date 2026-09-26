import React,{useRef} from 'react';
import {moveText} from './text-layout.js';

export function TextHandles({bounds,layers,selected,select,move,pause}){
 const drag=useRef(null);
 function start(e,box){
  if(e.button!==0)return;
  e.stopPropagation();e.preventDefault();pause();select(box.id);
  const original=layers.find(l=>l.id===box.id),rect=e.currentTarget.parentElement.getBoundingClientRect();
  const layer={...original,x:box.x+box.width*(original.align==='center'?.5:original.align==='right'?1:0),y:box.y};
  drag.current={id:box.id,layer,original,x:e.clientX,y:e.clientY,width:rect.width,height:rect.height};e.currentTarget.setPointerCapture(e.pointerId);
 }
 return <div className="text-handles">{bounds.filter(b=>b.visible&&layers.some(l=>l.id===b.id)).map((box,i)=><button key={box.id} className={box.id===selected?'selected':''} aria-label={`Text ${i+1} verschieben`} title="Text verschieben" style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}}
  onPointerDown={e=>start(e,box)} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==box.id)return;const moved=moveText(d.layer,(e.clientX-d.x)/d.width,(e.clientY-d.y)/d.height);move(box.id,{x:moved.x,y:moved.y});}}
  onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={()=>{const d=drag.current;if(d)move(d.id,{x:d.original.x,y:d.original.y});drag.current=null;}}
  onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();pause();select(box.id);const layer=layers.find(l=>l.id===box.id),step=e.shiftKey?.02:.002;const moved=moveText(layer,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);move(box.id,{x:moved.x,y:moved.y});}}
 />)}</div>;
}
