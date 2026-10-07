const assert=require('node:assert/strict'),I=require('../dist/island-data.js');
const close=(a,b,tolerance=.011)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
for(const e of I.events){
  assert(e.start<e.restore&&e.restore<e.end);
  assert.equal(e.rows[0].time,e.start);assert.equal(e.rows.at(-1).time,e.end);
  assert.equal(new Set(e.rows.map(r=>r.time)).size,e.rows.length);
  for(const t of [e.start,e.batteryStart,e.batteryStop,e.transfer,e.engineStart,e.engineStop,e.restore].filter(t=>t!==null))assert(e.rows.some(r=>r.time===t));
  for(let n=0;n<e.rows.length;n++){
    const r=e.rows[n];assert(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(r.date));
    close(r.pv+r.battery+r.diesel+r.grid,r.load);
    assert(r.battery>=0&&r.battery<=1200);assert(r.diesel>=0&&r.diesel<=400);assert(r.pv>=0&&r.pv<=430);
    assert(r.soc>=0&&r.soc<=100);assert(r.fuel>=0&&r.fuel<=100);
    if(r.time<e.restore)assert.equal(r.grid,0);
    if(r.diesel>0)assert(r.load<=250&&r.battery===0&&r.pv===0);
    if(r.time>=e.batteryStop)assert.equal(r.battery,0);
    if(e.engineStop&&r.time>=e.engineStop)assert.equal(r.engine,false);
    if(n){const p=e.rows[n-1],hours=(r.time-p.time)/I.HOUR;assert(r.time>p.time);close(p.soc-r.soc,p.battery*hours/I.EFFICIENCY/I.CAPACITY*100,.000001);close(p.fuel-r.fuel,p.fuelRate*hours,.000001);assert(r.fuel<=p.fuel);}
  }
  if(e.transfer){assert(e.engineStart<e.transfer&&e.transfer===e.batteryStop&&e.transfer<e.restore&&e.restore<e.engineStop);assert(e.rows.find(r=>r.time===e.restore).engine);assert.equal(e.rows.find(r=>r.time===e.restore).diesel,0);}
  else{assert.equal(e.engineStart,null);assert.equal(e.engineStop,null);assert.equal(e.batteryStop,e.restore);assert(e.rows.every(r=>r.diesel===0&&r.engine===false&&r.fuel===e.fuel));}
  if(e.solar===0)assert(e.rows.every(r=>r.pv===0));
  close(e.summary.socEnd,e.rows.at(-1).soc);
  close(e.summary.fuelEnd,e.rows.at(-1).fuel);
}
assert(I.filter('2026/09/29','2026/09/29').some(e=>e.id==='ISLAND-20260928'));
assert.equal(I.filter('2026/09/01','2026/09/02').length,0);
for(const [a,b] of [['2026/09/31','2026/10/01'],['2026/10/07','2026/10/06'],['','2026/10/06'],['2026-10-06','2026/10/06']])assert.throws(()=>I.filter(a,b));
console.log(JSON.stringify({status:'passed',events:I.events.map(e=>({id:e.id,start:I.stamp(e.start),restore:I.stamp(e.restore),samples:e.rows.length,socEnd:I.round(e.summary.socEnd),fuelEnd:I.round(e.summary.fuelEnd)})),checks:['power balance','equipment limits','SOC integration','fuel use','handover chronology','cooldown vs power output','night zero PV','short event without diesel','cross-day overlap','seconds and date formatting','invalid dates']}));
