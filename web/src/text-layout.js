import {textWindow} from './text-timeline.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=(v,fallback)=>Number.isFinite(v)?v:fallback;
export const textPresets={
 title:{name:'Titel',font:'sans',weight:300,size:10,tracking:-.04,lineHeight:.96,decoration:'none'},
 note:{name:'Notiz',font:'sans',weight:400,size:2,tracking:.03,lineHeight:1.2,decoration:'rule'},
 index:{name:'Index',font:'mono',weight:400,size:1.6,tracking:.03,lineHeight:1.25,decoration:'register'},
};
export function textPass(layer){return layer.placement==='back'?(layer.sceneEffects===false?'protected':'back'):'front';}
export function newTextLayer(id,index=0){return {id,text:'Text',enabled:true,font:'sans',decoration:'none',placement:'front',sceneEffects:true,weight:400,size:8,x:.08,y:Math.min(.8,.12+index*.12),align:'left',color:'#f2f1eb',opacity:1,tracking:0,lineHeight:1.08,start:0,end:null,fade:0};}
export function textOpacityAt(layer,time,duration){
 if(layer.enabled===false||!String(layer.text||'').trim())return 0;
 const {start,end}=textWindow(layer,duration);
 if(end<=start||time<start||time>end||(time===end&&end<duration))return 0;
 const fade=clamp(number(layer.fade,0),0,(end-start)/2),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
 return clamp(number(layer.opacity,1),0,1)*(fade?smooth((time-start)/fade)*smooth((end-time)/fade):1);
}
export function layoutText(layer,width,height,measure){
 const padding=Math.min(width,height)*.025;
 const decoration=['rule','corners','register','arrow'].includes(layer.decoration)?layer.decoration:'none';
 const inset={none:[0,0,0,0],rule:[0,0,0,.55],corners:[.35,.32,.35,.32],register:[.4,1.3,.4,.4],arrow:[1.6,.15,.15,.15]}[decoration];
 const lineFactor=clamp(number(layer.lineHeight,1.08),.75,2);
 const size=Math.min(clamp(number(layer.size,8),1,35)*Math.min(width,height)/100,(height-padding*2)/(lineFactor+inset[1]+inset[3]));
 const [left,top,right,bottom]=inset.map(v=>v*size);
 const tracking=clamp(number(layer.tracking,0),-.06,.3)*size,lineHeight=lineFactor*size;
 const maxWidth=Math.max(1,width-padding*2-left-right);
 const length=text=>{const chars=Array.from(text);return Math.max(0,(tracking?chars.reduce((sum,char)=>sum+measure(char,size),0):measure(text,size))+Math.max(0,chars.length-1)*tracking);};
 const lines=[];
 for(const paragraph of String(layer.text||'').slice(0,1000).split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/)){
   const candidate=line?line+' '+word:word;
   if(length(candidate)<=maxWidth){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   for(const char of word){if(line&&length(line+char)>maxWidth){lines.push(line);line='';}line+=char;}
  }
  lines.push(line);
 }
 const shown=lines.slice(0,Math.max(1,Math.min(20,Math.floor((height-padding*2-top-bottom+.001)/lineHeight))));
 const textWidth=Math.min(maxWidth,Math.max(size,...shown.map(length))),boxWidth=textWidth+left+right,boxHeight=shown.length*lineHeight+top+bottom;
 const align=['left','center','right'].includes(layer.align)?layer.align:'left',anchor=align==='center'?.5:align==='right'?1:0;
 const desiredX=clamp(number(layer.x,.08),0,1)*width;
 const x=clamp(desiredX-boxWidth*anchor,padding,Math.max(padding,width-padding-boxWidth));
 const y=clamp(number(layer.y,.12)*height,padding,Math.max(padding,height-padding-boxHeight));
 return {lines:shown,size,tracking,lineHeight,x,y,width:boxWidth,height:boxHeight,textX:x+left,textY:y+top,textWidth,decoration,align,anchor,length};
}
export function moveText(layer,dx,dy){return {...layer,x:clamp(number(layer.x,.08)+dx,0,1),y:clamp(number(layer.y,.12)+dy,0,1)};}
