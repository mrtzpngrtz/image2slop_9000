import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SparkRenderer,SplatMesh,SplatEdit,SplatEditSdf} from '@sparkjsdev/spark';
import {audioAt,cameraAt} from './motion.js';
import {createSplatModifier} from './splat-modifier.js';
import {effectSettingsAt} from './effect-timeline.js';
import {createBackgroundGrid} from './background-grid.js';
import {createSpatialGrid} from './spatial-grid.js';
import {createSignalLayer} from './signal-layer.js';
import {createTextLayer} from './text-layer.js';
import {gradingGLSL,gradingValues,gradingState} from './color-grading.js';
import {splatsAt} from './splat-timeline.js';
import {backgroundSettingsAt} from './background-timeline.js';

const fragment=`
uniform sampler2D tDiffuse; uniform vec2 texel; uniform float time,glow,chroma,tint,energy,high; varying vec2 vUv;
uniform sampler2D tConsole;uniform float glitch,glitchTick,consoleOpacity;
uniform sampler2D tTitles,tProtectedTitles,tBackdrop;uniform bool separateText;
${gradingGLSL}
float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 finishColor(vec3 c,vec2 uv){
 c=mix(c,c*vec3(.66,1.08,.91),tint*energy*.65);
 c*=1.-smoothstep(.32,.85,length(uv-.5))*.26;
 c+=(random(uv+fract(time*.07))-.5)*.00015;
 return colorGrade(c);
}
void main(){
 vec2 uv=vUv;float row=floor(uv.y*64.);float jump=step(.91,random(vec2(row,glitchTick)))*glitch;
 uv.x=clamp(uv.x+(random(vec2(row+31.,glitchTick))-.5)*jump*.14,0.,1.);
 vec2 shift=(uv-.5)*chroma*high*.016+vec2(jump*.008,0.);
 vec3 c=vec3(texture2D(tDiffuse,uv+shift).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-shift).b);
 vec3 bloom=vec3(0.);
 for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){
  vec3 n=texture2D(tDiffuse,uv+vec2(float(x),float(y))*texel*5.).rgb;
  bloom+=max(n-.48,0.)/25.;
 }}
 c+=bloom*glow*(.3+energy*2.4);
 c=finishColor(c,uv);
 if(separateText){
  // Replace only the backdrop contribution under the lettering. Keeping the
  // processed scene intact avoids changing bloom/contrast when text is protected.
  // Chromatic and glitch offsets also move the foreground coverage.
  vec4 r=texture2D(tDiffuse,uv+shift),g=texture2D(tDiffuse,uv),b=texture2D(tDiffuse,uv-shift);
  vec3 coverage=clamp(vec3(r.a,g.a,b.a),0.,1.);
  vec3 backdrop=vec3(texture2D(tBackdrop,uv+shift).r,texture2D(tBackdrop,uv).g,texture2D(tBackdrop,uv-shift).b),light=vec3(0.);
  for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){
   vec3 n=texture2D(tBackdrop,uv+vec2(float(x),float(y))*texel*5.).rgb;
   light+=max(n-.48,0.)/25.;
  }}
  backdrop=finishColor(backdrop+light*glow*(.3+energy*2.4),uv);
  vec4 lettering=texture2D(tProtectedTitles,vUv);
  c+=(lettering.rgb-backdrop)*lettering.a*(1.-coverage);
 }
 vec4 terminal=texture2D(tConsole,vUv);c=mix(c,terminal.rgb,terminal.a*consoleOpacity);
 vec4 title=texture2D(tTitles,vUv);c=mix(c,title.rgb,title.a);
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;

export class StudioViewer {
  constructor(container,{onState,onInteract,onTextBounds}){
    this.container=container;this.onState=onState;this.onInteract=onInteract;this.disposed=false;
    this.entries=new Map();this.assets=new Map();this.projectId=null;this.state='empty';this.generation=0;
    this.onTextBounds=onTextBounds;this.titles=createTextLayer();
    this.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label','Interaktive 3D-Splat-Vorschau');
    container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#111614');
    this.grid=createBackgroundGrid();this.scene.add(this.grid.mesh);
    this.scene.add(this.titles.backgroundMesh);
    this.space=createSpatialGrid();this.scene.add(this.space.group);
    this.signals=createSignalLayer();this.scene.add(this.signals.group);
    this.camera=new THREE.PerspectiveCamera(42,16/9,.01,100);
    this.camera.position.set(0,.2,3.9);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=false;this.controls.minDistance=.3;this.controls.maxDistance=25;
    this.controls.addEventListener('start',()=>{this.manual=true;this.onInteract?.();});
    this.spark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,minSortIntervalMs:0,enableLod:false});
    this.scene.add(this.spark);
    this.pivot=new THREE.Group();this.scene.add(this.pivot);
    this.clipEdit=new SplatEdit({softEdge:.015});
    this.clipBox=new SplatEditSdf({type:'box',invert:true,opacity:0});
    this.clipEdit.addSdf(this.clipBox);this.clipEdit.visible=false;this.pivot.add(this.clipEdit);
    this.target=new THREE.WebGLRenderTarget(800,450,{type:THREE.UnsignedByteType});
    this.postScene=new THREE.Scene();this.postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.postMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:this.target.texture},texel:{value:new THREE.Vector2(1/800,1/450)},time:{value:0},glow:{value:0},chroma:{value:0},tint:{value:0},energy:{value:0},high:{value:0}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,depthTest:false,depthWrite:false});
    Object.assign(this.postMaterial.uniforms,{tConsole:{value:this.signals.texture},glitch:{value:0},glitchTick:{value:0},consoleOpacity:{value:0}});
    Object.assign(this.postMaterial.uniforms,{tTitles:{value:this.titles.texture},tProtectedTitles:{value:this.titles.protectedTexture},tBackdrop:{value:this.target.texture},separateText:{value:false},gradeMix:{value:0}});
    for(const [key,value] of Object.entries(gradingValues({})))this.postMaterial.uniforms['grade'+key[0].toUpperCase()+key.slice(1)]={value};
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.postMaterial);this.postScene.add(this.quad);
    this.makeParticles();
    this.resize(800,450);
  }
  makeParticles(){
    const positions=new Float32Array(600*3), seeds=new Float32Array(600);
    let state=34;const rand=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
    for(let i=0;i<600;i++){positions.set([(rand()-.5)*8,(rand()-.5)*5,(rand()-.5)*7],i*3);seeds[i]=rand();}
    this.particleGeometry=new THREE.BufferGeometry();this.particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.particleGeometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    this.particleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{time:{value:0},power:{value:0},energy:{value:0}},
      vertexShader:'attribute float seed;uniform float time,power,energy;varying float a;void main(){vec3 p=position;p.y=mod(p.y+time*(.05+seed*.12)+2.5,5.)-2.5;p.x+=sin(time*.3+seed*60.)*.15;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(1.+energy*3.)*min(3.,3./max(.3,-mv.z));a=power*(.2+energy*.8)*(.3+seed*.7);}',
      fragmentShader:'varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.58,.92,.73,(1.-smoothstep(.05,1.,d))*a);}'});
    this.particles=new THREE.Points(this.particleGeometry,this.particleMaterial);this.scene.add(this.particles);
  }
  setAssets(projectId,assets){
    // A project switch can arrive while Spark is sorting. Apply at the next frame.
    this.pendingAssets={projectId,assets};
  }
  status(state,info){if(this.state===state)return;this.state=state;this.ready=state==='ready';this.onState?.(state,info);}
  dropEntry(key,entry){this.pivot.remove(entry.group);if(entry.loaded&&!entry.error)entry.mesh.dispose();this.entries.delete(key);}
  async prepareSplats(settings,time){
    const clips=splatsAt(settings,time),generation=this.generation;
    this.loadedThisFrame=false;
    const active=[];
    const needed=new Set(clips.map(clip=>clip.id+':'+clip.assetId));
    for(const clip of clips){
      const asset=this.assets.get(clip.assetId);
      if(!asset)throw new Error('Ein Splat in der Timeline fehlt. Bitte den Clip ersetzen oder löschen.');
      const key=clip.id+':'+clip.assetId;
      let entry=this.entries.get(key);
      if(!entry){
        const unused=[...this.entries].filter(([id])=>!needed.has(id)).sort((a,b)=>(a[1].used||0)-(b[1].used||0));
        while(this.entries.size>=3&&unused.length){const [id,old]=unused.shift();this.dropEntry(id,old);}
        this.loadedThisFrame=true;this.status('loading');
        const effect=createSplatModifier(),group=new THREE.Group();group.visible=false;
        const mesh=new SplatMesh({url:`/api/projects/${this.projectId}/assets/${asset.id}`,worldModifier:effect.modifier});
        entry={mesh,group,effect,loaded:false};this.entries.set(key,entry);
        try{
          await mesh.initialized;entry.loaded=true;
          if(this.disposed||generation!==this.generation){mesh.dispose();return null;}
          const box=mesh.getBoundingBox(),geometry=asset.geometry;
          const center=geometry?.center?new THREE.Vector3(...geometry.center):box.getCenter(new THREE.Vector3());
          const size=geometry?.size?new THREE.Vector3(...geometry.size):box.getSize(new THREE.Vector3());
          const scale=2.3/Math.max(size.y,.01);
          mesh.scale.setScalar(scale);mesh.position.copy(center).multiplyScalar(-scale);
          group.add(mesh);this.pivot.add(group);
        }catch(error){entry.loaded=true;this.pivot.remove(group);mesh.dispose();entry.error=error;throw error;}
      }
      if(entry.error)throw entry.error;
      entry.used=performance.now();active.push({...entry,key,clip});
    }
    if(this.disposed||generation!==this.generation)return null;
    const keys=new Set(active.map(e=>e.key));
    for(const [key,entry] of this.entries)entry.group.visible=keys.has(key);
    // Keep one previous model warm for seeking without retaining an entire film in VRAM.
    const unused=[...this.entries].filter(([key])=>!keys.has(key)).sort((a,b)=>a[1].used-b[1].used);
    while(this.entries.size>3&&unused.length){const [key,entry]=unused.shift();this.dropEntry(key,entry);}
    this.status(active.length?'ready':'empty');return active;
  }
  clear(){this.generation++;for(const [key,entry] of this.entries)this.dropEntry(key,entry);this.ready=false;this.manual=false;this.status('empty');}
  resize(w,h){this.width=Math.max(2,Math.round(w));this.height=Math.max(2,Math.round(h));this.renderer.setSize(this.width,this.height,false);this.target.setSize(this.width,this.height);this.grid.resize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.postMaterial.uniforms.texel.value.set(1/this.width,1/this.height);}
  pose(){return !this.manual&&this.capturePose?structuredClone(this.capturePose):{position:this.camera.position.toArray(),target:this.controls.target.toArray(),fov:this.camera.fov};}
  reset(){this.manual=false;}
  async render(time,settings,analysis,force=false){
    if(this.disposed||this.rendering)return false;
    this.rendering=true;
    try{
      if(this.pendingAssets){
        const {projectId,assets}=this.pendingAssets;this.pendingAssets=null;
        if(this.projectId!==projectId){this.clear();this.projectId=projectId;}
        this.assets=new Map(assets.filter(a=>a.kind==='splat').map(a=>[a.id,a]));
      }
      const active=await this.prepareSplats(settings,time);if(!active)return false;
      const audio=audioAt(analysis,time,settings);
      const timeline=effectSettingsAt(settings,time),visual=timeline.settings;
      const bounds=await this.titles.update(settings,time,this.width,this.height);
      if(bounds)this.onTextBounds?.(bounds);
      let effectEnergy=0;
      for(const entry of active){
        entry.group.rotation.set(...(settings.splatTimeline?(entry.clip.orientation||[0,0,0]):[0,0,0]).map(v=>v*Math.PI/180));
        const effect=entry.effect.update(settings,time,audio,timeline,entry.clip);
        if(effect.changed)entry.mesh.updateVersion();
        effectEnergy=Math.max(effectEnergy,(effect.state.detail||0)*.35,(effect.state.waveGlow||0)*.35);
      }
      if(force||!this.manual){
        const pose=cameraAt(settings,time);this.capturePose=pose;this.camera.position.fromArray(pose.position);this.controls.target.fromArray(pose.target);
        const target=new THREE.Vector3(...pose.target);
        this.camera.position.sub(target).multiplyScalar(1-audio.bass*visual.pulse*timeline.fade*.12).add(target);
        this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.camera.lookAt(target);this.controls.update();
      }
      const backdrop=backgroundSettingsAt(settings,time);
      this.scene.background.set(backdrop.background);
      this.grid.update(backdrop,this.titles.hasProtectedText);
      const spatial=this.space.update(settings,this.height/720);
      const signal=await this.signals.update(visual,time,audio,this.camera,this.width,this.height,timeline.fade);
      const samples=spatial||signal.amount>0?4:0;
      if(this.target.samples!==samples){this.target.samples=samples;this.target.dispose();}
      this.pivot.rotation.set(...(settings.splatTimeline?[0,0,0]:settings.orientation).map(v=>v*Math.PI/180));
      this.pivot.visible=settings.subjectVisible!==false;
      this.clipEdit.visible=!!settings.crop;this.clipBox.scale.fromArray(settings.cropSize).multiplyScalar(.5);this.clipBox.position.y=settings.cropY||0;
      this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
      this.particleMaterial.uniforms.time.value=time;this.particleMaterial.uniforms.power.value=visual.particles*timeline.fade;this.particleMaterial.uniforms.energy.value=audio.high;
      this.particles.visible=visual.particles>0;
      const u=this.postMaterial.uniforms;
      const grade=gradingState(visual);u.gradeMix.value=grade.mix;
      for(const [key,value] of Object.entries(grade.values))u['grade'+key[0].toUpperCase()+key.slice(1)].value=value;
      u.glitch.value=signal.burst;u.glitchTick.value=signal.tick;u.consoleOpacity.value=signal.consoleOpacity;
      u.time.value=time;u.glow.value=visual.glow*timeline.fade;u.chroma.value=visual.chroma*timeline.fade;u.tint.value=visual.tint*timeline.fade;u.energy.value=Math.max(audio.energy,effectEnergy);u.high.value=audio.high;
      this.renderer.setRenderTarget(this.target);
      await this.spark.update({scene:this.scene,camera:this.camera});
      if(this.disposed)return false;
      this.renderer.setRenderTarget(this.target);this.renderer.render(this.scene,this.camera);
      if(this.titles.hasProtectedText)this.renderSeparateText();
      u.separateText.value=this.titles.hasProtectedText;
      this.renderer.setRenderTarget(null);this.renderer.render(this.postScene,this.postCamera);
      return true;
    }finally{this.rendering=false;}
  }
  renderSeparateText(){
    if(!this.backdropTarget)this.backdropTarget=new THREE.WebGLRenderTarget(this.width,this.height,{type:THREE.UnsignedByteType});
    this.backdropTarget.setSize(this.width,this.height);
    const visibility=this.scene.children.map(object=>[object,object.visible]);
    try{
      // Foreground coverage already lives in the scene target's alpha. Only the
      // inexpensive backdrop is redrawn; Gaussians are rendered once per frame.
      for(const [object] of visibility)if(object!==this.grid.mesh&&object!==this.titles.backgroundMesh)object.visible=false;
      this.renderer.setRenderTarget(this.backdropTarget);this.renderer.render(this.scene,this.camera);
      this.postMaterial.uniforms.tBackdrop.value=this.backdropTarget.texture;
    }finally{
      for(const [object,visible] of visibility)object.visible=visible;
    }
  }
  async png(){return new Promise((resolve,reject)=>this.renderer.domElement.toBlob(b=>b?resolve(b):reject(new Error('Frame konnte nicht gelesen werden')),'image/png'));}
  async dispose(){this.disposed=true;while(this.rendering)await new Promise(r=>setTimeout(r,10));this.clear();this.spark.dispose();this.grid.dispose();this.space.dispose();this.signals.dispose();this.titles.dispose();this.controls.dispose();this.target.dispose();this.backdropTarget?.dispose();this.postMaterial.dispose();this.quad.geometry.dispose();this.particleGeometry.dispose();this.particleMaterial.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
