import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from './motion.js';
import {splatEffectAt} from './splat-effects.js';

test('old projects and disabled effects preserve the original splat',()=>{
 for(const s of [{},defaults,{...defaults,splatMode:'off',splatAmount:1,splatDetail:1}]){
  const effect=splatEffectAt(s,4,{bass:1});
  assert.equal(effect.mode,0);assert.equal(effect.amount,0);assert.equal(effect.detail,0);
 }
});
test('reassembly and a full cycle return exactly to the undeformed source',()=>{
 const s={...defaults,splatMode:'explode',splatAnimation:'assemble'};
 assert.equal(splatEffectAt(s,0).envelope,1);
 assert.equal(splatEffectAt(s,s.duration,{bass:1}).amount,0);
 assert.equal(splatEffectAt(s,s.duration,{bass:1}).detail,0);
 const cycle={...s,splatAnimation:'cycle'};
 assert.equal(splatEffectAt(cycle,0).amount,0);
 assert.ok(splatEffectAt(cycle,s.duration).amount<1e-12);
 assert.equal(splatEffectAt(cycle,s.duration/2).envelope,1);
});
test('music modulates only the chosen band and stays bounded',()=>{
 const s={...defaults,splatMode:'drift',splatAmount:.2,splatMusic:.5,splatBand:'high'};
 assert.equal(splatEffectAt(s,2,{bass:1,high:0}).amount,.2);
 assert.equal(splatEffectAt(s,2,{high:1}).amount,.7);
 assert.equal(splatEffectAt({...s,splatAmount:.8},2,{high:1}).amount,1);
 assert.equal(splatEffectAt({...s,splatMusic:0},2,{high:1}).amount,.2);
});
test('seeking and out-of-order frame rendering are deterministic',()=>{
 const s={...defaults,splatMode:'vortex',splatAnimation:'cycle'};
 const expected=splatEffectAt(s,4.125,{bass:.3});
 for(const t of [0,12,2,7.2,4.125])splatEffectAt(s,t,{bass:.9});
 assert.deepEqual(splatEffectAt(s,4.125,{bass:.3}),expected);
 assert.equal(splatEffectAt({...s,splatSpeed:0},8).time,0);
});
