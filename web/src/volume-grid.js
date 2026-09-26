import * as THREE from 'three';

// Bound imported densities as well as UI values before allocating geometry.
export function volumeLayout(size,height,requested){
 size=Number.isFinite(size)?THREE.MathUtils.clamp(size,3,30):10;
 height=Number.isFinite(height)?THREE.MathUtils.clamp(height,2,15):5;
 let spacing=Number.isFinite(requested)?THREE.MathUtils.clamp(requested,.1,2):.5;
 const count=()=>[Math.floor(size/spacing)+1,Math.floor(height/spacing)+1];
 let [nx,ny]=count();
 while(nx*nx*ny>48000){spacing*=1.05;[nx,ny]=count();}
 const xs=Array.from({length:nx},(_,i)=>(i-(nx-1)/2)*spacing);
 const ys=Array.from({length:ny},(_,i)=>i*spacing);
 return {xs,ys,spacing};
}

export function createVolumeGrid(){
 const group=new THREE.Group();group.name='Volume lattice';group.visible=false;
 const material=new THREE.ShaderMaterial({alphaToCoverage:true,depthWrite:true,
  uniforms:{ink:{value:new THREE.Color()},strength:{value:.4},dotMode:{value:0},dotSize:{value:2.5},pixelScale:{value:1},clearance:{value:.65}},
  vertexShader:`varying vec3 world;varying float distanceToCamera;uniform float dotSize,pixelScale;
   void main(){world=(modelMatrix*vec4(position,1.)).xyz;vec4 view=modelViewMatrix*vec4(position,1.);distanceToCamera=-view.z;gl_Position=projectionMatrix*view;gl_PointSize=clamp(dotSize*pixelScale*4./max(.2,-view.z),1.,24.*pixelScale);}`,
  fragmentShader:`varying vec3 world;varying float distanceToCamera;uniform vec3 ink;uniform float strength,dotMode,clearance;
   void main(){float coverage=1.;if(dotMode>.5){float d=length(gl_PointCoord-.5)*2.;coverage=1.-smoothstep(.5,1.,d);}
    float hole=smoothstep(clearance*.6,clearance+.001,length(world*vec3(1.,.45,1.)));
    float fade=smoothstep(.15,.8,distanceToCamera)*(1.-smoothstep(12.,35.,distanceToCamera));
    float alpha=coverage*strength*hole*fade;if(alpha<.001)discard;gl_FragColor=vec4(ink,alpha);}`});
 let geometry=new THREE.BufferGeometry(),object=new THREE.Points(geometry,material),key='';group.add(object);
 return {group,update(s,size,height,y,spacing,opacity,color,pixelScale){
  group.visible=s.spaceGrid==='volume';if(!group.visible)return;
  const dots=s.spaceStyle==='dots',next=[size,height,spacing,dots].join(':');
  if(next!==key){
   const {xs,ys}=volumeLayout(size,height,spacing),positions=[];
   if(dots){for(const x of xs)for(const h of ys)for(const z of xs)positions.push(x,h,z);}
   else{
    const lo=xs[0],hi=xs.at(-1),top=ys.at(-1);
    for(const x of xs)for(const z of xs)positions.push(x,0,z,x,top,z);
    for(const h of ys)for(const z of xs)positions.push(lo,h,z,hi,h,z);
    for(const h of ys)for(const x of xs)positions.push(x,h,lo,x,h,hi);
   }
   group.remove(object);geometry.dispose();geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   object=dots?new THREE.Points(geometry,material):new THREE.LineSegments(geometry,material);
   object.renderOrder=-20;group.add(object);key=next;
  }
  group.position.y=y;
  const u=material.uniforms;u.ink.value.set(color);u.strength.value=opacity;u.dotMode.value=dots?1:0;
  u.dotSize.value=s.spacePointSize??2.5;u.pixelScale.value=pixelScale;u.clearance.value=s.spaceClearance??.65;
 },dispose(){geometry.dispose();material.dispose();}};
}
