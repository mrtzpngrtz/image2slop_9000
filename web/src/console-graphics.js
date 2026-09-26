import {signalRandom as random} from './signal-state.js';
import {graphicFont,line,node,cross,corners,arrow,label} from './graphic-primitives.js';

// Coordinates use a 720-unit short side; scale to the actual output for sharp export.
export function drawConsole(ctx,s,time,audio,state,w,h){
 const m=36,portrait=w<h,panel=Math.min(260,w*.3),right=w-m-panel;
 const density=Math.max(0,Math.min(1,s.consoleDensity??.4)),tick=Math.floor(time*4);
 const labels=String(s.consoleText??'FIELD / SCAN\nPOINT STREAM\nSYNC').split('\n').filter(Boolean).slice(0,3).map(t=>t.slice(0,48));
 const text=(i)=>labels[i]||'',clock=time.toFixed(2).padStart(7,'0');
 const style=s.consoleStyle||'editorial';
 ctx.save();ctx.fillStyle=s.glitchColor||'#b9d6d0';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.65;ctx.textBaseline='top';
 ctx.translate(state.burst*5*(random(state.tick)-.5),0);
 const metadata=(x,y,count,width=panel)=>{
  ctx.save();ctx.globalAlpha=.58;
  for(let i=0;i<count;i++){
   const code=Math.floor(random(i+tick*.17)*0xffffff).toString(16).toUpperCase().padStart(6,'0');
   label(ctx,String(i+1).padStart(2,'0'),x,y+i*18,8);
   label(ctx,code,x+width,y+i*18,9,'right');
  }ctx.restore();
 };
 const levels=(x,y,width)=>{
  ['bass','mid','high'].forEach((band,i)=>{
   const xx=x+i*width/3,v=Math.max(0,Math.min(1,audio[band]||0));
   ctx.globalAlpha=.2;line(ctx,xx,y,xx,y-48);ctx.globalAlpha=.85;line(ctx,xx,y,xx,y-4-v*44);
   node(ctx,xx,y-4-v*44,2);label(ctx,band.slice(0,1).toUpperCase(),xx,y+9,8,'center');
  });ctx.globalAlpha=1;
 };
 const rail=(x,y,width)=>{
  ctx.save();ctx.globalAlpha=.45;line(ctx,x,y,x+width,y);
  const count=Math.round(8+density*22);
  for(let i=0;i<=count;i++){const xx=x+i/count*width;line(ctx,xx,y-2,xx,y+(i%5===0?5:2));}
  ctx.globalAlpha=.9;node(ctx,x+(time*.045%1)*width,y,3);ctx.restore();
 };
 if(style==='register'){
  const pw=Math.min(310,w*.39),x=m,y=m+17,split=x+pw*.38,ys=[y,y+26,y+82,y+111,y+159];
  ctx.globalAlpha=.36;ys.forEach(yy=>line(ctx,x,yy,x+pw,yy));[x,split,x+pw].forEach(xx=>line(ctx,xx,y,xx,ys.at(-1)));
  ctx.globalAlpha=.75;ys.forEach(yy=>[x,split,x+pw].forEach(xx=>node(ctx,xx,yy,2.5)));
  label(ctx,'(01)',x+8,y+8,9);label(ctx,text(0),split+8,y+8,10,'left',true,pw*.62-16);
  label(ctx,text(1),x+pw-8,y+39,17,'right',false,pw*.62-16);
  label(ctx,'T / '+clock,split+8,y+91,9,'left',true,pw*.62-16);
  label(ctx,text(2),x+8,y+126,10,'left',true,pw*.38-16);
  cross(ctx,w-m,m,6);label(ctx,'(02)',w-m,m+20,8,'right');
  if(density>.15)metadata(w-m-Math.min(95,panel),m+52,Math.round(1+density*4),Math.min(95,panel));
  const rw=Math.min(460,w*.52);rail(m,h-m-28,rw);label(ctx,clock,m,h-m-10,10);
  label(ctx,'/ '+text(1),m+rw,h-m-10,9,'right',false,rw*.6);
  levels(w-m-64,h-m-24,84);corners(ctx,m-9,h-m-48,rw+18,68,5);
 }else if(style==='minimal'){
  ctx.globalAlpha=.5;corners(ctx,m,m,w-2*m,h-2*m,10);
  ctx.globalAlpha=1;label(ctx,text(0),m+18,m+1,14,'left',false,w*.42);
  ctx.globalAlpha=.58;label(ctx,text(1),m+18,m+25,9,'left',true,w*.42);
  ctx.globalAlpha=.85;ctx.lineWidth=1;arrow(ctx,w-m-20,m+22,35);ctx.lineWidth=.65;
  cross(ctx,m+7,h-m-47,6);label(ctx,clock,m+24,h-m-50,10);
  label(ctx,text(2),w-m-18,h-m-15,9,'right',false,w*.4);
  if(density>.25){rail(m+24,h-m-25,Math.min(170,w*.23));label(ctx,'(01)',w-m-18,h-m-47,8,'right');}
  if(density>.65)metadata(w-m-110,h*.48,2,92);
 }else{
  label(ctx,'(01) / '+text(2),m,m,9,'left',true,panel);
  ctx.font=`300 ${portrait?30:38}px ${graphicFont}`;ctx.fillText(text(0),m,m+28,Math.min(320,w*.4));
  ctx.globalAlpha=.72;label(ctx,text(1),m,m+78,11,'left',false,panel);
  ctx.globalAlpha=.42;line(ctx,right,m,w-m,m);node(ctx,right,m);node(ctx,w-m,m);
  ctx.globalAlpha=.9;label(ctx,'(02)',right,m+12,9);label(ctx,clock,w-m,m+12,10,'right');
  if(density>.1)metadata(right,m+47,Math.round(1+density*5));
  ctx.globalAlpha=.72;ctx.lineWidth=1;arrow(ctx,m+12,h-m-111,42);ctx.lineWidth=.65;
  label(ctx,text(2),m,h-m-38,10,'left',false,panel);rail(m,h-m-14,Math.min(240,w*.31));
  levels(w-m-79,h-m-27,96);cross(ctx,w-m,m+h*.42,5);
  if(density>.55){ctx.globalAlpha=.45;label(ctx,'(03) / '+text(1),m,h*.48,8,'left',true,panel);cross(ctx,m,h*.48-16,4);}
 }
 ctx.restore();
}
