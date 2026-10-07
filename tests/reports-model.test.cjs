const assert=require('node:assert/strict');
const R=require('../dist/reports-data.js');
const query=(kind,grain,start,end,extra={})=>R.query({...R.defaults(kind,grain),start,end,...extra});
const close=(a,b)=>assert(Math.abs(a-b)<.011,`${a} != ${b}`);
const failures=[['day','2026-02-30','2026-03-01'],['hour','2026-10-06T01:30','2026-10-06T02:00'],['day','','2026-10-06'],['day','2026-10-07','2026-10-07'],['month','2023-12','2024-01'],['day','2026-10-06','2026-10-05']];
for(const [grain,start,end] of failures)assert.throws(()=>query('usage',grain,start,end));
for(const kind of Object.keys(R.kinds)){
  const fields={usage:['usage'],generation:['pv','diesel','generation'],storage:['charge','discharge'],alarms:['count','high','warn','info']}[kind];
  const hourly=query(kind,'hour','2026-10-06T00:00','2026-10-06T23:00');
  const daily=query(kind,'day','2026-10-06','2026-10-06');
  for(const field of fields)close(hourly.total[field],daily.total[field]);
  const days=query(kind,'day','2026-09-01','2026-09-30'),month=query(kind,'month','2026-09','2026-09');
  for(const field of fields)close(days.total[field],month.total[field]);
  const months=query(kind,'month','2025-01','2025-12'),year=query(kind,'year','2025','2025');
  for(const field of fields)close(months.total[field],year.total[field]);
  assert.deepEqual(R.query(hourly.filters),hourly,'repeated queries must be deterministic');
}
const day=R.defaults('usage','day');day.start=day.end='2026-10-06';
let four=0;
for(const s of R.sites){
  const site=R.query({...day,site:s.id});close(site.total.usage,s.daily);if(s.id!=='marine')four+=site.total.usage;
  let sum=0;for(const space of R.spaces.filter(x=>x.site===s.id)){
    const result=R.query({...day,site:s.id,space:space.id});
    const deviceSum=R.loads.filter(a=>a.space===space.id).reduce((n,a)=>n+R.query({...day,site:s.id,space:space.id,device:a.id}).total.usage,0);
    close(result.total.usage,deviceSum);sum+=result.total.usage;
  }close(site.total.usage,sum);
}close(four,8380);
assert.equal(query('generation','day','2026-10-06','2026-10-06',{site:'marine',type:'diesel'}).rows.length,0);
for(const d of [R.MIN,Date.UTC(2024,1,29),Date.UTC(2026,9,6)])for(const row of R.daily(d)){
  for(const a of R.assets.filter(a=>['pv','diesel'].includes(a.type)))assert(row.generation[a.id]>=0&&row.generation[a.id]/100<=a.capacity);
  const hour=new Date(row.time).getUTCHours();if(hour<6||hour>=18)assert.equal(row.generation['pv-research'],0);
  assert(row.socEnd>=0&&row.socEnd<=100);close((row.socEnd-row.socStart)*3000/100,(row.charge-row.discharge)/100);
}
const storage=query('storage','hour','2026-10-06T00:00','2026-10-06T23:00');
close(storage.total.socStart,45);close(storage.total.socEnd,45);assert(storage.total.socMax>storage.total.socMin);
const leap=query('usage','day','2024-02-01','2024-02-29');assert.equal(leap.rows.length,29);
const partial=query('usage','year','2026','2026');assert(partial.range.partial);assert.equal(partial.range.end,R.END);
const alarms=query('alarms','year','2024','2026');assert.equal(new Set(alarms.events.map(e=>e.id)).size,alarms.events.length);assert.equal(alarms.total.count,alarms.events.length);
for(const a of R.assets){const filtered=query('alarms','year','2024','2026',{site:a.site,type:a.type,device:a.id,cause:'communication',severity:'warn'});assert(filtered.events.every(e=>e.site===a.site&&e.device===a.id&&e.type===a.type&&e.cause==='communication'&&e.severity==='warn'));}
console.log('PASS: all 16 report modes; time aggregation; device/space/site rollups; deterministic data; equipment capacity; SOC energy balance; leap day; partial period; range validation; unique and filtered alarm events.');
