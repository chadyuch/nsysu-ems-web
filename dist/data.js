'use strict';
window.DEMO = {
 date:'2026-10-07', time:'14:30',
 scenarios:{
  normal:{name:'平常供電',title:'供電正常，可以安心使用',description:'太陽能提供部分用電，其餘由台電供應。電池正在待命。',tone:'good',grid:260,pv:260,battery:0,generator:0,load:520,soc:72,time:'14:30',mode:'台電與太陽能一起供電'},
  charging:{name:'模擬電池充電',title:'電池正在充電，把電留著備用',description:'台電與太陽能供應設備用電，同時分出部分電力存進電池。電池目前沒有對外供電。',tone:'good',grid:260,pv:360,battery:-100,generator:0,load:520,soc:62,time:'14:30',mode:'台電與太陽能供電，同時為電池充電'},
  outage:{name:'模擬台電停電',title:'台電暫停供電，備用電力已接手',description:'太陽能與電池正在供應國研重要用電及指定必要設備。其他用電暫時減少。',tone:'warn',grid:0,pv:200,battery:220,generator:0,load:420,soc:64,time:'14:30',mode:'太陽能與電池提供備用電力'},
  offline:{name:'模擬畫面連線中斷',title:'暫時收不到新資料，請查看最後更新時間',description:'現場可依原本設定運轉。以下是 14:20 最後收到的資料，並非目前即時狀況。',tone:'warn',grid:260,pv:260,battery:0,generator:0,load:520,soc:72,time:'14:20',mode:'最後紀錄：台電與太陽能供電'},
  low:{name:'模擬電池不足',title:'電池剩餘不多，發電機已接手',description:'這是夜間停電示範。電池已停止供電，發電機保留國研必要用電。',tone:'danger',grid:0,pv:0,battery:0,generator:240,load:240,soc:8,time:'20:30',mode:'發電機提供國研必要用電'},
  peak:{name:'模擬用電偏高',title:'用電比平常多，電池正在幫忙',description:'電池正在協助供電，減少向台電取電。請留意未使用空間的冷氣。',tone:'warn',grid:300,pv:300,battery:250,generator:0,load:850,soc:58,time:'14:30',mode:'台電、太陽能與電池一起供電'}
 },
 buildings:[{id:'research',name:'國研大樓',description:'重要研究與實驗空間',today:3240,yesterday:3480,area:12000},{id:'management',name:'管理學院',description:'教室與辦公空間',today:2180,yesterday:2370,area:9500},{id:'social',name:'社科院',description:'教室與公共空間',today:1790,yesterday:1880,area:8300},{id:'pool',name:'A 水池',description:'抽水及必要設備',today:630,yesterday:650,area:0}],
 alerts:[
 {id:'mg-battery-01',category:'equipment',title:'一組儲能電池溫度偏高',place:'國研儲能區',level:'warn',description:'其中一組電池回報溫度偏高，請安排維護人員確認電池與冷卻設備。',time:'14:18',status:'new',note:'',device:'ess-research'},
 {id:'mg-pcs-01',category:'equipment',title:'PCS 暫時沒有回報資料',place:'國研儲能區',level:'warn',description:'PCS 是幫電池轉換電力的設備。目前收不到它的最新資料，請安排人員確認設備與連線；尚不能判定是否故障。',time:'14:12',status:'new',note:'',device:'pcs-research'},
 {id:'mg-pv-01',category:'equipment',title:'太陽能轉換設備回報異常',place:'海工停車場',level:'warn',description:'一台把太陽能轉成可用電力的設備回報異常，請安排維護人員確認該設備與發電狀況。',time:'14:05',status:'new',note:'',device:'pv-marine'},
 {id:'mg-diesel-01',category:'equipment',title:'柴油機啟動電池已恢復正常',place:'國研柴油機區',level:'info',description:'柴油機用來啟動的電池曾回報電量偏低，維護人員已完成檢查，目前回報正常。',time:'10:42',status:'done',note:'已檢查啟動電池與充電設備，持續觀察。',device:'diesel-research'}
 ],
 accounts:[{id:'u1',name:'林管理員',role:'admin',active:true},{id:'u2',name:'王維護員',role:'operator',active:true},{id:'u3',name:'陳研究員',role:'viewer',active:true}],
 history:[210,195,186,182,178,190,230,320,440,485,510,535,520,498,520,560,590,550,470,390,325,285,250,225]
};
