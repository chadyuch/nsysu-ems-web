'use strict';
// Display preference only: it never changes equipment, scenario data or permissions.
let flowPaused = false;
try { flowPaused = localStorage.getItem('nsysu-flow-paused') === 'true'; } catch {}
const flowMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');

function flowLane(key, value, direction, label, stale) {
 const active = value > 0;
 const reverse = direction === 'in';
 const status = active ? label : (key === 'charge' ? '沒有充電' : '沒有供電');
 return `<div class="ef-lane ef-${key} ${active?'is-active':'is-idle'}" data-flow="${key}" data-direction="${direction}" data-power="${value}">
  <div class="ef-lane-label"><span>${stale?'最後紀錄：':''}${status}</span><strong>${fmt(value)} <small>kW</small></strong></div>
  <svg class="ef-track" viewBox="0 0 240 30" preserveAspectRatio="none" aria-hidden="true">
   <path class="ef-wire" d="M0 15 H240"/>
   ${active?`<path class="ef-stream" d="${reverse?'M240 15 H0':'M0 15 H240'}"/>`:''}
   <path class="ef-arrow" d="${reverse?'M20 7 L8 15 L20 23':'M220 7 L232 15 L220 23'}"/>
  </svg>
 </div>`;
}

function sourceFlow() {
 const s = scenario(), stale = state.scenario === 'offline';
 const discharge = Math.max(0,s.battery), charge = Math.max(0,-s.battery);
 const sources = s.grid+s.pv+s.generator+discharge;
 const node = (key,title,detail,ic,lanes) => `<div class="ef-row"><div class="ef-device ef-${key}"><div class="ef-device-title">${icon(ic)}<strong>${title}</strong></div><p>${detail}</p></div><div class="ef-lanes">${lanes}</div></div>`;
 const batteryStatus = charge?'正在把電存起來':discharge?'正在供電':s.soc<10?'低電量保護中':'準備待命';
 return `<div class="energy-flow" data-paused="${flowPaused}" data-stale="${stale}" aria-label="能源流向圖">
  <div class="ef-toolbar"><p>沿著箭頭，看電送到哪裡。</p><button type="button" data-flow-action="pause" aria-pressed="${flowPaused}" ${stale||flowMotionPreference.matches?'disabled':''}>${flowPaused?'繼續流向動畫':'暫停流向動畫'}</button></div>
  <p class="ef-motion-note" role="status">${flowMotionNote(stale)}</p>
  <div class="ef-scroll-tools"><p>左右滑動查看完整流向，也可按下方按鈕。</p><div class="actions"><button type="button" data-flow-action="sources">看電力來源</button><button type="button" data-flow-action="load">看用電端</button></div></div>
  <div class="ef-diagram-scroll" tabindex="0" role="region" aria-label="電力來源在左側，國研大樓微電網迴路用電在右側；可左右捲動查看"><div class="ef-diagram">
  <div class="ef-network">
   ${node('grid','台電','外部電力','power',flowLane('grid',s.grid,'out','供給校園',stale))}
   ${node('solar','太陽能','國研屋頂、海工停車場合計','sun',flowLane('solar',s.pv,'out','供給校園',stale))}
   ${node('generator','柴油機','國研備用發電機','settings',flowLane('generator',s.generator,'out','供給校園',stale))}
   ${node('battery','儲能電池',`${stale?'最後紀錄：':''}${batteryStatus}<br>剩餘 ${s.soc}%`,'battery',flowLane('discharge',discharge,'out','放電：電池供電',stale)+flowLane('charge',charge,'in','充電：存進電池',stale))}
  </div>
  <svg class="ef-load-link" viewBox="0 0 32 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 15 H30 M20 7 L30 15 L20 23"/></svg>
  <div class="ef-load"><div class="ef-load-title">${icon('grid')} <strong>國研大樓微電網迴路用電</strong></div><strong class="ef-load-value">${fmt(s.load)} <small>kW</small></strong>${state.scenario==='outage'?'<p>國研重要設備 300 kW<br>指定必要設備 120 kW</p>':state.scenario==='low'?'<p>目前僅保留國研必要用電</p>':''}</div>
  </div></div>
  <p class="ef-balance">${stale?'最後紀錄：':''}電源提供 ${fmt(sources)} kW ＝ 設備用電 ${fmt(s.load)} kW${charge?` ＋ 電池充電 ${fmt(charge)} kW`:''}</p>
  <p class="help-text">電池有兩條路：箭頭朝外是供電，朝內是把電存起來；不會同時充電和放電。灰線表示沒有電力流動。</p>
  <p class="help-text">kW 表示這一刻的電力大小。${stale?`這是 ${s.time} 的最後資料，動畫已停止，不能當作目前狀況。`:'數字是同一示範時點；動畫只表示方向，速度不代表電力大小。'}</p>
 </div>`;
}

function flowMotionNote(stale) {
 return stale?'資料暫停更新，流向動畫已停止。':flowMotionPreference.matches?'依照裝置的減少動態效果設定，以固定箭頭顯示。':flowPaused?'動畫已暫停，仍可看箭頭方向與數字。':'彩色線正在送電；灰色線目前沒有送電。';
}

function updateFlowMotion() {
 document.querySelectorAll('.energy-flow').forEach(flow=>{
  const stale=flow.dataset.stale==='true', button=flow.querySelector('[data-flow-action="pause"]');
  flow.dataset.paused=String(flowPaused);
  button.textContent=flowPaused?'繼續流向動畫':'暫停流向動畫';
  button.setAttribute('aria-pressed',String(flowPaused));
  button.disabled=stale||flowMotionPreference.matches;
  flow.querySelector('.ef-motion-note').textContent=flowMotionNote(stale);
 });
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-flow-action]');
 if(!button||button.disabled)return;
 if(button.dataset.flowAction!=='pause'){
  const viewport=button.closest('.energy-flow').querySelector('.ef-diagram-scroll');
  viewport.scrollTo({left:button.dataset.flowAction==='load'?viewport.scrollWidth:0,behavior:flowMotionPreference.matches?'instant':'smooth'});
  return;
 }
 flowPaused=!flowPaused;
 try{localStorage.setItem('nsysu-flow-paused',String(flowPaused));}catch{}
 updateFlowMotion();
});
flowMotionPreference.addEventListener('change',updateFlowMotion);
