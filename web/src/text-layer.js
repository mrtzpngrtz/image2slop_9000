import * as THREE from 'three';
import {layoutText,textOpacityAt,textPass} from './text-layout.js';
import {graphicFont,line,node,corners,arrow,label} from './graphic-primitives.js';

const fontRequests=new Map();
export function loadTextFont(weight=400){
 weight=[300,400,500,700].includes(Number(weight))?Number(weight):400;
 if(!fontRequests.has(weight))fontRequests.set(weight,document.fonts.load(`${weight} 24px "OneSplatt Akzidenz"`).then(faces=>faces.some(f=>f.status==='loaded')).catch(()=>false));
 return fontRequests.get(weight);
}
export function createTextLayer(){
 const surfaces=Object.fromEntries(['front','back','protected'].map(side=>{
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return [side,{canvas,ctx:canvas.getContext('2d'),texture}];
 }));
 // Draw before the transparent Gaussian pass. Its actual alpha coverage reveals
 // the lettering naturally between splats, including during particle effects.
 const backMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,
  // Rear lettering changes the backdrop color, never foreground coverage.
  blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
  uniforms:{titles:{value:surfaces.back.texture}},
  vertexShader:'varying vec2 titleUv;void main(){titleUv=uv;gl_Position=vec4(position.xy,.999999,1.);}',
  fragmentShader:'varying vec2 titleUv;uniform sampler2D titles;void main(){gl_FragColor=texture2D(titles,titleUv);if(gl_FragColor.a<.001)discard;}'
 });
 const backgroundMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),backMaterial);
 backgroundMesh.frustumCulled=false;backgroundMesh.renderOrder=-9000;backgroundMesh.visible=false;
 let cache='',boundsKey='',hasProtectedText=false;
 return {texture:surfaces.front.texture,protectedTexture:surfaces.protected.texture,backgroundMesh,get hasProtectedText(){return hasProtectedText;},async update(settings,time,width,height){
  const layers=(settings.textLayers||[]).slice(0,12),fonts=await Promise.all(layers.map(l=>l.font==='mono'?true:loadTextFont(l.weight)));
  const states=layers.map(l=>textOpacityAt(l,time,settings.duration));
  const key=JSON.stringify([layers,states,width,height,fonts]);
  if(key===cache)return null;
  for(const [pass,{canvas,ctx,texture}] of Object.entries(surfaces)){
   const used=layers.some((layer,i)=>textPass(layer)===pass&&states[i]>0),w=used?width:2,h=used?height:2;
   if(canvas.width!==w||canvas.height!==h){texture.dispose();canvas.width=w;canvas.height=h;}
   ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  backgroundMesh.visible=layers.some((layer,i)=>textPass(layer)==='back'&&states[i]>0);
  hasProtectedText=layers.some((layer,i)=>textPass(layer)==='protected'&&states[i]>0);
  const bounds=[];
  layers.forEach((layer,i)=>{
   if(layer.enabled===false||!String(layer.text||'').trim())return;
   const {ctx}=surfaces[textPass(layer)];
   const weight=[300,400,500,700].includes(Number(layer.weight))?Number(layer.weight):400;
   const fontFamily=layer.font==='mono'?'Consolas, monospace':graphicFont;
   const measure=(text,size)=>{ctx.font=`${weight} ${size}px ${fontFamily}`;return ctx.measureText(text).width;};
   const layout=layoutText(layer,width,height,measure);
   bounds.push({id:layer.id,x:layout.x/width,y:layout.y/height,width:layout.width/width,height:layout.height/height,visible:states[i]>0,fontLoaded:fonts[i]});
   if(states[i]<=0)return;
   ctx.save();ctx.font=`${weight} ${layout.size}px ${fontFamily}`;ctx.textBaseline='top';ctx.fillStyle=/^#[0-9a-f]{6}$/i.test(layer.color)?layer.color:'#f2f1eb';ctx.globalAlpha=states[i];
   const {x,y,width:w,height:h,size,decoration}=layout;
   ctx.save();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.min(width,height)/720*.65;ctx.globalAlpha*=.6;
   if(decoration==='rule'){
    const yy=y+h-size*.15;line(ctx,x,yy,x+w,yy);node(ctx,x,yy,Math.min(width,height)/720*2.5);
   }else if(decoration==='corners')corners(ctx,x,y,w,h,size*.24);
   else if(decoration==='register'){
    const yy=layout.textY-size*.3;ctx.strokeRect(x,y,w,h);line(ctx,x,yy,x+w,yy);line(ctx,x+w*.36,y,x+w*.36,yy);
    for(const xx of [x,x+w])for(const y2 of [y,yy,y+h])node(ctx,xx,y2,Math.min(width,height)/720*2.5);
    label(ctx,`(${String(i+1).padStart(2,'0')})`,layout.textX,y+size*.25,size*.55);
   }else if(decoration==='arrow'){
    ctx.lineWidth=Math.min(width,height)/720;arrow(ctx,x+size*.12,layout.textY+size*.5,size,'right');
   }
   ctx.restore();
   layout.lines.forEach((text,row)=>{
    const x=layout.textX+(layout.textWidth-layout.length(text))*layout.anchor,y=layout.textY+row*layout.lineHeight;
    if(!layout.tracking){ctx.fillText(text,x,y);return;}
    let offset=0;for(const char of text){ctx.fillText(char,x+offset,y);offset+=ctx.measureText(char).width+layout.tracking;}
   });ctx.restore();
  });
  cache=key;Object.values(surfaces).forEach(({texture})=>{texture.needsUpdate=true;});
  const next=JSON.stringify(bounds);if(next===boundsKey)return null;boundsKey=next;
  return bounds;
 },dispose(){Object.values(surfaces).forEach(({texture})=>texture.dispose());backgroundMesh.geometry.dispose();backMaterial.dispose();}};
}
