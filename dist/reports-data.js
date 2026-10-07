/* Fixed, deterministic hourly teaching data. Calendar coordinates use UTC methods
   to represent Taiwan wall-clock hours, independent of the browser timezone. */
(function (root) {
  'use strict';
  const HOUR = 3600000, DAY = 24 * HOUR;
  const MIN = Date.UTC(2024, 0, 1), END = Date.UTC(2026, 9, 7);
  const REFERENCE = Date.UTC(2026, 9, 6);
  const sites = [
    {id:'research',name:'國研大樓',daily:3480},
    {id:'management',name:'管理學院',daily:2370},
    {id:'social',name:'社科院',daily:1880},
    {id:'pool',name:'A 水池',daily:650},
    {id:'marine',name:'海工停車場',daily:1100}
  ];
  const spaces = [
    ['r-public','research','一樓公共區'],['r-lab','research','研究實驗空間'],['r-service','research','熱水設備區'],
    ['m-class','management','二樓教室'],['m-office','management','辦公空間'],
    ['s-public','social','公共走廊'],['s-office','social','辦公空間'],
    ['p-pump','pool','抽水設備區'],['m-charge','marine','充電區'],['m-parking','marine','停車空間']
  ].map(([id,site,name])=>({id,site,name}));
  const loads = [
    ['ac1','r-public','公共區冷氣',30,'office'],['r-light','r-public','公共區照明',8,'office'],
    ['ac3','r-lab','實驗室專用冷氣',45,'base'],['r-lab-equipment','r-lab','研究設備迴路',70,'base'],
    ['hp1','r-service','熱水加熱設備',16,'heat'],['ac2','m-class','二樓教室冷氣',55,'office'],
    ['m-class-light','m-class','教室照明',12,'office'],['m-office-power','m-office','辦公設備迴路',28,'office'],
    ['light1','s-public','走廊照明',12,'light'],['s-office-power','s-office','辦公設備迴路',40,'office'],
    ['pump','p-pump','水池抽水設備',30,'base'],['ev1','m-charge','電動車充電區',45,'charge'],
    ['parking-light','m-parking','停車場照明',8,'light']
  ].map(([id,space,name,weight,profile])=>({id,space,name,weight,profile,site:spaces.find(s=>s.id===space).site,type:'load'}));
  const assets = [
    {id:'pv-research',site:'research',name:'國研屋頂太陽能',type:'pv',capacity:135},
    {id:'pv-marine',site:'marine',name:'海工停車場太陽能',type:'pv',capacity:295},
    {id:'ess-research',site:'research',name:'國研儲能電池',type:'storage',capacity:3000},
    {id:'diesel-research',site:'research',name:'國研柴油發電機',type:'diesel',capacity:400},
    {id:'pcs-research',site:'research',name:'國研 PCS 電力轉換設備',type:'pcs',capacity:1200}
  ];
  const kinds = {usage:'用電報表',generation:'發電量報表',storage:'儲能運轉報表',alarms:'異常告警報表'};
  const grains = {hour:'小時報表',day:'日報表',month:'月報表',year:'年報表'};
  const types = {pv:'太陽能',storage:'儲能電池',pcs:'PCS（電力轉換設備）',diesel:'柴油發電機'};
  const causes = {
    communication:{name:'資料連線中斷',types:['pv','storage','diesel','pcs']},
    temperature:{name:'設備溫度偏高',types:['pv','storage','diesel','pcs']},
    conversion:{name:'PCS 電力轉換異常',types:['pcs']},
    output:{name:'發電量偏低',types:['pv']},
    inverter:{name:'太陽能轉換設備異常',types:['pv']},
    battery:{name:'電池電量偏低',types:['storage']},
    fuel:{name:'柴油油量偏低',types:['diesel']},
    start:{name:'發電機啟動未完成',types:['diesel']}
  };
  const severity = {high:'需優先留意',warn:'需要查看',info:'一般提醒'};
  const pad=n=>String(n).padStart(2,'0');
  const iso=t=>new Date(t).toISOString().slice(0,19);
  const dayKey=t=>iso(t).slice(0,10);
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const cache=new Map();

  function defaults(kind='usage',grain='day') {
    const periods={hour:['2026-10-06T00:00','2026-10-06T23:00'],day:['2026-09-30','2026-10-06'],month:['2026-01','2026-09'],year:['2024','2026']};
    return {kind,grain,start:periods[grain][0],end:periods[grain][1],site:'all',space:'all',device:'all',type:'all',cause:'all',severity:'all',metric:'all'};
  }
  function parse(value,grain) {
    const patterns={hour:/^\d{4}-\d{2}-\d{2}T\d{2}:00$/,day:/^\d{4}-\d{2}-\d{2}$/,month:/^\d{4}-\d{2}$/,year:/^\d{4}$/};
    if(!patterns[grain]?.test(value))throw Error('請填寫完整的起訖時間；小時報表請選整點。');
    const stamp=value+({hour:':00Z',day:'T00:00:00Z',month:'-01T00:00:00Z',year:'-01-01T00:00:00Z'}[grain]);
    const t=Date.parse(stamp);
    if(!Number.isFinite(t)||!iso(t).startsWith(value))throw Error('日期不存在，請重新選擇。');
    return t;
  }
  function next(t,grain) {
    const d=new Date(t);
    if(grain==='hour')return t+HOUR;
    if(grain==='day')return t+DAY;
    if(grain==='month')return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
    return Date.UTC(d.getUTCFullYear()+1,0,1);
  }
  function range(f) {
    if(!kinds[f.kind]||!grains[f.grain])throw Error('請選擇有效的報表種類與時間單位。');
    const start=parse(f.start,f.grain),last=parse(f.end,f.grain);
    if(start>last)throw Error('開始時間不能晚於結束時間，請重新確認。');
    if(start<MIN||start>=END||last<MIN||last>=END)throw Error('示範資料範圍為 2024/1/1 至 2026/10/6，請選擇範圍內的時間。');
    const requestedEnd=next(last,f.grain),end=Math.min(END,requestedEnd);
    return {start,end,partial:end<requestedEnd};
  }
  function eligible(f) {
    let list=f.kind==='usage'?loads:assets.filter(a=>f.kind==='generation'?['pv','diesel'].includes(a.type):f.kind==='storage'?a.type==='storage':true);
    return list.filter(a=>(f.site==='all'||a.site===f.site)&&(f.kind!=='usage'||f.space==='all'||a.space===f.space)&&(f.type==='all'||f.kind==='usage'||a.type===f.type)&&(f.device==='all'||a.id===f.device));
  }
  function profile(name,h) {
    if(name==='base')return 0.85+0.15*Math.sin(Math.PI*h/24);
    if(name==='office')return h>=8&&h<18?1:h>=18&&h<21?.3:.08;
    if(name==='light')return h<6||h>=18?1:.2;
    if(name==='heat')return (h>=6&&h<9)||(h>=17&&h<21)?1:.15;
    return h>=8&&h<22?.45+.55*Math.sin(Math.PI*(h-8)/14):.1;
  }
  function daily(t) {
    const midnight=Math.floor(t/DAY)*DAY;
    if(cache.has(midnight))return cache.get(midnight);
    const ordinal=Math.floor(midnight/DAY),date=new Date(midnight);
    const factor=midnight===REFERENCE?1:0.86+(ordinal%19)/60;
    const rows=Array.from({length:24},(_,h)=>({time:midnight+h*HOUR,usage:{},generation:{},charge:0,discharge:0,socStart:45,socEnd:45}));
    for(const site of sites) {
      const members=loads.filter(a=>a.site===site.id),weights=[];
      for(const a of members)for(let h=0;h<24;h++)weights.push({id:a.id,h,w:a.weight*profile(a.profile,h)});
      const sum=weights.reduce((n,x)=>n+x.w,0),total=Math.round(site.daily*factor*100);
      let assigned=0;
      weights.forEach((x,i)=>{const v=i===weights.length-1?total-assigned:Math.floor(total*x.w/sum);rows[x.h].usage[x.id]=v;assigned+=v;});
    }
    const season=.78+.18*Math.cos((date.getUTCMonth()-5)*Math.PI/6),weather=.65+(ordinal%11)*.03;
    let stored=135000; // hundredths of a kWh; 45% of 3,000 kWh
    const charge=[150,200,250,250,150].map(x=>Math.round(x*(.9+(ordinal%9)*.025)*100));
    for(let h=0;h<24;h++) {
      for(const a of assets.filter(a=>['pv','diesel'].includes(a.type))) {
        rows[h].generation[a.id]=a.type==='pv'?Math.round(a.capacity*Math.max(0,Math.sin((h-6)*Math.PI/12))*(h>=6&&h<18?1:0)*season*weather*100):ordinal%17===0&&h>=10&&h<12?6000:0;
      }
      rows[h].socStart=stored/300000*100;
      rows[h].charge=h>=8&&h<=12?charge[h-8]:0;
      rows[h].discharge=h>=16&&h<=20?charge[h-16]:0;
      stored+=rows[h].charge-rows[h].discharge;
      rows[h].socEnd=stored/300000*100;
    }
    cache.set(midnight,rows);
    return rows;
  }
  function events(start,end,selected,f) {
    const list=[];
    for(let t=Math.floor(start/DAY)*DAY;t<end;t+=DAY) {
      const ordinal=Math.floor(t/DAY);
      for(const a of selected) {
        const i=assets.indexOf(a),frequency=[7,11,5,17,9][i];
        if((ordinal+i*3)%frequency!==0)continue;
        const options=Object.entries(causes).filter(([,c])=>c.types.includes(a.type));
        const cause=options[(ordinal+i)%options.length][0],level=['high','warn','info'][(ordinal+i)%3];
        const time=t+((ordinal+i*7)%24)*HOUR+((ordinal*13+i)%60)*60000;
        if(time<start||time>=end||(f.cause!=='all'&&cause!==f.cause)||(f.severity!=='all'&&level!==f.severity))continue;
        list.push({id:`EV-${dayKey(t)}-${a.id}`,time,date:iso(time).slice(0,16).replace('T',' '),site:a.site,device:a.id,type:a.type,cause,severity:level,status:(ordinal+i)%3?'已恢復':'已安排處理'});
      }
    }
    return list.sort((a,b)=>a.time-b.time);
  }
  function key(t,grain) {return iso(t).slice(0,{hour:13,day:10,month:7,year:4}[grain]);}
  function label(k,grain) {return grain==='hour'?k.replace('T',' ')+':00':k;}
  function query(input) {
    const f={...input},r=range(f),selected=eligible(f);
    const bins=new Map();
    for(let t=r.start;t<r.end;t=next(t,f.grain)) {
      const k=key(t,f.grain);bins.set(k,{key:k,label:label(k,f.grain),usage:0,pv:0,diesel:0,charge:0,discharge:0,socStart:null,socEnd:null,socMin:null,socMax:null,high:0,warn:0,info:0,count:0});
    }
    const alarmEvents=f.kind==='alarms'?events(r.start,r.end,selected,f):[];
    if(selected.length&&f.kind!=='alarms')for(let t=Math.floor(r.start/DAY)*DAY;t<r.end;t+=DAY)for(const row of daily(t)) {
      if(row.time<r.start||row.time>=r.end)continue;
      const b=bins.get(key(row.time,f.grain));
      if(f.kind==='usage')for(const a of selected)b.usage+=row.usage[a.id];
      if(f.kind==='generation')for(const a of selected)b[a.type]+=row.generation[a.id];
      if(f.kind==='storage') {
        b.charge+=row.charge;b.discharge+=row.discharge;
        if(b.socStart===null)b.socStart=row.socStart;
        b.socEnd=row.socEnd;
        b.socMin=Math.min(b.socMin??100,row.socStart,row.socEnd);
        b.socMax=Math.max(b.socMax??0,row.socStart,row.socEnd);
      }
    }
    for(const event of alarmEvents){const b=bins.get(key(event.time,f.grain));b[event.severity]++;b.count++;}
    const rows=selected.length?Array.from(bins.values()).map(b=>{
      for(const k of ['usage','pv','diesel','charge','discharge'])b[k]/=100;
      b.generation=round(b.pv+b.diesel);return b;
    }):[];
    const total={};
    for(const k of ['usage','pv','diesel','generation','charge','discharge','high','warn','info','count'])total[k]=round(rows.reduce((n,b)=>n+b[k],0));
    total.socStart=rows[0]?.socStart??null;total.socEnd=rows.at(-1)?.socEnd??null;
    total.socMin=rows.length&&f.kind==='storage'?Math.min(...rows.map(b=>b.socMin)):null;
    total.socMax=rows.length&&f.kind==='storage'?Math.max(...rows.map(b=>b.socMax)):null;
    return {filters:f,range:r,selected,rows,total,events:alarmEvents};
  }
  function scope(f) {
    const parts=[f.site==='all'?'全部適用場域':sites.find(s=>s.id===f.site)?.name];
    if(f.kind==='usage')parts.push(f.space==='all'?'全部空間':spaces.find(s=>s.id===f.space)?.name);
    else if(f.kind==='generation'||f.kind==='alarms')parts.push(f.type==='all'?'全部設備種類':types[f.type]);
    parts.push(f.device==='all'?'全部適用設備':[...loads,...assets].find(a=>a.id===f.device)?.name);
    if(f.kind==='alarms')parts.push(f.cause==='all'?'所有異常類型':causes[f.cause]?.name,f.severity==='all'?'所有提醒程度':severity[f.severity]);
    return parts.filter(Boolean).join(' ／ ');
  }
  function period(result) {return `${iso(result.range.start).slice(0,16).replace('T',' ')} 至 ${iso(result.range.end-HOUR).slice(0,13).replace('T',' ')}:59`;}
  const api={sites,spaces,loads,assets,kinds,grains,types,causes,severity,MIN,END,HOUR,DAY,defaults,range,eligible,query,scope,period,round,daily};
  root.ReportData=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
