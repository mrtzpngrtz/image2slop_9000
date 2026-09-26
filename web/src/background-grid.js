import * as THREE from 'three';

// A real render layer, so the grid is behind the splats in both preview and MP4.
export function createBackgroundGrid(){
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
    uniforms:{resolution:{value:new THREE.Vector2(800,450)},density:{value:16},opacity:{value:.3},style:{value:2},backdropAlpha:{value:1},paper:{value:new THREE.Color()},ink:{value:new THREE.Color()}},
    vertexShader:'varying vec2 gridUv;void main(){gridUv=position.xy*.5+.5;gl_Position=vec4(position.xy,.999999,1.);}',
    fragmentShader:`
      varying vec2 gridUv;uniform vec2 resolution;uniform float density,opacity,style,backdropAlpha;uniform vec3 paper,ink;
      void main(){
        vec2 p=(gridUv-.5)*resolution/min(resolution.x,resolution.y)*density;
        vec2 aa=max(fwidth(p),vec2(.00001));
        vec2 d=abs(fract(p+.5)-.5)/aa;
        float lines=1.-smoothstep(.25,1.05,min(d.x,d.y));
        vec2 major=abs(fract(p/4.+.5)-.5)/(aa/4.);
        float bold=1.-smoothstep(.55,1.3,min(major.x,major.y));
        float dots=1.-smoothstep(.75,2.,length(d));
        float mask=style<.5?max(lines*.6,bold):style<1.5?dots:max(max(lines*.45,bold*.7),dots);
        gl_FragColor=vec4(mix(paper,ink,mask*opacity),backdropAlpha);
      }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
  mesh.frustumCulled=false;mesh.renderOrder=-10000;mesh.visible=false;
  return {mesh,resize(w,h){material.uniforms.resolution.value.set(w,h);},update(s,captureCoverage=false){
    // Opaque draw writes backdrop RGB with zero alpha, leaving the same render
    // target's alpha free to accumulate foreground coverage without a splat rerender.
    mesh.visible=!!s.gridEnabled||captureCoverage;
    const u=material.uniforms;u.paper.value.set(s.background);u.ink.value.set(s.gridColor||'#b0b7bd');
    u.backdropAlpha.value=captureCoverage?0:1;
    u.density.value=Math.max(4,Math.min(60,s.gridDensity??16));u.opacity.value=s.gridEnabled?Math.max(0,Math.min(1,s.gridOpacity??.3)):0;
    u.style.value={lines:0,dots:1,nodes:2}[s.gridStyle]??2;
  },dispose(){mesh.geometry.dispose();material.dispose();}};
}
