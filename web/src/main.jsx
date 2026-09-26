import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ArrowDownToLine,ArrowLeft,ArrowRight,Check,ChevronDown,ChevronRight,Clapperboard,Film,ImagePlus,Box,Music2,Plus,Play,Pause,RotateCcw,Settings2,SlidersHorizontal,Sparkles,Upload,Volume2,X,LoaderCircle,Camera,Orbit,MoveRight,Diamond,Link2,CheckCircle2,AlertCircle,Layers,Maximize2,ScanLine,Type,FolderOpen,AudioLines,Trash2,Copy,Square,RefreshCw,ExternalLink} from 'lucide-react';
import {StudioViewer} from './viewer.js';
import {defaults,audioAt,cameraAt,exportSize,timecode,clamp} from './motion.js';
import {splatPresets,selectSplatEffect} from './splat-effects.js';
import {effectKeys,effectName,effectSettingsAt,effectEditorAt,insertEffectCue,updateEffectsAt} from './effect-timeline.js';
import {Timeline} from './Timeline.jsx';
import {addSplatClip,orderedSplatClips,splatsAt} from './splat-timeline.js';
import {moveTimelinePoint,removeTimelinePoint} from './timeline-editing.js';
import {hasSceneContent} from './signal-state.js';
import {gradingDefaults,gradingPresets} from './color-grading.js';
import {newTextLayer,textPresets} from './text-layout.js';
import {TextHandles} from './TextHandles.jsx';
import {editTextTime,textWindow} from './text-timeline.js';
import {backgroundKeys,backgroundSegments,backgroundEditorAt,updateBackgroundAt,insertBackgroundCue} from './background-timeline.js';
import './swiss.css';
import './minimal.css';
import './typography.css';
import './splat-timeline.css';
import './text-timeline.css';
import './background-timeline.css';

async function api(path,method='GET',body){
  const opts={method,headers:{'X-OneSplatt':'studio'}};
  if(body instanceof FormData || body instanceof Blob)opts.body=body;
  else if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  const r=await fetch('/api'+path,opts);let data;
  try{data=await r.json();}catch{throw new Error(`Server nicht erreichbar (${r.status})`);}
  if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail||data));
  return data;
}
const assetURL=(project,a)=>`/api/projects/${project}/assets/${a}`;
function IconButton({icon:Icon,label,onClick,...rest}){return <button className="icon-button" title={label} aria-label={label} onClick={onClick} {...rest}><Icon size={17}/></button>;}
function Range({label,value,min=0,max=1,step=.01,onChange,unit='',format}){return <label className="range-control"><span>{label}<b>{format?format(value):Number(value).toFixed(step<1?2:0)}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;}
function Select({label,value,onChange,children}){return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>;}
function NumberField({label,value,onChange,min,max,step=1}){return <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onChange(clamp(n,min??-1e9,max??1e9));}}/></label>;}
function Toggle({label,checked,onChange,detail}){return <label className="toggle-row" title={detail}><span>{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>;}
function Section({title,children,action}){
 return <details className="inspector-section" open={['Fahrt','Partikel','Audio','Text'].includes(title)}><summary className="section-title"><span>{title}</span><ChevronDown size={12}/></summary><div className="section-body">{action&&<div className="section-action">{action}</div>}{children}</div></details>;
}

function SplatEffects({settings,setSettings,change,time,envelope,music}){
 return <Section title="Partikel" icon={Sparkles} action={<button className="text-button" onClick={()=>change('splatMode','off')} disabled={settings.splatMode==='off'}>Aus</button>}>

  <div className="splat-presets">{Object.entries(splatPresets).map(([id,p])=><button key={id} title={p.name} aria-label={p.name} className={settings.splatMode===id?'active':''} aria-pressed={settings.splatMode===id} onClick={()=>setSettings(s=>selectSplatEffect(s,id))}><span className={'splat-swatch '+id}/></button>)}</div>
  <div className="effect-quick"><button className={settings.splatMode==='off'&&settings.waveEnabled?'active':''} onClick={()=>setSettings(s=>selectSplatEffect(s,'wave'))}><AudioLines size={14}/> Welle</button><button className={settings.splatMode==='off'&&!settings.waveEnabled?'active':''} onClick={()=>setSettings(s=>selectSplatEffect(s,'original'))}><Box size={14}/> Original</button></div>
  {settings.splatMode!=='off'&&<>
   <Select label="Ablauf" value={settings.splatAnimation} onChange={v=>change('splatAnimation',v)}><option value="hold">Durchgehend</option><option value="cycle">Auflösen & zurück</option><option value="explode">Auseinanderfliegen</option><option value="assemble">Zusammensetzen</option></Select>

   <Range label="Verformung" value={settings.splatAmount} onChange={v=>change('splatAmount',v)}/>
   <details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary>
   <Range label="Punkt-Look" value={settings.splatDetail} onChange={v=>change('splatDetail',v)}/>
   <Range label="Punktgröße" value={settings.splatSize} onChange={v=>change('splatSize',v)}/>
   <Range label="Lichtspuren" value={settings.splatTrails} onChange={v=>change('splatTrails',v)}/>
   <Range label="Bewegungstempo" max={2} step={.05} value={settings.splatSpeed} onChange={v=>change('splatSpeed',v)}/>
   <label className="color-field"><span>Partikelfarbe</span><input type="color" aria-label="Partikelfarbe" value={settings.splatColor} onChange={e=>change('splatColor',e.target.value)}/></label>
   <Select label="Musik steuert Verformung" value={settings.splatBand} onChange={v=>change('splatBand',v)}><option value="bass">Bass</option><option value="mid">Mitten</option><option value="high">Höhen</option><option value="energy">Gesamtenergie</option></Select>
   <Range label="Musikeinfluss" value={settings.splatMusic} onChange={v=>change('splatMusic',v)}/>
   </details>

  </>}
 </Section>;
}

function EffectSequence({settings,resolved,change,time,select,add,remove,move,ready}){
 return <Section title="Effektwechsel" icon={Film}>
  <Toggle label="Effektfolge verwenden" checked={settings.effectTimeline} onChange={v=>change('effectTimeline',v)}/>

  <button className="button subtle full-width" disabled={!ready||time>=settings.duration} onClick={add}><Plus size={14}/> Wechsel bei {timecode(time)}</button>
  {settings.effectTimeline&&<>
   <div className="current-effect" title={effectName(resolved.settings)}><span>{resolved.activeId?timecode(resolved.start):'00:00.00'}</span><Diamond size={10}/></div>
   <div className="effect-cue-list">{[...(settings.effectCues||[])].sort((a,b)=>a.time-b.time).map((cue,i)=><div key={cue.id} className={resolved.activeId===cue.id?'active':''}>
    <button title={effectName(cue.values)} aria-label={`Effektwechsel ${i+1}: ${effectName(cue.values)}`} onClick={()=>select(cue.id)}><Diamond size={11}/><span>{String(i+1).padStart(2,'0')}</span></button>
    <label><input aria-label={`Effektwechsel ${i+1} bei Sekunde`} type="number" min="0" max={Math.max(0,settings.duration-.01)} step=".01" value={cue.time} onChange={e=>{if(e.target.value!=='')move(cue.id,Number(e.target.value));}}/><small>s</small></label>
    <IconButton icon={Trash2} label={`Effektwechsel ${i+1} löschen`} onClick={()=>remove(cue.id)}/>
    {cue.time>=settings.duration&&<small className="cue-outside">Außerhalb der Filmlänge</small>}
   </div>)}</div>
   <Range label="Weicher Wechsel" min={0} max={3} step={.1} unit=" s" value={settings.effectTransition} onChange={v=>change('effectTransition',v)}/>

  </>}
 </Section>;
}

function WaveEffects({settings,change}){
 return <Section title="Welle" icon={AudioLines}>
  <Toggle label="Welle aktivieren" checked={settings.waveEnabled} onChange={v=>change('waveEnabled',v)} detail="Auch mit Partikeleffekten kombinierbar"/>
  {settings.waveEnabled&&<>
   <Select label="Wellenrichtung" value={settings.waveDirection} onChange={v=>change('waveDirection',v)}>{[['up','Von unten nach oben'],['down','Von oben nach unten'],['right','Von links nach rechts'],['left','Von rechts nach links'],['depth','Durch die Tiefe'],['radial','Aus der Mitte']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</Select>
   <Range label="Wellenstärke" value={settings.waveAmount} onChange={v=>change('waveAmount',v)}/>
   <Range label="Wellenbreite" min={.08} max={1.5} step={.02} value={settings.waveWidth} onChange={v=>change('waveWidth',v)}/>
   <Range label="Dauer pro Durchlauf" min={.5} max={12} step={.1} unit=" s" value={settings.wavePeriod} onChange={v=>change('wavePeriod',v)}/>
   <Range label="Leuchtendes Wellenband" value={settings.waveGlow} onChange={v=>change('waveGlow',v)}/>
   <label className="color-field"><span>Wellenfarbe</span><input type="color" aria-label="Wellenfarbe" value={settings.waveColor} onChange={e=>change('waveColor',e.target.value)}/></label>
   <Select label="Musik steuert die Welle" value={settings.waveBand} onChange={v=>change('waveBand',v)}>{[['bass','Bass'],['mid','Mitten'],['high','Höhen'],['energy','Gesamtenergie']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</Select>
   <Range label="Musikeinfluss auf Welle" value={settings.waveMusic} onChange={v=>change('waveMusic',v)}/>

  </>}
 </Section>;
}

function BackgroundGrid({settings,change}){
 return <Section title="Raster" icon={Square}>
  <Toggle label="Grid anzeigen" checked={settings.gridEnabled} onChange={v=>change('gridEnabled',v)} detail="In der Vorschau und im Film"/>
  {settings.gridEnabled&&<>
   <Select label="Rasterstil" value={settings.gridStyle} onChange={v=>change('gridStyle',v)}><option value="lines">Linien</option><option value="nodes">Linien + Knotenpunkte</option><option value="dots">Punkte</option></Select>
   <Range label="Rasterdichte" min={4} max={50} step={1} value={settings.gridDensity} onChange={v=>change('gridDensity',v)}/>
   <Range label="Rastersichtbarkeit" value={settings.gridOpacity} onChange={v=>change('gridOpacity',v)}/>
   <label className="color-field"><span>Rasterfarbe</span><input type="color" aria-label="Rasterfarbe" value={settings.gridColor} onChange={e=>change('gridColor',e.target.value)}/></label>
  </>}
 </Section>;
}

function SpatialGrid({settings,change}){
 return <Section title="Raum">
  <Select label="3D-Raster" value={settings.spaceGrid} onChange={v=>change('spaceGrid',v)}><option value="off">Aus</option><option value="volume">Frei im Raum</option><option value="floor">Boden</option><option value="room">Wände</option></Select>
  <Toggle label="Nur Raster" checked={settings.subjectVisible===false} onChange={v=>{change('subjectVisible',!v);if(v){change('floorEnabled',false);if(settings.spaceGrid==='off')change('spaceGrid','volume');}}}/>
  {settings.spaceGrid!=='off'&&<Select label="Rasterform" value={settings.spaceStyle} onChange={v=>change('spaceStyle',v)}><option value="lines">Linien</option><option value="dots">Punkte</option></Select>}
  {(settings.spaceGrid!=='off'||settings.floorEnabled)&&<>
   <Range label="Höhe" min={-4} max={2} step={.05} value={settings.spaceY} onChange={v=>change('spaceY',v)}/>
   <details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary>
    <Toggle label="Bodenfläche" checked={settings.floorEnabled} onChange={v=>change('floorEnabled',v)}/>
    <Range label="Fläche" min={3} max={30} step={.5} value={settings.spaceSize} onChange={v=>change('spaceSize',v)}/>
    {['room','volume'].includes(settings.spaceGrid)&&<Range label="Raumhöhe" min={2} max={15} step={.25} value={settings.spaceHeight} onChange={v=>change('spaceHeight',v)}/>}
    {settings.spaceGrid!=='off'&&<>
     <Range label="Rasterabstand" min={.1} max={2} step={.05} value={settings.spaceSpacing} onChange={v=>change('spaceSpacing',v)}/>
     <Range label="Sichtbarkeit" value={settings.spaceOpacity} onChange={v=>change('spaceOpacity',v)}/>
     {settings.spaceStyle==='dots'&&<Range label="Punktgröße" min={1} max={8} step={.1} value={settings.spacePointSize} onChange={v=>change('spacePointSize',v)}/>}
     {settings.spaceGrid==='volume'&&<Range label="Freiraum" min={0} max={2} step={.05} value={settings.spaceClearance} onChange={v=>change('spaceClearance',v)}/>}
     <label className="color-field"><span>Farbe</span><input type="color" aria-label="Raumrasterfarbe" value={settings.spaceColor} onChange={e=>change('spaceColor',e.target.value)}/></label>
    </>}
    {settings.floorEnabled&&<label className="color-field"><span>Boden</span><input type="color" aria-label="Bodenfarbe" value={settings.floorColor} onChange={e=>change('floorColor',e.target.value)}/></label>}
   </details>
  </>}
  {settings.spaceGrid==='off'&&!settings.floorEnabled&&<details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary><Toggle label="Bodenfläche" checked={false} onChange={v=>change('floorEnabled',v)}/></details>}
 </Section>;
}

function SignalEffects({settings,change}){
 return <Section title="Glitch">
  <Toggle label="Glitch" checked={settings.glitchEnabled} onChange={v=>change('glitchEnabled',v)}/>
  <Toggle label="Console" checked={settings.consoleEnabled} onChange={v=>change('consoleEnabled',v)}/>
  {settings.glitchEnabled&&<>
   <Select label="Glitch-Zeichen" value={settings.glitchStyle||'mixed'} onChange={v=>change('glitchStyle',v)}><option value="mixed">Gemischt</option><option value="lines">Linien</option><option value="marks">Zeichen</option><option value="corners">Ecken</option></Select>
   <Range label="Stärke" value={settings.glitchAmount} onChange={v=>change('glitchAmount',v)}/>
  </>}
  {settings.consoleEnabled&&<Select label="Console-Stil" value={settings.consoleStyle||'editorial'} onChange={v=>change('consoleStyle',v)}><option value="editorial">Editorial</option><option value="register">Register</option><option value="minimal">Minimal</option></Select>}
  {(settings.glitchEnabled||settings.consoleEnabled)&&<details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary>
   {settings.glitchEnabled&&<>
    <Range label="Zeichendichte" value={settings.glitchDensity??.35} onChange={v=>change('glitchDensity',v)}/>
    <Range label="Tempo" min={.05} max={2} step={.05} value={settings.glitchSpeed} onChange={v=>change('glitchSpeed',v)}/>
    <Range label="Musikeinfluss" value={settings.glitchMusic} onChange={v=>change('glitchMusic',v)}/>
    <Select label="Signal" value={settings.glitchBand} onChange={v=>change('glitchBand',v)}><option value="high">Höhen</option><option value="bass">Bass</option><option value="mid">Mitten</option><option value="energy">Gesamt</option></Select>
   </>}
   {settings.consoleEnabled&&<>
    <Range label="Textdichte" value={settings.consoleDensity} onChange={v=>change('consoleDensity',v)}/>
    <Range label="Textsichtbarkeit" value={settings.consoleOpacity} onChange={v=>change('consoleOpacity',v)}/>
    <label className="field"><span>Text</span><textarea aria-label="Console-Text" rows={3} maxLength={300} value={settings.consoleText} onChange={e=>change('consoleText',e.target.value)}/></label>
   </>}
   <label className="color-field"><span>Farbe</span><input type="color" aria-label="Signalfarbe" value={settings.glitchColor} onChange={e=>change('glitchColor',e.target.value)}/></label>
  </details>}
 </Section>;
}

function ColorGrading({settings,change,apply}){
 return <Section title="Grading" action={<button className="text-button" onClick={()=>apply(gradingDefaults)}>Reset</button>}>
  <Toggle label="Grading" checked={settings.gradeEnabled} onChange={v=>change('gradeEnabled',v)}/>
  <div className="grade-presets">{Object.entries(gradingPresets).map(([id,p])=><button key={id} onClick={()=>{const {name,...values}=p;apply(values);}}>{p.name}</button>)}</div>
  {settings.gradeEnabled&&<>
   <Range label="Belichtung" min={-3} max={3} step={.05} unit=" EV" value={settings.gradeExposure} onChange={v=>change('gradeExposure',v)}/>
   <Range label="Kontrast" min={.5} max={1.8} step={.01} value={settings.gradeContrast} onChange={v=>change('gradeContrast',v)}/>
   <Range label="Sättigung" min={0} max={2} step={.01} value={settings.gradeSaturation} onChange={v=>change('gradeSaturation',v)}/>
   <details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary>
    <Range label="Temperatur" min={-1} max={1} step={.01} value={settings.gradeTemperature} onChange={v=>change('gradeTemperature',v)}/>
    <Range label="Tönung" min={-1} max={1} step={.01} value={settings.gradeTint} onChange={v=>change('gradeTint',v)}/>
    <Range label="Schatten" min={-1} max={1} step={.01} value={settings.gradeShadows} onChange={v=>change('gradeShadows',v)}/>
    <Range label="Lichter" min={-1} max={1} step={.01} value={settings.gradeHighlights} onChange={v=>change('gradeHighlights',v)}/>
   </details>
  </>}
 </Section>;
}

function TextEditor({layers,selected,select,add,patch,remove,duration,bounds}){
 const layer=layers.find(l=>l.id===selected)||layers[0];
 const edit=values=>patch(layer.id,values);
 return <Section title="Text" action={<IconButton icon={Plus} label="Text hinzufügen" onClick={add} disabled={layers.length>=12}/>}>
  {layers.length>0&&<div className="text-list">{layers.map((l,i)=><button key={l.id} title={l.text} aria-label={`Textebene ${i+1}`} className={l.id===layer?.id?'selected':''} onClick={()=>select(l.id)}>{String(i+1).padStart(2,'0')}</button>)}<IconButton icon={Trash2} label="Text löschen" onClick={()=>remove(layer.id)}/></div>}
  {layer&&<>
   <label className="field"><span className="sr-only">Textinhalt</span><textarea className="title-input" aria-label="Textinhalt" rows={3} maxLength={1000} value={layer.text} onChange={e=>edit({text:e.target.value})}/></label>
   <div className="type-presets">{Object.entries(textPresets).map(([id,p])=><button key={id} onClick={()=>{const {name,...values}=p;edit(values);}}>{p.name}</button>)}</div>
   <Select label="Textelement" value={layer.decoration||'none'} onChange={v=>edit({decoration:v})}><option value="none">Text</option><option value="rule">Linie</option><option value="corners">Ecken</option><option value="register">Register</option><option value="arrow">Pfeil</option></Select>
   <Select label="Textebene" value={layer.placement==='back'?'back':'front'} onChange={v=>edit({placement:v})}><option value="front">Vor dem Splat</option><option value="back">Hinter dem Splat</option></Select>
   {layer.placement==='back'&&<Toggle label="Effekte auf Text" checked={layer.sceneEffects!==false} onChange={v=>edit({sceneEffects:v})}/>}
   <Range label="Textgröße" min={1} max={35} step={.1} value={layer.size} onChange={v=>edit({size:v})}/>
   <div className="field-pair"><Select label="Schnitt" value={layer.weight} onChange={v=>edit({weight:+v})}><option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option><option value="700">Bold</option></Select><Select label="Ausrichtung" value={layer.align} onChange={v=>edit({align:v})}><option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option></Select></div>
   <label className="color-field"><span>Farbe</span><input type="color" aria-label="Textfarbe" value={layer.color} onChange={e=>edit({color:e.target.value})}/></label>
   <details className="effect-options"><summary>Optionen <ChevronDown size={12}/></summary>
    <Toggle label="Text anzeigen" checked={layer.enabled!==false} onChange={v=>edit({enabled:v})}/>
    <Select label="Schrift" value={layer.font||'sans'} onChange={v=>edit({font:v})}><option value="sans">Akzidenz</option><option value="mono">Mono</option></Select>
    <div className="field-pair"><NumberField label="X %" min={0} max={100} step={.1} value={Math.round(layer.x*1000)/10} onChange={v=>edit({x:v/100})}/><NumberField label="Y %" min={0} max={100} step={.1} value={Math.round(layer.y*1000)/10} onChange={v=>edit({y:v/100})}/></div>
    <Range label="Laufweite" min={-.06} max={.3} step={.01} value={layer.tracking} onChange={v=>edit({tracking:v})}/>
    <Range label="Zeilenabstand" min={.75} max={2} step={.01} value={layer.lineHeight} onChange={v=>edit({lineHeight:v})}/>
    <Range label="Deckkraft" value={layer.opacity} onChange={v=>edit({opacity:v})}/>
    <Toggle label="Ganzer Film" checked={layer.start===0&&layer.end===null} onChange={v=>edit(v?{start:0,end:null}:{start:0,end:duration})}/>
    {!(layer.start===0&&layer.end===null)&&<div className="field-pair"><NumberField label="Von (s)" min={0} max={Math.max(0,(layer.end??duration)-.05)} step={.05} value={layer.start} onChange={v=>edit({start:v})}/><NumberField label="Bis (s)" min={Math.min(duration,layer.start+.05)} max={duration} step={.05} value={layer.end??duration} onChange={v=>edit({end:v})}/></div>}
    <Range label="Ein-/Ausblenden" min={0} max={3} step={.05} unit=" s" value={layer.fade} onChange={v=>edit({fade:v})}/>
    <span className="font-note">{layer.font==='mono'?'Mono':bounds.find(b=>b.id===layer.id)?.fontLoaded===false?'Helvetica · Akzidenz nicht verfügbar':'Akzidenz-Grotesk'}</span>
   </details>
  </>}
 </Section>;
}

function WorkflowFormat({settings,change,formats}){
 const size=formats?.[settings.aspect];
 return <>
  <div className="field-pair">
   <Select label="Videoformat" value={settings.aspect} onChange={v=>change('aspect',v)}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></Select>
   <Select label="Ausschnitt" value={settings.comfyImageFit} onChange={v=>change('comfyImageFit',v)}><option value="contain">Einpassen</option><option value="cover">Zuschneiden</option></Select>
  </div>
  {size&&<span className="sr-only" aria-live="polite">ComfyUI: {size.width} × {size.height} px · 24 FPS</span>}

 </>;
}

function App(){
 const [boot,setBoot]=useState(null),[project,setProject]=useState(null),[projects,setProjects]=useState([]),[settings,setSettings]=useState(defaults);
 const [tab,setTab]=useState('camera'),[workspace,setWorkspace]=useState('studio'),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[viewerState,setViewerState]=useState('empty');
 const [previews,setPreviews]=useState([]),[timelineSelection,setTimelineSelection]=useState(null);
 const [textBounds,setTextBounds]=useState([]),[selectedText,setSelectedText]=useState(null);
 const [analysis,setAnalysis]=useState(null),[toast,setToast]=useState(''),[busy,setBusy]=useState(''),[comfy,setComfy]=useState(null),[jobs,setJobs]=useState([]),[logs,setLogs]=useState(null),[modal,setModal]=useState(null),[exporting,setExporting]=useState(null),[saved,setSaved]=useState(true),[free,setFree]=useState(false);
 const [sourceImage,setSourceImage]=useState(''),[sourceVideo,setSourceVideo]=useState(''),[prompt,setPrompt]=useState(''),[newName,setNewName]=useState('');
 const host=useRef(null),viewport=useRef(null),viewer=useRef(null),audio=useRef(null),upload=useRef(null),uploadKind=useRef('video');
 const refs=useRef({settings,analysis,time:0,playing:false,exporting:false,project:null});const exportCancel=useRef(false),exportId=useRef(null),completedJobs=useRef(new Set());
 refs.current.settings=settings;refs.current.analysis=analysis;refs.current.playing=playing;refs.current.project=project;
 const assets=project?.assets||[],clips=settings.splatTimeline?orderedSplatClips(settings):[];
 const activeClip=clips.find(c=>timelineSelection?.kind==='splat'&&c.id===timelineSelection.id)||splatsAt(settings,time).at(-1);
 const splat=assets.find(a=>a.id===(settings.splatTimeline?activeClip?.assetId:settings.assetId)),music=assets.find(a=>a.id===settings.musicId);
 const orientation=settings.splatTimeline?(activeClip?.orientation||[0,0,0]):settings.orientation;
 const activeJob=jobs.find(j=>j.projectId===project?.id&&['running','queued'].includes(j.status));
 const lastJob=[...jobs].reverse().find(j=>j.projectId===project?.id);
 const effectSelection=timelineSelection?.kind==='effect'?timelineSelection.id:undefined;
 function setVisualSettings(update){
   const editTime=refs.current.time,target=effectEditorAt(refs.current.settings,editTime,effectSelection);
   pauseTimeline();setTimelineSelection({kind:'effect',id:target.activeId});
   setSettings(s=>updateEffectsAt(s,editTime,typeof update==='function'?update(effectEditorAt(s,editTime,target.activeId).settings):update,target.activeId));
 }
 const change=(key,value)=>{
   if(effectKeys.includes(key)){setVisualSettings({[key]:value});return;}
   setSettings(s=>backgroundKeys.includes(key)?updateBackgroundAt(s,refs.current.time,{[key]:value},timelineSelection?.kind==='background'?timelineSelection.id:undefined):key==='orientation'&&s.splatTimeline?({...s,splatClips:s.splatClips.map(c=>c.id===activeClip?.id?{...c,orientation:value}:c)}):({...s,[key]:value}));
   if(['azimuth','distance','elevation','fov','orbit','cameraMode'].includes(key)){viewer.current?.reset();setFree(false);}
 }
 const resolvedEffects=effectEditorAt(settings,time,effectSelection),visualSettings=resolvedEffects.settings;
 const backgroundVisual=backgroundEditorAt(settings,time,timelineSelection?.kind==='background'?timelineSelection.id:undefined);
 const sceneReady=!!project&&viewerState!=='error'&&hasSceneContent(settings,ready);
 const textLayers=settings.textLayers||[],activeText=textLayers.some(l=>l.id===selectedText)?selectedText:textLayers[0]?.id;
 const patchText=(id,patch)=>setSettings(s=>({...s,textLayers:(s.textLayers||[]).map(l=>l.id===id?{...l,...patch}:l)}));
 function selectText(id,jump=false){
   const layer=(refs.current.settings.textLayers||[]).find(l=>l.id===id);if(!layer)return;
   pauseTimeline();setSelectedText(id);setTimelineSelection({kind:'text',id});setTab('text');
   if(jump){const range=textWindow(layer,refs.current.settings.duration);seek(range.start+Math.min(layer.fade||0,Math.max(0,(range.end-range.start)/2)));}
 }
 function addText(){
   const s=refs.current.settings;if((s.textLayers||[]).length>=12)return;
   const id=crypto.randomUUID(),start=Math.round(clamp(refs.current.time,0,Math.max(0,s.duration-.05))*100)/100;
   const layer={...newTextLayer(id,(s.textLayers||[]).length),start,end:Math.min(s.duration,start+3)};
   const next={...s,textLayers:[...(s.textLayers||[]),layer]};refs.current.settings=next;setSettings(next);selectText(id,true);
 }
 function removeText(id){setSettings(s=>({...s,textLayers:(s.textLayers||[]).filter(l=>l.id!==id)}));setSelectedText(null);setTimelineSelection(p=>p?.kind==='text'&&p.id===id?null:p);pauseTimeline();}
 function changeTextTime(id,mode,value,origin){
   const s=refs.current.settings,next=editTextTime(s,id,mode,value,origin);if(next===s)return;
   refs.current.settings=next;setSettings(next);selectText(id);
   const layer=next.textLayers.find(l=>l.id===id),range=textWindow(layer,next.duration),fade=Math.min(layer.fade||0,(range.end-range.start)/2);
   seek(mode==='end'?Math.max(range.start,range.end-Math.max(.01,fade)):range.start+fade);
 }
 useEffect(()=>setTimelineSelection(null),[project?.id]);
 function addClip(a){
   const id=crypto.randomUUID(),next=addSplatClip(refs.current.settings,a,refs.current.time,id,crypto.randomUUID());
   if(next===refs.current.settings){message('Kein Platz für einen weiteren Clip. Verlängere den Film.');return;}
   refs.current.settings=next;setSettings(next);pauseTimeline();setTimelineSelection({kind:'splat',id});
   seek(next.splatClips.find(c=>c.id===id).time);setWorkspace('studio');setTab('camera');
 }
 function patchClip(id,patch){setSettings(s=>({...s,splatClips:(s.splatClips||[]).map(c=>c.id===id?{...c,...patch}:c)}));}
 function addBackground(){
   const id=crypto.randomUUID(),next=insertBackgroundCue(refs.current.settings,refs.current.time,id,crypto.randomUUID());
   if(next===refs.current.settings){message('Kein Platz für einen weiteren Wechsel. Verlängere den Film.');return;}
   refs.current.settings=next;setSettings(next);selectPoint('background',id);
 }
 function patchBackground(id,patch){setSettings(s=>{
   const next=patch.values?updateBackgroundAt(s,refs.current.time,patch.values,id):s;
   return {...next,backgroundCues:(next.backgroundCues||[]).map(c=>c.id===id?{...c,...(patch.transition!==undefined?{transition:patch.transition}:{}),...(patch.blend!==undefined?{blend:patch.blend}:{})}:c)};
 });}
 const selectSplat=a=>{
   if(refs.current.settings.splatTimeline){
     if(timelineSelection?.kind==='splat')patchClip(timelineSelection.id,{assetId:a.id,orientation:a.recommendedView?.orientation||[0,0,0]});
     else addClip(a);
   }else setSettings(s=>({...s,...(s.assetId!==a.id?{cameraMode:'orbit',keyframes:[],orientation:[0,0,0],...(a.recommendedView||{})}:{}),assetId:a.id,subjectVisible:true}));
   setWorkspace('studio');viewer.current?.reset();setFree(false);
 };
 const message=e=>setToast(e instanceof Error?e.message:String(e));
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),7000);return()=>clearTimeout(timer);}},[toast]);
 async function chooseProject(p){
   if(refs.current.project&&JSON.stringify(refs.current.settings)!==JSON.stringify({...defaults,...refs.current.project.settings}))await api(`/projects/${refs.current.project.id}`,'PUT',{settings:refs.current.settings});
   setPlaying(false);audio.current?.pause();setProject(p);setSettings({...defaults,...p.settings});setPrompt(p.settings.videoPrompt||refs.current.promptDefault||'');
   refs.current.time=0;setTime(0);setSourceImage(p.assets.find(a=>a.kind==='image')?.id||'');setSourceVideo(p.assets.filter(a=>a.kind==='video').at(-1)?.id||'');setFree(false);
 }
 async function refreshProject(id=project?.id){const p=await api(`/projects/${id}`);if(refs.current.project?.id===id)setProject(p);setProjects(list=>list.map(x=>x.id===id?p:x));return p;}
 useEffect(()=>{api('/bootstrap').then(data=>{setBoot(data);setProjects(data.projects);setJobs(data.jobs);setPrompt(data.workflow.prompt);refs.current.promptDefault=data.workflow.prompt;completedJobs.current=new Set(data.jobs.filter(j=>j.status==='completed').map(j=>j.id));if(data.projects.length)chooseProject(data.projects[0]);}).catch(message);},[]);
 useEffect(()=>{if(!project)return;if(JSON.stringify(settings)===JSON.stringify({...defaults,...project.settings})){setSaved(true);return;}setSaved(false);const id=setTimeout(()=>api(`/projects/${project.id}`,'PUT',{settings}).then(()=>setSaved(true)).catch(message),600);return()=>clearTimeout(id);},[settings,project?.id]);
 useEffect(()=>{if(!project)return;let live=true;const poll=async()=>{try{const j=await api('/jobs');if(!live)return;setJobs(j);for(const job of j.filter(x=>x.status==='completed'&&!completedJobs.current.has(x.id))){completedJobs.current.add(job.id);const p=await refreshProject(job.projectId);if(job.projectId===refs.current.project?.id){if(job.kind==='reconstruct'){selectSplat(p.assets.find(a=>a.id===job.assetId));message('Dein Splat ist fertig.');}else{setSourceVideo(job.assetId);message('Orbit-Video ist bereit.');}}}}catch{}};const timer=setInterval(poll,1800);return()=>{live=false;clearInterval(timer);};},[project?.id]);
 useEffect(()=>{if(!host.current)return;
   const v=new StudioViewer(host.current,{onTextBounds:setTextBounds,onState:(state,info)=>{setViewerState(state);setReady(state==='ready');if(state==='loading')audio.current?.pause();if(state==='error')message(info);},onInteract:()=>{setFree(true);setPlaying(false);audio.current?.pause();}});viewer.current=v;
   let cancelled=false,raf=0,last=performance.now(),lastUI=0;
   const loop=async(now)=>{if(cancelled)return;const r=refs.current,delta=Math.max(0,(now-last)/1000);last=now;
     if(!r.exporting){if(r.playing){r.time+=delta;if(r.time>=r.settings.duration){r.time=r.settings.duration;setPlaying(false);audio.current?.pause();}if(now-lastUI>40){setTime(r.time);lastUI=now;}}
       try{await v.render(r.time,r.settings,r.analysis);if(v.loadedThisFrame){last=performance.now();if(refs.current.playing&&!refs.current.exporting&&audio.current?.src){audio.current.currentTime=refs.current.time+refs.current.settings.audioOffset;audio.current.play().catch(()=>{});}}}catch(e){v.status('error',e.message);refs.current.playing=false;setPlaying(false);audio.current?.pause();}}
     raf=requestAnimationFrame(loop);
   };raf=requestAnimationFrame(loop);
   const observer=new ResizeObserver(()=>fitViewport());observer.observe(viewport.current);
   return()=>{cancelled=true;cancelAnimationFrame(raf);observer.disconnect();v.dispose();};
 },[]);
 const fitViewport=()=>{if(!viewer.current||refs.current.exporting||!viewport.current)return;const s=refs.current.settings;const ratio=s.aspect==='9:16'?9/16:s.aspect==='1:1'?1:16/9;const {width,height}=viewport.current.getBoundingClientRect();const w=Math.max(2,Math.min(width-70,(height-70)*ratio)),h=w/ratio;host.current.style.width=w+'px';host.current.style.height=h+'px';viewer.current.resize(w,h);};
 useEffect(()=>{fitViewport();},[settings.aspect,workspace]);
 useEffect(()=>{viewer.current?.setAssets(project?.id,assets);},[project?.id,project?.assets]);
 useEffect(()=>{let alive=true;setAnalysis(null);setPlaying(false);audio.current?.pause();if(music)api(`/projects/${project.id}/assets/${music.id}/analysis`).then(a=>{if(alive)setAnalysis(a);}).catch(message);return()=>{alive=false;};},[music?.id,project?.id]);
 useEffect(()=>{if(audio.current)audio.current.volume=settings.volume;},[settings.volume]);
 function seek(t){t=clamp(t,0,settings.duration);refs.current.time=t;setTime(t);viewer.current?.reset();setFree(false);if(audio.current&&music){audio.current.currentTime=Math.min(t+settings.audioOffset,Math.max(0,(music.duration||0)-.01));}}
 function togglePlay(){if(!sceneReady)return;if(playing){setPlaying(false);audio.current?.pause();return;}if(time>=settings.duration)seek(0);viewer.current.reset();setFree(false);setPlaying(true);if(audio.current&&music){audio.current.currentTime=Math.min(refs.current.time+settings.audioOffset,Math.max(0,music.duration-.01));audio.current.play().catch(message);}}
 async function pickUpload(kind){uploadKind.current=kind;const accepts={image:'image/png,image/jpeg,image/webp',video:'video/*',music:'audio/*',splat:'.ply,.spz,.splat,.ksplat'};upload.current.accept=accepts[kind];upload.current.click();}
 async function handleFile(file){if(!file||!project)return;const kind=uploadKind.current;setBusy(kind==='music'?'Musik analysieren …':'Datei importieren …');try{const data=new FormData();data.append('file',file);const a=await api(`/projects/${project.id}/upload/${kind}`,'POST',data);await refreshProject();if(kind==='splat'){if(refs.current.settings.splatTimeline)addClip(a);else selectSplat(a);}if(kind==='music'){change('musicId',a.id);setTab('music');}if(kind==='image')setSourceImage(a.id);if(kind==='video')setSourceVideo(a.id);message('Import abgeschlossen.');}catch(e){message(e);}finally{setBusy('');upload.current.value='';}}
 async function checkComfy(){setBusy('ComfyUI prüfen …');try{const c=await api('/comfy/status?url='+encodeURIComponent(settings.comfyUrl));setComfy(c);}catch(e){message(e);}finally{setBusy('');}}
 async function startJob(kind){setBusy('Auftrag starten …');try{const j=await api(`/projects/${project.id}/jobs/${kind}`,'POST',{...settings,prompt,imageId:sourceImage,videoId:sourceVideo});setJobs(xs=>[...xs,j]);}catch(e){message(e);}finally{setBusy('');}}
 function pauseTimeline(){refs.current.playing=false;setPlaying(false);audio.current?.pause();}
 function selectPoint(kind,id){
   if(!kind){setTimelineSelection(null);return;}
   if(kind==='text'){selectText(id,true);return;}
   if(kind==='effect'&&id===null){pauseTimeline();setTimelineSelection({kind,id:null});setTab('effects');seek(0);return;}
   const s=refs.current.settings,point=(kind==='background'?backgroundSegments(s):kind==='splat'?s.splatClips:kind==='camera'?s.keyframes:s.effectCues).find(p=>p.id===id);
   if(!point)return;
   pauseTimeline();setTimelineSelection({kind,id});setTab(kind==='effect'?'effects':'camera');
   if(kind==='camera'&&s.cameraMode!=='keyframes'){const next={...s,cameraMode:'keyframes'};refs.current.settings=next;setSettings(next);}
   seek(point.time+(kind==='background'?point.blend:0));
 }
 function movePoint(kind,id,value){
   const s=refs.current.settings,moved=moveTimelinePoint(s,kind,id,value);
   if(moved===s)return;
   const next=kind==='camera'?{...moved,cameraMode:'keyframes'}:moved;
   refs.current.settings=next;setSettings(next);pauseTimeline();setTimelineSelection({kind,id});setTab(kind==='effect'?'effects':'camera');
   const point=(kind==='background'?backgroundSegments(next):kind==='splat'?next.splatClips:kind==='camera'?next.keyframes:next.effectCues).find(p=>p.id===id);
   seek(point.time+(kind==='background'?point.blend:0));
 }
 function deletePoint(kind,id){
   if(kind==='text'){removeText(id);return;}
   const s=refs.current.settings,next=removeTimelinePoint(s,kind,id);
   if(next===s)return;
   refs.current.settings=next;setSettings(next);pauseTimeline();setTimelineSelection(p=>p?.kind===kind&&p.id===id?null:p);seek(refs.current.time);
   message(kind==='background'?'Hintergrund gelöscht.':kind==='splat'?'Clip gelöscht.':kind==='camera'?'Kamerapunkt gelöscht.':'Effektwechsel gelöscht.');
 }
 async function addKeyframe(){const pose=viewer.current.pose();const key={...pose,id:crypto.randomUUID(),time:Math.round(time*100)/100};pauseTimeline();setSettings(s=>({...s,cameraMode:'keyframes',keyframes:[...s.keyframes.filter(k=>Math.abs(k.time-key.time)>.05),key].sort((a,b)=>a.time-b.time)}));setTimelineSelection({kind:'camera',id:key.id});setTab('camera');message('Kameraposition gespeichert.');}
 function addEffect(){const t=refs.current.time,id=crypto.randomUUID(),next=insertEffectCue(refs.current.settings,t,id,effectSelection);pauseTimeline();refs.current.settings=next;setSettings(next);setTimelineSelection({kind:'effect',id});seek(t);setTab('effects');message('Wechsel gesetzt. Die aktuellen Werte wurden übernommen.');}
 function moveEffect(id,value){movePoint('effect',id,value);}
 async function create(){try{const p=await api('/projects','POST',{name:newName||'Neue Motion Study'});setProjects(xs=>[p,...xs]);await chooseProject(p);setModal(null);setWorkspace('workflow');setNewName('');}catch(e){message(e);}}
 async function renderExport(){
   if(!sceneReady)return;const s=structuredClone(settings),a=analysis;const size=exportSize(s);setModal(null);setPlaying(false);audio.current?.pause();refs.current.exporting=true;exportCancel.current=false;setExporting({progress:0,label:'Export vorbereiten'});
   let id=null;const v=viewer.current;
   try{
     const result=await api(`/projects/${project.id}/exports`,'POST',{...size,fps:s.fps,duration:s.duration,musicId:s.musicId,audioOffset:s.audioOffset,volume:s.volume,crf:18,settings:s});id=result.id;exportId.current=id;
     while(v.rendering)await new Promise(r=>setTimeout(r,10));v.resize(size.width,size.height);
     for(let i=0;i<result.frames;i++){
       if(exportCancel.current)throw new Error('Export abgebrochen');
       await v.render(i/s.fps,s,a,true);const blob=await v.png();
       await api(`/exports/${id}/frames/${i}`,'POST',blob);
       setExporting({progress:(i+1)/result.frames,label:`Bild ${i+1} von ${result.frames}`});
     }
     setExporting({progress:1,label:'MP4 mit Musik fertigstellen …'});
     const asset=await api(`/exports/${id}/finish`,'POST',{});await refreshProject();setModal({type:'result',asset});message('Fertig');
   }catch(e){if(id)await api(`/exports/${id}/cancel`,'POST',{}).catch(()=>{});message(e);}
   finally{exportId.current=null;refs.current.exporting=false;setExporting(null);fitViewport();viewer.current.reset();setFree(false);}
 }
 async function cancelExport(){exportCancel.current=true;if(exportId.current)await api(`/exports/${exportId.current}/cancel`,'POST',{}).catch(()=>{});}
 const envelope=audioAt(analysis,time,settings);
 const renderingDisabled=!sceneReady||!!exporting;
 useEffect(()=>{if(!lastJob)return;api(`/jobs/${lastJob.id}/previews`).then(setPreviews).catch(()=>{});},[lastJob?.id,lastJob?.stage]);
 const presets={clean:{splatMode:'off',glow:.08,chroma:0,pulse:.08,particles:0,tint:0},pulse:{glow:.6,chroma:.4,pulse:.6,particles:.38,tint:.35},dream:{glow:.9,chroma:.18,pulse:.2,particles:.55,tint:.65}};
 return <div className="app-shell">
   <header className="topbar" inert={!!(modal||logs||exporting)}><a className="brand" href="/" aria-label="OneSplatt Studio"><b>onesplatt</b></a><div className="project-switch"><span className="project-icon" aria-hidden="true"><FolderOpen size={17}/><ChevronDown size={11}/></span><select title={project?.name||'Projekt wählen'} aria-label="Projekt" value={project?.id||''} onChange={e=>chooseProject(projects.find(p=>p.id===e.target.value)).catch(message)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="save-status" title={saved?'Gespeichert':'Speichern …'} aria-label={saved?'Gespeichert':'Speichern …'}><span className={saved?'saved-dot':'saving-dot'}/></span></div><div className="header-actions"><IconButton icon={Plus} label="Neues Projekt" onClick={()=>setModal('new')}/><button className="button primary" disabled={renderingDisabled} onClick={()=>setModal('export')}><ArrowUpRight size={17}/> Export</button></div></header>
   <div className="workspace-body" inert={!!(modal||logs||exporting)}>
    <aside className="sidebar">
     <nav className="main-nav" aria-label="Ansichten"><button aria-label="Studio" title="Studio" className={workspace==='studio'?'active':''} onClick={()=>setWorkspace('studio')}><Clapperboard size={19}/></button><button aria-label="Workflow" title="Workflow" className={workspace==='workflow'?'active':''} onClick={()=>setWorkspace('workflow')}>{activeJob?<LoaderCircle className="spin" size={19}/>:<Layers size={19}/>}</button></nav>
     <div className="asset-list">{assets.filter(a=>a.kind==='splat').map(a=><div className="asset-item" key={a.id}><button title={a.name} aria-label={`Splat: ${a.name}`} aria-pressed={splat?.id===a.id} className={'asset-card '+(splat?.id===a.id?'selected':'')} onClick={()=>selectSplat(a)}><div className="asset-thumb">{a.preview?<img src={assetURL(project.id,a.id)+'/preview'} alt=""/>:<Box size={24}/>}</div></button><button className="asset-add" aria-label={`${a.name} zur Timeline hinzufügen`} title="Zur Timeline hinzufügen" onClick={()=>addClip(a)}><Plus size={12}/></button></div>)}<button className="import-card" title="Splat importieren" aria-label="Splat importieren" onClick={()=>pickUpload('splat')}><Plus size={18}/></button></div>
     <div className="sidebar-bottom">{assets.some(a=>a.kind==='export')&&<div className="export-library">{assets.filter(a=>a.kind==='export').slice(-3).reverse().map((a,i)=><button key={a.id} title={`Film ${assets.filter(x=>x.kind==='export').length-i}`} aria-label={`Film ${assets.filter(x=>x.kind==='export').length-i}`} onClick={()=>setModal({type:'result',asset:a})}><Film size={16}/><span>{String(assets.filter(x=>x.kind==='export').length-i).padStart(2,'0')}</span></button>)}</div>}<IconButton icon={Settings2} label="Verbindung" onClick={()=>{setWorkspace('workflow');checkComfy();}}/></div>
    </aside>
    <main className="main-area">
     <div className="workspace-title"><h1 className="sr-only">{workspace==='studio'?'Studio':'Workflow'}</h1><div className="title-actions">{workspace==='studio'?<>{splat&&<a className="icon-button" title="Splat herunterladen" aria-label="Splat herunterladen" href={assetURL(project.id,splat.id)+'?download=true'} download><ArrowDownToLine size={15}/></a>}<IconButton icon={Maximize2} label="Vorschau vergrößern" onClick={()=>viewport.current?.requestFullscreen?.().catch(message)}/></>:<button className="button subtle" onClick={()=>pickUpload('video')}><Upload size={15}/> Import</button>}</div></div>
     <div className={'studio-content '+(workspace!=='studio'?'hidden':'')}>
      <div className="viewport" ref={viewport}><div className="viewport-grid"/><div className="render-surface" ref={host}>{tab==='text'&&!exporting&&<TextHandles bounds={textBounds} layers={textLayers} selected={activeText} select={selectText} move={patchText} pause={pauseTimeline}/>}</div><div className="corner c-tl"/><div className="corner c-tr"/><div className="corner c-bl"/><div className="corner c-br"/>
       {!sceneReady&&<div className="viewport-empty">{viewerState==='loading'?<LoaderCircle className="spin" size={30}/>:<Box size={38}/>}<h2>{viewerState==='loading'?'Laden …':viewerState==='error'?'Vorschau nicht verfügbar':'Splat hinzufügen'}</h2><p>{viewerState==='loading'?'Einen Moment …':'Importiere einen Splat oder starte mit einem Video.'}</p>{viewerState!=='loading'&&<button className="button primary" onClick={()=>pickUpload('splat')}><Plus size={15}/> Splat importieren</button>}</div>}
       {free&&<div className="viewport-bottom"><button title="Zur Kamerafahrt" aria-label="Zur Kamerafahrt" onClick={()=>{viewer.current.reset();setFree(false);}}><RotateCcw size={14}/></button></div>}
      </div>
      <div className="transport"><div className="transport-left"><IconButton icon={RotateCcw} label="Zum Anfang" onClick={()=>seek(0)}/><button className="play-button" aria-label={playing?'Pause':'Vorschau abspielen'} onClick={togglePlay} disabled={!sceneReady}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><span className="time-display">{timecode(time)}<i>/</i><small>{timecode(settings.duration)}</small></span></div><div className="transport-right"><button className="small-button" aria-label="Kamerapunkt setzen" title="Kamerapunkt setzen" disabled={!sceneReady} onClick={addKeyframe}><Diamond size={14}/><Plus size={10}/></button><Select label="Dauer" value={settings.duration} onChange={v=>{change('duration',Number(v));seek(Math.min(time,Number(v)));}}>{[6,12,20,30,60,120].map(n=><option key={n} value={n}>{n} Sek.</option>)}</Select></div></div>
      <Timeline onAddBackground={addBackground} onPatchBackground={patchBackground} onPatchText={patchText} onTextTime={changeTextTime} onAddText={addText} assets={assets} onPatchClip={patchClip} onAddSplat={()=>splat?addClip(splat):pickUpload('splat')} settings={settings} time={time} analysis={analysis} music={music} selection={timelineSelection} onSelect={selectPoint} onMove={movePoint} onRemove={deletePoint} onSeek={t=>{pauseTimeline();seek(t);}} onPickMusic={()=>pickUpload('music')} onEffectSeek={t=>{pauseTimeline();setTimelineSelection({kind:'effect',id:null});seek(t);setTab('effects');}}/>

     </div>
     {workspace==='workflow'&&<div className="workflow-content"><div className="workflow-steps">
      <section className="workflow-card">
       <h2>Video</h2>
       <button className="dropzone source-image" title="Ausgangsbild wählen" aria-label="Ausgangsbild wählen" onClick={()=>pickUpload('image')}>{sourceImage?<img src={assetURL(project.id,sourceImage)} alt="Ausgangsbild"/>:<ImagePlus size={25}/>}<Plus size={14}/></button>
       <WorkflowFormat settings={settings} change={change} formats={boot?.workflow.formats}/>
       <NumberField label="Dauer (s)" value={settings.videoDuration} onChange={v=>change('videoDuration',v)} min={2} max={30}/>
       <details className="workflow-options"><summary>Optionen <ChevronDown size={12}/></summary>
        <Select label="Ausgangsbild" value={sourceImage} onChange={setSourceImage}><option value="">Bild wählen</option>{assets.filter(a=>a.kind==='image').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <label className="field"><span>ComfyUI</span><div className="inline-field"><input aria-label="ComfyUI-Adresse" value={settings.comfyUrl} onChange={e=>change('comfyUrl',e.target.value)}/><button className="button subtle" onClick={checkComfy}>Prüfen</button></div></label>
        {comfy&&<div className={'connection-status '+(comfy.ready?'ok':'warning')}>{comfy.ready?'Verbunden':comfy.online?'Komponenten fehlen':'ComfyUI nicht erreichbar'}{comfy.online&&!comfy.ready&&<p>{[...comfy.missingNodes,...comfy.missingModels].join(', ')}</p>}</div>}
        <NumberField label="Seed" value={settings.seed} onChange={v=>change('seed',v)} min={0} max={9007199254740991}/>
        <Toggle label="Turbo" checked={settings.turbo} onChange={v=>change('turbo',v)}/>
        <label className="field"><span>Prompt</span><textarea value={prompt} onChange={e=>{setPrompt(e.target.value);change('videoPrompt',e.target.value);}} rows={4}/></label>
        <p className="format-note">{boot?.workflow.formats?.[settings.aspect]?.width} × {boot?.workflow.formats?.[settings.aspect]?.height} px · 24 FPS</p>
       </details>
       <button className="button primary full-width" disabled={!sourceImage||!!activeJob||!!busy} onClick={()=>startJob('generate')}><Sparkles size={15}/> Video erzeugen</button>
       <div className="video-import"><button className="button subtle full-width" onClick={()=>pickUpload('video')}><Upload size={15}/> Video importieren</button>{assets.some(a=>a.kind==='video')&&<details className="workflow-options"><summary>Video wählen <ChevronDown size={12}/></summary><Select label="Vorhandenes Video" value={sourceVideo} onChange={setSourceVideo}><option value="">Video wählen</option>{assets.filter(a=>a.kind==='video').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</Select></details>}</div>
       {sourceVideo&&<video className="source-video" src={assetURL(project.id,sourceVideo)} controls preload="metadata"/>}
      </section>
      <section className="workflow-card">
       <h2>Splat</h2>
       <Toggle label="Freistellen" checked={settings.masks} onChange={v=>change('masks',v)}/>
       <label className="field"><span>Motiv</span><input value={settings.maskPrompt} onChange={e=>change('maskPrompt',e.target.value)} placeholder="person, sword" disabled={!settings.masks}/></label>
       <details className="workflow-options"><summary>Optionen <ChevronDown size={12}/></summary>
        <div className="field-pair"><Select label="Frames" value={settings.maxFrames} onChange={v=>change('maxFrames',+v)}>{[90,180,240,360].map(n=><option key={n}>{n}</option>)}</Select><Select label="Schritte" value={settings.steps} onChange={v=>change('steps',+v)}>{[5000,15000,30000,60000].map(n=><option key={n}>{n}</option>)}</Select></div>
        {sourceImage&&<Toggle label="Original als erste Ansicht" detail="Nur bei identischem Ausschnitt zum Videostart" checked={!!settings.useReference} onChange={v=>change('useReference',v)}/>}
        <p className="format-note">Stillstehendes Motiv · vollständiger 360°-Orbit</p>
        <div className="tool-status">{boot&&Object.entries(boot.tools).map(([name,ok])=><span key={name} className={ok?'':'missing'}><span className={ok?'green-dot':'amber-dot'}/>{name==='sam3_python'?'SAM3 Runtime':name==='sam3_model'?'SAM3 Modell':name}</span>)}</div>
       </details>
       <button className="button primary full-width" disabled={!sourceVideo||!!activeJob||!!busy} onClick={()=>startJob('reconstruct')}><Layers size={15}/> Splat erzeugen</button>
       {lastJob&&<div className={'job-card '+lastJob.status}>
        <div><b>{lastJob.stage}</b>{activeJob?<LoaderCircle size={15} className="spin"/>:<CheckCircle2 size={15}/>}</div>
        <div className="progress-bar"><i style={{width:`${lastJob.progress*100}%`}}/></div>
        {lastJob.error&&<p role="alert">{lastJob.error}</p>}
        <details className="workflow-options"><summary>Details <ChevronDown size={12}/></summary>
         {lastJob.reconstruction&&<p>{lastJob.reconstruction.registered_images} / {lastJob.reconstruction.input_images} Kameras</p>}
         {previews.length>0&&<div className="job-previews">{previews.map((v,i)=><a key={v.url} href={v.url} target="_blank" rel="noreferrer" title={v.name}><img src={v.url} alt={v.name+' Vorschau '+(i+1)}/></a>)}</div>}
         <button className="text-button" onClick={async()=>{try{setLogs(await api(`/jobs/${lastJob.id}/log`));}catch(e){message(e);}}}>Protokoll</button>
        </details>
        {activeJob&&<button className="text-button" onClick={()=>api(`/jobs/${activeJob.id}/cancel`,'POST',{}).catch(message)}>Abbrechen</button>}
       </div>}
      </section>
     </div></div>}
    </main>
    {workspace==='studio'&&<aside className="inspector"><div className="inspector-tabs">{[{id:'camera',icon:Camera,name:'Kamera'},{id:'effects',icon:Sparkles,name:'Effekte'},{id:'text',icon:Type,name:'Text'},{id:'music',icon:Music2,name:'Musik'}].map(({id,icon:I,name})=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><I size={16}/>{name}</button>)}</div><div className="inspector-scroll">
     {tab==='camera'&&<><Section title="Fahrt" icon={Orbit}><div className="preset-grid">{[{id:'orbit',icon:Orbit,name:'Orbit',sub:'Um das Motiv'},{id:'push',icon:MoveRight,name:'Dolly in',sub:'Näher kommen'},{id:'keyframes',icon:Diamond,name:'Eigene Fahrt',sub:'Kamerapunkte'},{id:'still',icon:Camera,name:'Statisch',sub:'Ruhige Ansicht'}].map(({id,icon:I,name,sub})=><button key={id} title={name} aria-label={name} aria-pressed={settings.cameraMode===id} className={settings.cameraMode===id?'selected':''} onClick={()=>{change('cameraMode',id);viewer.current.reset();setFree(false);}}><I size={19}/></button>)}</div>{settings.cameraMode!=='keyframes'?<><Range label="Startwinkel" value={settings.azimuth} min={-180} max={180} step={1} unit="°" onChange={v=>{change('azimuth',v);viewer.current.reset();setFree(false);}}/>{settings.cameraMode!=='still'&&<Range label="Drehung" value={settings.orbit} min={-360} max={360} step={1} unit="°" onChange={v=>change('orbit',v)}/>}<Range label="Kamerahöhe" value={settings.elevation} min={-60} max={75} step={1} unit="°" onChange={v=>change('elevation',v)}/><Range label="Abstand" value={settings.distance} min={1} max={10} step={.1} onChange={v=>change('distance',v)}/><Range label="Bildwinkel" value={settings.fov} min={20} max={90} step={1} unit="°" onChange={v=>change('fov',v)}/></>:<><div className="keyframe-list">{[...settings.keyframes].sort((a,b)=>a.time-b.time).map((k,i)=><div key={k.id} className={timelineSelection?.kind==='camera'&&timelineSelection.id===k.id?'selected':''}><button aria-label={`Kamerapunkt ${i+1}`} title={`Kamerapunkt ${i+1}`} onClick={()=>selectPoint('camera',k.id)}><Diamond size={12}/><span>{String(i+1).padStart(2,'0')}</span></button><label className="keyframe-time"><input aria-label={`Kamerapunkt ${i+1} bei Sekunde`} type="number" min="0" max={settings.duration} step=".01" value={k.time} onChange={e=>{if(e.target.value!=='')movePoint('camera',k.id,Number(e.target.value));}}/><small>s</small></label><IconButton icon={Trash2} label={`Kamerapunkt ${i+1} löschen`} onClick={()=>deletePoint('camera',k.id)}/></div>)}</div>{settings.keyframes.length<2&&<p className="hint">Zweiter Punkt für Bewegung.</p>}<Toggle label="Weiche Übergänge" checked={settings.easing} onChange={v=>change('easing',v)}/></>}</Section><Section title="Format" icon={Maximize2}><div className="aspect-options">{['16:9','9:16','1:1'].map(a=><button key={a} className={settings.aspect===a?'selected':''} onClick={()=>change('aspect',a)}><i style={{aspectRatio:a.replace(':','/')}}/>{a}</button>)}</div><label className="color-field"><span>Hintergrund</span><div><input aria-label="Hintergrundfarbe" type="color" value={backgroundVisual.background} onChange={e=>change('background',e.target.value)}/></div></label></Section><SpatialGrid settings={settings} change={change}/><BackgroundGrid settings={backgroundVisual} change={change}/><Section title="Ausrichtung" icon={Box}><div className="axis-fields">{['X','Y','Z'].map((axis,i)=><NumberField key={axis} label={`${axis} °`} value={orientation[i]} min={-180} max={180} onChange={v=>change('orientation',orientation.map((n,j)=>j===i?v:n))}/>)}</div><Toggle label="Motiv begrenzen" checked={settings.crop} onChange={v=>change('crop',v)}/>{settings.crop&&<>{['Breite','Höhe','Tiefe'].map((name,i)=><Range key={name} label={name} min={.2} max={6} step={.05} value={settings.cropSize[i]} onChange={v=>change('cropSize',settings.cropSize.map((n,j)=>i===j?v:n))}/>)}<Range label="Vertikaler Versatz" min={-2} max={2} step={.05} value={settings.cropY} onChange={v=>change('cropY',v)}/></>}</Section></>}
     {tab==='effects'&&<><button className="effect-edit-target" aria-label={`Effektabschnitt bearbeiten ab ${timecode(resolvedEffects.start)}`} title="Die Regler bearbeiten diesen Abschnitt. Klicken, um dorthin zu springen." onClick={()=>selectPoint('effect',resolvedEffects.activeId)}><Diamond size={10}/><span>{timecode(resolvedEffects.start)}</span></button><EffectSequence settings={settings} resolved={resolvedEffects} change={change} time={time} select={id=>selectPoint('effect',id)} add={addEffect} remove={id=>deletePoint('effect',id)} move={moveEffect} ready={sceneReady}/><ColorGrading settings={visualSettings} change={change} apply={setVisualSettings}/><SignalEffects settings={visualSettings} change={change}/><SplatEffects settings={visualSettings} setSettings={setVisualSettings} change={change} time={time} envelope={envelope} music={music}/><WaveEffects settings={visualSettings} change={change}/><SpatialGrid settings={settings} change={change}/><BackgroundGrid settings={backgroundVisual} change={change}/><Section title="Look" icon={Sparkles}><div className="look-presets">{[['clean','Clean'],['pulse','Pulse'],['dream','Dream']].map(([id,name])=><button key={id} onClick={()=>setVisualSettings(s=>({...s,...presets[id]}))}><span className={'look '+id}/>{name}</button>)}</div></Section><Section title="Musikreaktion" icon={AudioLines}>{[{key:'pulse',name:'Kamera-Puls',band:'BASS',color:'lime'},{key:'glow',name:'Leuchten',band:'ENERGIE',color:'teal'},{key:'chroma',name:'RGB-Versatz',band:'HÖHEN',color:'violet'},{key:'particles',name:'Schwebende Partikel',band:'HÖHEN',color:'violet'},{key:'tint',name:'Farbwechsel',band:'ENERGIE',color:'teal'}].map(f=><div className="effect-control" key={f.key}><Range label={f.name} value={visualSettings[f.key]} onChange={v=>change(f.key,v)}/></div>)}</Section><Section title="Reaktion" icon={SlidersHorizontal}><Range label="Empfindlichkeit" min={.1} max={3} step={.05} value={settings.sensitivity} onChange={v=>change('sensitivity',v)}/>{!music&&<button className="button subtle full-width" onClick={()=>pickUpload('music')}><Music2 size={15}/> Musik hinzufügen</button>}</Section></>}
     {tab==='text'&&<TextEditor layers={textLayers} selected={activeText} select={selectText} add={addText} patch={patchText} remove={removeText} duration={settings.duration} bounds={textBounds}/>}
     {tab==='music'&&<><Section title="Audio" icon={Music2}><button className="music-drop" onClick={()=>pickUpload('music')}><div><Music2 size={25}/><Plus size={13}/></div><b>{music?'Musik wechseln':'Musik hinzufügen'}</b></button>{music&&<><div className="soundtrack-card" title={music.name}><AudioLines size={18}/><span>{timecode(music.duration)}</span><IconButton icon={X} label="Musik aus Szene entfernen" onClick={()=>{change('musicId','');audio.current?.pause();}}/></div><details className="workflow-options"><summary>Track <ChevronDown size={12}/></summary><Select label="Musik aus Mediathek" value={settings.musicId} onChange={v=>change('musicId',v)}>{assets.filter(a=>a.kind==='music').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</Select></details><Range label="Lautstärke" value={settings.volume} onChange={v=>change('volume',v)}/><NumberField label="Start im Musikstück (Sek.)" min={0} max={Math.max(0,(music.duration||0)-.1)} step={.1} value={settings.audioOffset} onChange={v=>{change('audioOffset',v);audio.current?.pause();setPlaying(false);}}/></>}</Section><Section title="Pegel" icon={AudioLines}><div className="audio-meter">{[['bass','Bass'],['mid','Mitten'],['high','Höhen'],['energy','Energie']].map(([key,label])=><div key={key}><span>{label}</span><i><b style={{width:`${envelope[key]*100}%`}}/></i></div>)}</div></Section></>}
    </div></aside>}
   </div>
   <input type="file" hidden ref={upload} onChange={e=>handleFile(e.target.files?.[0])}/><audio ref={audio} src={music&&project?assetURL(project.id,music.id):undefined} preload="auto"/>
   {busy&&<div className="busy-toast"><LoaderCircle size={15} className="spin"/>{busy}</div>}{toast&&<div className="toast" role="status"><span>{toast}</span><IconButton icon={X} label="Hinweis schließen" onClick={()=>setToast('')}/></div>}
   {(modal||logs||exporting)&&<div className="modal-backdrop"><div className={'modal '+(logs?'log-modal':'')} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{exporting?'Export':logs?'Verarbeitungsprotokoll':modal==='export'?'Export':modal==='new'?'Neues Projekt':'Fertig'}</h2></div>{!exporting&&<IconButton icon={X} label="Dialog schließen" onClick={()=>{setModal(null);setLogs(null);}}/>}</div>
    {exporting?<><p>Die Kamerafahrt und Musikreaktionen werden Bild für Bild gerendert. Lass diesen Tab geöffnet.</p><div className="export-preview"><Clapperboard size={35}/><strong>{Math.round(exporting.progress*100)}<small>%</small></strong></div><div className="progress-bar"><i style={{width:`${exporting.progress*100}%`}}/></div><div className="export-status"><span>{exporting.label}</span><button className="text-button" disabled={exporting.progress>=1} onClick={cancelExport}>Abbrechen</button></div></>:logs?<pre>{logs.text||'Noch keine Protokolleinträge.'}</pre>:modal==='new'?<><label className="field"><span>Projektname</span><input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()} placeholder="Meine nächste Szene"/></label><button className="button primary full-width" onClick={create}><Plus size={16}/> Projekt erstellen</button></>:modal==='export'?<><div className="export-summary"><Film size={18}/><span>{settings.duration} s · {settings.aspect}</span></div><div className="field-pair"><Select label="Auflösung" value={settings.resolution} onChange={v=>change('resolution',v)}><option value="720">720p · Schnell</option><option value="1080">1080p · Full HD</option><option value="2160">2160p · 4K</option></Select><Select label="Bildrate" value={settings.fps} onChange={v=>change('fps',+v)}>{[24,30,60].map(n=><option key={n} value={n}>{n} FPS</option>)}</Select></div><div className="export-detail"><span>Ausgabe</span><b>{exportSize(settings).width} × {exportSize(settings).height} px</b></div><div className="export-detail"><span>Soundtrack</span><b>{music?'Mit Musik':'Ohne Musik'}</b></div><div className="export-detail"><span>Kamerafahrt</span><b>{settings.cameraMode==='keyframes'?`${settings.keyframes.length} Kamerapunkte`:settings.cameraMode==='orbit'?`Orbit ${settings.orbit}°`:settings.cameraMode==='push'?'Dolly in':'Statisch'}</b></div>{settings.cameraMode==='keyframes'&&settings.keyframes.length<2&&<p className="hint">Weniger als zwei Kamerapunkte: Die Kamera bleibt stehen.</p>}<button className="button primary full-width export-start" onClick={renderExport}><ArrowUpRight size={18}/> MP4 rendern</button><small className="modal-note">Tab während des Exports offen lassen</small></>:<><video className="result-video" src={assetURL(project.id,modal.asset.id)} controls/><a className="button primary full-width" href={assetURL(project.id,modal.asset.id)+'?download=true'} download><ArrowDownToLine size={17}/> Herunterladen</a></>}
   </div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
