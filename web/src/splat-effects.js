import {clamp} from './motion.js';
import {effectSettingsAt} from './effect-timeline.js';

export const splatPresets = {
  explode:{name:'Explosion',hint:'Punkte fliegen auseinander',splatMode:'explode',splatAmount:.4,splatDetail:1,splatSize:.32,splatTrails:.25,splatSpeed:.65,splatMusic:.2,splatBand:'bass',splatAnimation:'cycle',splatColor:'#b4dcff'},
  drift:{name:'Sternenstaub',hint:'Verwehen mit Lichtspuren',splatMode:'drift',splatAmount:.28,splatDetail:1,splatSize:.28,splatTrails:.5,splatSpeed:.45,splatMusic:.18,splatBand:'energy',splatAnimation:'hold',splatColor:'#c4e8ff'},
  vortex:{name:'Wirbel',hint:'Verdrehen und zerfließen',splatMode:'vortex',splatAmount:.35,splatDetail:1,splatSize:.32,splatTrails:.45,splatSpeed:.55,splatMusic:.2,splatBand:'bass',splatAnimation:'hold',splatColor:'#96ffe5'},
  hologram:{name:'Hologramm',hint:'Flimmernde Punktstruktur',splatMode:'hologram',splatAmount:.3,splatDetail:1,splatSize:.38,splatTrails:.18,splatSpeed:.6,splatMusic:.4,splatBand:'high',splatAnimation:'hold',splatColor:'#86d9ff'},
};

// Choosing a deformation is not a preset reset. Keep the user's tuning intact.
export function selectSplatEffect(settings,mode){
  if(mode==='wave')return {...settings,splatMode:'off',waveEnabled:true};
  if(mode==='original')return {...settings,splatMode:'off',waveEnabled:false};
  if(mode==='off'||Object.hasOwn(splatPresets,mode))return {...settings,splatMode:mode};
  return settings;
}

// Stateless timing: seeking backwards and exporting any frame produce the same effect.
export function splatEffectAt(settings,time,audio={},timeline=effectSettingsAt(settings,time)){
  settings=timeline.settings;
  const modes={explode:1,drift:2,vortex:3,hologram:4};
  const mode=modes[settings.splatMode]||0;
  const progress=clamp(timeline.localTime/Math.max(.01,timeline.duration||12),0,1);
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  let envelope=1;
  if(settings.splatAnimation==='cycle')envelope=Math.sin(Math.PI*progress)**2;
  if(settings.splatAnimation==='explode')envelope=smooth((progress-.1)/.7);
  if(settings.splatAnimation==='assemble')envelope=1-smooth((progress-.1)/.7);
  if(!mode)envelope=0;
  envelope*=timeline.fade;
  const signal=clamp(audio[settings.splatBand||'bass']||0,0,1);
  return {
    mode, time:Math.max(0,time)*Math.max(0,settings.splatSpeed??.6),
    amount:clamp((settings.splatAmount??.45)+signal*(settings.splatMusic??.35),0,1)*envelope,
    detail:clamp(settings.splatDetail??.95,0,1)*envelope,
    size:clamp(settings.splatSize??.5,0,1),trails:clamp(settings.splatTrails??.4,0,1)*envelope,
    energy:signal, envelope,color:settings.splatColor||'#b4dcff',
  };
}

export function waveEffectAt(settings,time,audio={},timeline=effectSettingsAt(settings,time)){
  const s=timeline.settings,signal=clamp(audio[s.waveBand||'bass']||0,0,1);
  const period=clamp(s.wavePeriod??4,.5,20),phase=((Math.max(0,time)%period)/period);
  const directions={up:[0,1],down:[0,-1],right:[1,1],left:[1,-1],depth:[2,1],radial:[3,1]};
  const [axis,sign]=directions[s.waveDirection]||directions.up;
  const enabled=s.waveEnabled?timeline.fade:0;
  return {waveStrength:clamp((s.waveAmount??.25)+signal*(s.waveMusic??.25),0,1)*enabled,
    waveWidth:clamp(s.waveWidth??.35,.08,1.5),waveFront:(axis===3?-1.5+phase*6:-3.5+phase*7)*sign,
    waveAxis:axis,waveGlow:clamp(s.waveGlow??.7,0,1)*enabled,waveColor:s.waveColor||'#93e8ff',enabled};
}
