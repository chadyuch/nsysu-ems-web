/* Independent island-event teaching scenarios; never actual outage history. */
(function(root){
  'use strict';
  const SECOND=1000,MINUTE=60000,HOUR=3600000,DAY=24*HOUR,CAPACITY=3000,EFFICIENCY=.95;
  // UTC calendar coordinates represent Taiwan wall-clock time without browser-zone shifts.
  const parse=s=>Date.parse(s.replaceAll('/','-').replace(' ','T')+'Z');
  const stamp=t=>new Date(t).toISOString().slice(0,19).replaceAll('-','/').replace('T',' ');
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const definitions=[
    {id:'ISLAND-20261006',name:'白天停電，柴油機接手',start:'2026/10/06 10:15:00',transfer:'2026/10/06 13:35:20',restore:'2026/10/06 15:05:10',soc:55,fuel:78,load:480,solar:.64},
    {id:'ISLAND-20260928',name:'跨日夜間停電',start:'2026/09/28 23:35:40',transfer:'2026/09/29 00:35:10',restore:'2026/09/29 01:20:30',soc:32,fuel:82,load:320,solar:0},
    {id:'ISLAND-20260918',name:'短時間停電，電池完成支援',start:'2026/09/18 14:02:15',transfer:null,restore:'2026/09/18 14:12:45',soc:72,fuel:80,load:420,solar:.72}
  ];
  function duration(ms){const seconds=Math.round(ms/SECOND),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return `${h?`${h} 小時 `:''}${m} 分 ${s} 秒`;}
  function build(d){
    const start=parse(d.start),restore=parse(d.restore),transfer=d.transfer?parse(d.transfer):null;
    const engineStart=transfer?transfer-2*MINUTE:null,engineStop=transfer?restore+3*MINUTE:null,end=(engineStop||restore)+2*MINUTE;
    const batteryStop=transfer||restore;
    const times=new Set([start,restore,end,batteryStop]);
    for(let t=start;t<=end;t+=5*MINUTE)times.add(t);
    for(const t of [engineStart,transfer,restore,engineStop])if(t!==null){times.add(t);if(t>start)times.add(t-SECOND);}
    const sorted=Array.from(times).sort((a,b)=>a-b);
    let soc=d.soc,fuel=d.fuel,batteryEnergy=0,dieselEnergy=0,solarEnergy=0;
    function powers(t){
      const elapsed=(t-start)/HOUR,calendar=new Date(t),hour=calendar.getUTCHours()+calendar.getUTCMinutes()/60+calendar.getUTCSeconds()/3600;
      const dieselStage=transfer!==null&&t>=transfer&&t<restore;
      let pv=hour>6&&hour<18?430*d.solar*Math.sin((hour-6)*Math.PI/12)*(0.88+0.10*Math.sin(elapsed*2.4)):0;
      // This scenario disconnects self-use PV during the diesel-only protected-load stage.
      if(dieselStage)pv=0;
      pv=round(Math.max(0,pv));
      const load=round(dieselStage?230+8*Math.sin(elapsed*2):d.load+18*Math.sin(elapsed*1.8));
      const battery=t<batteryStop?round(load-pv):0,diesel=dieselStage?load:0,grid=t>=restore?round(load-pv):0;
      const engine=engineStart!==null&&t>=engineStart&&t<engineStop;
      const phase=t>=restore?(engine?'台電恢復，柴油機冷卻中':'已恢復台電供電'):dieselStage?'柴油機供應國研必要設備':engine?'電池供電，柴油機準備中':pv>0?'電池與太陽能供電':'電池供電';
      return {time:t,date:stamp(t),battery,diesel,pv,grid,load,engine,phase,mode:t<restore?'孤島運轉':'併網運轉',fuelRate:engine?(diesel?2+diesel*.02:.6):0};
    }
    const rows=[];
    for(const t of sorted){
      const previous=rows.at(-1);
      if(previous){const hours=(t-previous.time)/HOUR;const energy=previous.battery*hours;batteryEnergy+=energy;dieselEnergy+=previous.diesel*hours;solarEnergy+=previous.pv*hours;soc-=energy/EFFICIENCY/CAPACITY*100;fuel-=previous.fuelRate*hours;}
      rows.push({...powers(t),soc,fuel});
    }
    const milestones=[
      {id:'enter',title:'進入孤島運轉',time:start,text:'暫時與台電分開，由現場備用電力供應國研重要用電及指定必要設備。'},
      {id:'battery-start',title:'電池開始供電',time:start,text:'電池接手補足用電，功率與剩餘電量開始記錄。'},
      ...(transfer?[
        {id:'diesel-start',title:'柴油機啟動準備',time:engineStart,text:'發電機先啟動準備，此時尚未輸出電力，仍由電池支援。'},
        {id:'transfer',title:'柴油機開始供電，電池停止供電',time:transfer,text:'為保留電池電量，轉由柴油機供應國研必要設備；用電縮減至 250 kW 以下。此示範期間太陽能暫停輸出。'}
      ]:[]),
      {id:'restore',title:'恢復併網，回到台電供電',time:restore,text:transfer?'台電重新接手，柴油機停止輸出電力並進入冷卻；太陽能恢復依日照發電。':'台電重新接手，電池停止供電；本次沒有啟動柴油機。'},
      ...(engineStop?[{id:'diesel-stop',title:'柴油機冷卻完成，停止運轉',time:engineStop,text:'發電機完成冷卻並停機。停止供電與實際停機是不同的時間點。'}]:[])
    ];
    return {...d,start,restore,transfer,engineStart,engineStop,end,batteryStart:start,batteryStop,rows,milestones,
      summary:{duration:restore-start,batteryDuration:batteryStop-start,dieselDuration:transfer?restore-transfer:0,engineDuration:engineStart?engineStop-engineStart:0,batteryEnergy:round(batteryEnergy),dieselEnergy:round(dieselEnergy),solarEnergy:round(solarEnergy),socStart:d.soc,socEnd:rows.at(-1).soc,fuelStart:d.fuel,fuelEnd:rows.at(-1).fuel,
        batteryMax:Math.max(...rows.map(r=>r.battery)),dieselMax:Math.max(...rows.map(r=>r.diesel)),solarMax:Math.max(...rows.map(r=>r.pv))}};
  }
  const events=definitions.map(build);
  function filter(from,to){
    const valid=value=>{if(!/^\d{4}\/\d{2}\/\d{2}$/.test(value))return false;const t=parse(value+' 00:00:00');return Number.isFinite(t)&&stamp(t).slice(0,10)===value;};
    if(!valid(from)||!valid(to))throw Error('請用 YYYY/MM/DD 填寫有效日期，例如 2026/10/06。');
    const a=parse(from+' 00:00:00'),b=parse(to+' 00:00:00')+DAY;
    if(a>=b)throw Error('開始日期不能晚於結束日期，請重新確認。');
    return events.filter(e=>e.start<b&&e.restore>a);
  }
  const api={events,stamp,parse,duration,filter,round,CAPACITY,EFFICIENCY,HOUR,MINUTE};
  root.IslandData=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
