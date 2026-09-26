import * as THREE from 'three';
import {createVolumeGrid} from './volume-grid.js';

const bounded=(value,fallback,min,max)=>Number.isFinite(value)?THREE.MathUtils.clamp(value,min,max):fallback;

// These planes live in scene coordinates, independently of the subject's rotation.
// Coverage and depth are multisampled together so splats can pass in front of and
// behind the lines without transparent-object sorting or an opaque grid backdrop.
function gridMaterial(side){
  return new THREE.ShaderMaterial({side,alphaToCoverage:true,depthTest:true,depthWrite:true,
    uniforms:{planeSize:{value:new THREE.Vector2()},origin:{value:new THREE.Vector2(.5,.5)},spacing:{value:.5},strength:{value:.4},fadeEdges:{value:0},dotMode:{value:0},dotSize:{value:2.5},ink:{value:new THREE.Color()}},
    vertexShader:'varying vec2 gridUv;void main(){gridUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
      varying vec2 gridUv;uniform vec2 planeSize,origin;uniform float spacing,strength,fadeEdges,dotMode,dotSize;uniform vec3 ink;
      float lines(vec2 p){
        vec2 width=max(fwidth(p),vec2(.00001));
        vec2 distance=abs(fract(p+.5)-.5)/width;
        vec2 stroke=1.-smoothstep(vec2(.3),vec2(1.15),distance);
        // Remove subpixel lines toward the horizon instead of producing moire.
        stroke*=1.-smoothstep(vec2(.35),vec2(1.25),width);
        return max(stroke.x,stroke.y);
      }
      void main(){
        vec2 p=(gridUv-origin)*planeSize/spacing;
        float coverage=max(lines(p)*.65,lines(p/5.));
        if(dotMode>.5){vec2 aa=max(fwidth(p),vec2(.00001));vec2 d=abs(fract(p+.5)-.5)/aa;coverage=(1.-smoothstep(dotSize*.2,dotSize*.5,length(d)))*(1.-smoothstep(.35,1.25,max(aa.x,aa.y)));}
        float edge=1.-fadeEdges*smoothstep(.46,.5,max(abs(gridUv.x-.5),abs(gridUv.y-.5)));
        float alpha=coverage*strength*edge;
        if(alpha<.001)discard;
        gl_FragColor=vec4(ink,alpha);
      }`});
}

export function createSpatialGrid(){
  const group=new THREE.Group();group.name='Spatial grid';group.visible=false;
  const geometry=new THREE.PlaneGeometry(1,1);
  const horizontal=gridMaterial(THREE.DoubleSide),vertical=gridMaterial(THREE.FrontSide);
  vertical.uniforms.origin.value.set(.5,0);
  const surfaceMaterial=new THREE.MeshBasicMaterial({color:'#182125',side:THREE.DoubleSide});
  const floor=new THREE.Mesh(geometry,surfaceMaterial);floor.rotation.x=-Math.PI/2;floor.renderOrder=-30;group.add(floor);
  const floorGrid=new THREE.Mesh(geometry,horizontal);floorGrid.rotation.x=-Math.PI/2;floorGrid.renderOrder=-20;group.add(floorGrid);
  const walls=Array.from({length:4},()=>{const mesh=new THREE.Mesh(geometry,vertical);mesh.renderOrder=-20;group.add(mesh);return mesh;});
  const ceiling=new THREE.Mesh(geometry,horizontal);ceiling.rotation.x=Math.PI/2;ceiling.renderOrder=-20;group.add(ceiling);
  const volume=createVolumeGrid();group.add(volume.group);
  return {group,update(s,pixelScale=1){
    const mode=['floor','room','volume'].includes(s.spaceGrid)?s.spaceGrid:'off';
    const grid=mode!=='off',solid=!!s.floorEnabled;
    group.visible=grid||solid;
    floor.visible=solid;floorGrid.visible=mode==='floor'||mode==='room';ceiling.visible=mode==='room';walls.forEach(w=>w.visible=mode==='room');volume.group.visible=mode==='volume';
    if(!group.visible)return false;
    const size=bounded(s.spaceSize,10,3,30),height=bounded(s.spaceHeight,5,2,15),y=bounded(s.spaceY,-1.2,-4,2);
    const spacing=bounded(s.spaceSpacing,.5,.1,2),opacity=bounded(s.spaceOpacity,.45,0,1);
    for(const material of [horizontal,vertical]){
      material.uniforms.spacing.value=spacing;material.uniforms.strength.value=opacity;
      material.uniforms.ink.value.set(s.spaceColor||'#91a0a8');
      material.uniforms.dotMode.value=s.spaceStyle==='dots'?1:0;material.uniforms.dotSize.value=bounded(s.spacePointSize,2.5,1,8)*pixelScale;
    }
    horizontal.uniforms.planeSize.value.set(size,size);vertical.uniforms.planeSize.value.set(size,height);
    horizontal.uniforms.fadeEdges.value=mode==='floor'?1:0;
    surfaceMaterial.color.set(s.floorColor||'#182125');
    floor.position.set(0,y,0);floor.scale.set(size,size,1);
    floorGrid.position.set(0,y+.002,0);floorGrid.scale.set(size,size,1);
    ceiling.position.set(0,y+height,0);ceiling.scale.set(size,size,1);
    const half=size/2,mid=y+height/2;
    walls[0].position.set(0,mid,-half);walls[0].rotation.y=0;
    walls[1].position.set(half,mid,0);walls[1].rotation.y=-Math.PI/2;
    walls[2].position.set(0,mid,half);walls[2].rotation.y=Math.PI;
    walls[3].position.set(-half,mid,0);walls[3].rotation.y=Math.PI/2;
    walls.forEach(w=>w.scale.set(size,height,1));
    volume.update(s,size,height,y,spacing,opacity,s.spaceColor||'#91a0a8',pixelScale);
    return grid;
  },dispose(){geometry.dispose();horizontal.dispose();vertical.dispose();surfaceMaterial.dispose();volume.dispose();}};
}
