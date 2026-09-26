export const gradingDefaults={gradeEnabled:false,gradeExposure:0,gradeContrast:1,gradeSaturation:1,gradeTemperature:0,gradeTint:0,gradeShadows:0,gradeHighlights:0};
export const gradingPresets={
 neutral:{name:'Neutral',...gradingDefaults,gradeEnabled:true},
 warm:{name:'Warm',...gradingDefaults,gradeEnabled:true,gradeExposure:.1,gradeContrast:1.1,gradeSaturation:.92,gradeTemperature:.4,gradeHighlights:-.15,gradeShadows:.1},
 cool:{name:'Kühl',...gradingDefaults,gradeEnabled:true,gradeContrast:1.12,gradeSaturation:.78,gradeTemperature:-.35,gradeTint:.06,gradeShadows:-.1},
 mono:{name:'Mono',...gradingDefaults,gradeEnabled:true,gradeContrast:1.22,gradeSaturation:0,gradeHighlights:-.12},
};
export const gradingKeys=Object.keys(gradingDefaults);
const limit=(x,fallback,min,max)=>Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback;
export function gradingValues(s){return {
 exposure:limit(s.gradeExposure,0,-3,3),contrast:limit(s.gradeContrast,1,.5,1.8),saturation:limit(s.gradeSaturation,1,0,2),
 temperature:limit(s.gradeTemperature,0,-1,1),tint:limit(s.gradeTint,0,-1,1),shadows:limit(s.gradeShadows,0,-1,1),highlights:limit(s.gradeHighlights,0,-1,1),
};}
// A geometry transition must never turn the color correction off for a frame.
export function gradingState(s){return {mix:s.gradeEnabled?1:0,values:gradingValues(s)};}
export const gradingGLSL=`
 uniform float gradeMix,gradeExposure,gradeContrast,gradeSaturation,gradeTemperature,gradeTint,gradeShadows,gradeHighlights;
 vec3 colorGrade(vec3 source){
  vec3 c=source*exp2(gradeExposure);
  c*=exp2(vec3(gradeTemperature*.45+gradeTint*.2,-gradeTint*.35,-gradeTemperature*.45+gradeTint*.2));
  float luma=dot(c,vec3(.2126,.7152,.0722));
  c*=exp2((1.-smoothstep(.0,.35,luma))*gradeShadows+smoothstep(.35,1.,luma)*gradeHighlights);
  c=max(vec3(0.),(c-.18)*gradeContrast+.18);
  c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,gradeSaturation);
  return mix(source,clamp(c,0.,1.),gradeMix);
 }
`;
