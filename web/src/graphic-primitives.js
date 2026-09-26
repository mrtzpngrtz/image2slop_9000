// Shared, resolution-independent drawing vocabulary for film overlays.
export const graphicFont='"OneSplatt Akzidenz", Helvetica, Arial, sans-serif';
export function line(ctx,x,y,x2,y2){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
export function node(ctx,x,y,size=2.5){ctx.fillRect(x-size/2,y-size/2,size,size);}
export function cross(ctx,x,y,size=5){line(ctx,x-size,y,x+size,y);line(ctx,x,y-size,x,y+size);}
export function corners(ctx,x,y,w,h,size=7){
 for(const [px,py,dx,dy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
  ctx.beginPath();ctx.moveTo(px+dx*size,py);ctx.lineTo(px,py);ctx.lineTo(px,py+dy*size);ctx.stroke();
 }
}
export function arrow(ctx,x,y,size=28,direction='down'){
 ctx.save();ctx.translate(x,y);if(direction==='right')ctx.rotate(-Math.PI/2);
 line(ctx,0,0,0,size);ctx.beginPath();ctx.moveTo(-size*.3,size*.68);ctx.lineTo(0,size);ctx.lineTo(size*.3,size*.68);ctx.stroke();ctx.restore();
}
export function label(ctx,value,x,y,size=10,align='left',mono=true,maxWidth){
 ctx.font=`400 ${size}px ${mono?'Consolas, monospace':graphicFont}`;ctx.textAlign=align;
 if(maxWidth!==undefined)ctx.fillText(value,x,y,maxWidth);else ctx.fillText(value,x,y);
 ctx.textAlign='left';
}
