import {clamp} from './motion.js';

export const signalRandom=(n)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export function signalAt(settings,time,audio={},fade=1){
 const speed=clamp(settings.glitchSpeed??.6,.05,2),tick=Math.floor(Math.max(0,time)*(3+speed*17));
 const band=clamp(audio[settings.glitchBand||'high']||0,0,1);
 const amount=settings.glitchEnabled?clamp((settings.glitchAmount??.3)+band*(settings.glitchMusic??.3),0,1)*fade:0;
 return {tick,amount,burst:amount*(signalRandom(tick+17)>.65?.9:.12),consoleOpacity:settings.consoleEnabled?(settings.consoleOpacity??.55)*fade:0};
}

export function hasSceneContent(settings,splatReady){
 if(settings.backgroundTimeline&&(settings.backgroundCues||[]).some(c=>c.time>=0&&c.time<settings.duration))return true;
 if((settings.textLayers||[]).some(l=>l.enabled!==false&&String(l.text||'').trim()))return true;
 return (splatReady&&settings.subjectVisible!==false)||!!settings.gridEnabled||['floor','room','volume'].includes(settings.spaceGrid)||!!settings.floorEnabled||!!settings.glitchEnabled||!!settings.consoleEnabled||!!(settings.effectTimeline&&(settings.effectCues||[]).some(c=>c.values?.glitchEnabled||c.values?.consoleEnabled));
}
