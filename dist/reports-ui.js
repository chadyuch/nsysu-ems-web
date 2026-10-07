'use strict';
const reportTabKinds={...ReportData.kinds,island:'孤島運轉資訊'};
let reportActiveTab='usage';
let reportDraft=ReportData.defaults(), reportApplied=null, reportError='', reportPage=0, reportEventPage=0;
const reportNumber=n=>n===null||n===undefined?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const reportUnit={hour:'小時',day:'天',month:'月',year:'年'};
const reportColors={usage:'#087b91',pv:'#996200',diesel:'#72569a',charge:'#075670',discharge:'#a34e0a',socEnd:'#075670',socMin:'#776493',socMax:'#176248',high:'#a82e2e',warn:'#986000',info:'#216fa0'};
const reportNames={usage:'用電量',pv:'太陽能發電量',diesel:'柴油發電量',charge:'充電量',discharge:'放電量',socEnd:'期末電量',socMin:'期間最低',socMax:'期間最高',high:'需優先留意',warn:'需要查看',info:'一般提醒'};
function reportDirty(){return JSON.stringify(reportDraft)!==JSON.stringify(reportApplied?.filters);}
function reportOptions(items,value,all='全部'){return `<option value="all">${all}</option>`+items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(x.name)}</option>`).join('');}
function reportSelect(id,label,items,value,all='全部'){return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${reportOptions(items,value,all)}</select></div>`;}
function reportAvailableSites(f){const candidates=f.kind==='usage'?ReportData.loads:ReportData.assets.filter(a=>f.kind==='storage'?a.type==='storage':f.kind==='generation'?['pv','diesel'].includes(a.type):true);return ReportData.sites.filter(s=>candidates.some(a=>a.site===s.id));}
function reportTimes(f){
  if(f.grain==='hour')return ['start','end'].map((key,i)=>`<div class="report-hour-range"><div class="field"><label for="report-${key}">${i?'結束':'開始'}日期</label><input id="report-${key}" type="date" min="2024-01-01" max="2026-10-06" required value="${esc(f[key].split('T')[0])}" aria-describedby="report-time-help report-error"></div><div class="field"><label for="report-${key}-hour">${i?'結束':'開始'}時段（整點）</label><select id="report-${key}-hour">${Array.from({length:24},(_,h)=>{const value=String(h).padStart(2,'0')+':00';return `<option value="${value}" ${f[key].split('T')[1]===value?'selected':''}>${value}</option>`;}).join('')}</select></div></div>`).join('');
  const config={hour:['datetime-local','2024-01-01T00:00','2026-10-06T23:00','起始小時','結束小時'],day:['date','2024-01-01','2026-10-06','開始日期','結束日期'],month:['month','2024-01','2026-10','開始月份','結束月份'],year:['number','2024','2026','開始年份','結束年份']}[f.grain];
  return ['start','end'].map((key,i)=>`<div class="field"><label for="report-${key}">${config[3+i]}</label><input id="report-${key}" type="${config[0]}" min="${config[1]}" max="${config[2]}" ${f.grain==='hour'?'step="3600"':f.grain==='year'?'step="1"':''} required value="${esc(f[key])}" aria-describedby="report-time-help report-error"></div>`).join('');
}
function reportForm(){
  const f=reportDraft, spaces=ReportData.spaces.filter(s=>f.site==='all'||s.site===f.site);
  const devices=ReportData.eligible({...f,device:'all'}).map(a=>({id:a.id,name:(f.site==='all'?ReportData.sites.find(s=>s.id===a.site).name+' · ':'')+a.name}));
  const typeOptions=Object.entries(ReportData.types).filter(([k])=>f.kind!=='generation'||['pv','diesel'].includes(k)).map(([id,name])=>({id,name}));
  const causeOptions=Object.entries(ReportData.causes).filter(([,c])=>f.type==='all'||c.types.includes(f.type)).map(([id,c])=>({id,name:c.name}));
  return `<section class="card report-controls"><form id="report-form" novalidate><div class="report-section-label">1. 選擇要查看的範圍</div><div class="report-filter-grid">${reportSelect('report-site','場域',reportAvailableSites(f),f.site,'全部適用場域')}${f.kind==='usage'?reportSelect('report-space','空間',spaces,f.space,'全部空間'):''}${['generation','alarms'].includes(f.kind)?reportSelect('report-type','設備種類',typeOptions,f.type,'全部設備種類'):''}${reportSelect('report-device',f.kind==='usage'?'用電設備':'設備',devices,f.device,devices.length?'全部適用設備':'沒有符合的設備')}${f.kind==='alarms'?reportSelect('report-cause','異常類型',causeOptions,f.cause,'所有異常類型')+reportSelect('report-severity','提醒程度',Object.entries(ReportData.severity).map(([id,name])=>({id,name})),f.severity,'所有提醒程度'):''}${f.kind==='storage'?`<div class="field"><label for="report-metric">想看哪些運轉資料？</label><select id="report-metric">${[['all','充電、放電與電池電量'],['charge','充電量'],['discharge','放電量'],['soc','電池電量（SoC）變化']].map(([id,name])=>`<option value="${id}" ${f.metric===id?'selected':''}>${name}</option>`).join('')}</select></div>`:''}</div><div class="report-section-label">2. 選擇報表時間</div><div class="report-filter-grid"><div class="field"><label for="report-grain">報表時間單位</label><select id="report-grain">${Object.entries(ReportData.grains).map(([id,name])=>`<option value="${id}" ${f.grain===id?'selected':''}>${name}（每${reportUnit[id]}一筆）</option>`).join('')}</select></div>${reportTimes(f)}</div><p id="report-time-help" class="help-text">固定示範歷史資料：2024/1/1 至 2026/10/6。起訖期間皆納入；2026 年與 2026 年 10 月只計至 10/6。</p><p id="report-error" class="error" role="alert">${esc(reportError)}</p><div class="report-query-actions"><button type="submit" class="primary">${icon('chart')} 查詢報表</button><button type="button" data-report-action="reset">恢復預設條件</button><span id="report-dirty" class="report-dirty" role="status">${reportDirty()?'條件已變更，請按「查詢報表」。':''}</span></div></form></section>`;
}
function reportColumns(r){
  const base=[['label','時間區間']];
  if(r.filters.kind==='usage')return [...base,['usage','用電量（度）']];
  if(r.filters.kind==='generation')return [...base,['pv','太陽能（度）'],['diesel','柴油發電機（度）'],['generation','合計發電量（度）']];
  if(r.filters.kind==='alarms')return [...base,['high','需優先留意（件）'],['warn','需要查看（件）'],['info','一般提醒（件）'],['count','合計（件）']];
  const m=r.filters.metric,cols=[];
  if(m==='all'||m==='charge')cols.push(['charge','充電量（度）']);
  if(m==='all'||m==='discharge')cols.push(['discharge','放電量（度）']);
  if(m==='all'||m==='soc')cols.push(['socStart','期初電量（%）'],['socMin','最低電量（%）'],['socMax','最高電量（%）'],['socEnd','期末電量（%）']);
  return [...base,...cols];
}
function reportMetric(label,value,unit,note){return `<article class="card"><p class="metric-label">${label}</p><div class="metric-value">${typeof value==='number'?reportNumber(value):esc(value)}<span>${unit}</span></div><p class="metric-detail">${note}</p></article>`;}
function reportSummary(r){
  const t=r.total,n=r.rows.length,unit=reportUnit[r.filters.grain],period=`共 ${n} ${unit}`;
  if(r.filters.kind==='usage')return reportMetric('這段時間總用電',t.usage,'度電',period)+reportMetric('平均每'+unit+'用電',n?t.usage/n:0,'度電','依實際列出的時間區間計算')+reportMetric('單'+({hour:'小時',day:'日',month:'月',year:'年'}[r.filters.grain])+'最高用電',Math.max(0,...r.rows.map(x=>x.usage)),'度電','可在下方明細核對發生時間')+reportMetric('納入統計的設備',r.selected.length,'項','設備電量逐層加總，沒有重複計算');
  if(r.filters.kind==='generation')return reportMetric('總發電量',t.generation,'度電',period)+reportMetric('太陽能發電量',t.pv,'度電','國研與海工自用太陽能，依條件篩選')+reportMetric('柴油發電量',t.diesel,'度電','有設備但未發電的時段記為 0')+reportMetric('納入統計的設備',r.selected.length,'項','既有躉售太陽能未納入此報表');
  if(r.filters.kind==='storage')return reportMetric('這段時間充入',t.charge,'度電',period)+reportMetric('這段時間放出',t.discharge,'度電','充電量與放電量分開計算')+reportMetric('期末電池電量',t.socEnd??'—','%','採最後一筆紀錄，百分比不加總')+reportMetric('期間電量範圍',`${reportNumber(t.socMin)}–${reportNumber(t.socMax)}`,'%','包含期間內每小時的電量變化');
  return reportMetric('發生的異常提醒',t.count,'件',period)+reportMetric('需要優先留意',t.high,'件','依事件發生時的提醒程度統計')+reportMetric('曾發生提醒的設備',new Set(r.events.map(e=>e.device)).size,'項','同一設備在此只計算一次')+reportMetric('已恢復的事件',r.events.filter(e=>e.status==='已恢復').length,'件','處理狀態不改變事件發生次數');
}
function reportChart(rows,keys,{title,unit='度電',line=false,soc=false,stack=false}={}){
  const main=$('#main'),style=getComputedStyle(main),w=Math.max(280,Math.round(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(innerWidth<=450?34:50))),h=310,left=76,right=22,top=24,bottom=66;
  const plotW=w-left-right,plotH=h-top-bottom,max=soc?100:Math.max(1,...rows.map(r=>stack?keys.reduce((n,k)=>n+r[k],0):Math.max(...keys.map(k=>r[k]??0))));
  const magnitude=Math.pow(10,Math.floor(Math.log10(max))),limit=soc?100:unit==='件'?Math.max(2,Math.ceil(max*1.12/2)*2):Math.ceil(max*1.12/magnitude*2)/2*magnitude,x=i=>left+(i+.5)*plotW/rows.length,y=v=>h-bottom-v/limit*plotH;
  const nf=n=>n>=1000000?(n/1000000).toLocaleString('zh-TW',{maximumFractionDigits:1})+'百萬':n>=10000?(n/10000).toLocaleString('zh-TW',{maximumFractionDigits:1})+'萬':reportNumber(n);
  const tickCount=Math.min(rows.length,Math.max(2,Math.min(6,Math.floor(plotW/130))));
  const ticks=new Set(Array.from({length:tickCount},(_,i)=>tickCount===1?0:Math.round(i*(rows.length-1)/(tickCount-1))));
  const marks=[0,.5,1].map(f=>`<line x1="${left}" x2="${w-right}" y1="${y(limit*f)}" y2="${y(limit*f)}" stroke="#d8e3e9"/><text class="report-axis" x="${left-10}" y="${y(limit*f)+6}" text-anchor="end">${nf(limit*f)}</text>`).join('');
  const labels=rows.map((r,i)=>ticks.has(i)?`<text class="report-axis report-time-axis" x="${x(i)}" y="${h-bottom+29}" text-anchor="${rows.length===1?'middle':i===0?'start':i===rows.length-1?'end':'middle'}">${esc(r.label.length>10?r.label.slice(5,10):w<650&&r.label.length===10?r.label.slice(5).replace('-','/'):w<650&&r.label.length===7?r.label.slice(2).replace('-','/'):r.label)}</text>${r.label.length>10?`<text class="report-axis report-time-axis" x="${x(i)}" y="${h-bottom+52}" text-anchor="${rows.length===1?'middle':i===0?'start':i===rows.length-1?'end':'middle'}">${r.label.slice(11)}</text>`:''}`:'').join('');
  let marksData='';
  if(line||soc||rows.length>48){
    marksData=keys.map((k,ki)=>`<polyline fill="none" stroke="${reportColors[k]}" stroke-width="${soc&&k==='socEnd'?3.5:2.5}" ${ki?`stroke-dasharray="${ki===1?'7 5':'2 5'}"`:''} points="${rows.map((r,i)=>`${x(i)},${y(r[k]??0)}`).join(' ')}"/>${rows.length===1?`<circle cx="${x(0)}" cy="${y(rows[0][k])}" r="5" fill="${reportColors[k]}"/>`:''}`).join('');
  }else{
    const group=plotW/rows.length*.76,bw=stack?group:group/keys.length;
    marksData=rows.map((r,i)=>{let previous=0;return keys.map((k,j)=>{const value=r[k]??0,base=stack?previous:0;previous+=value;return `<rect x="${x(i)-group/2+(stack?0:j*bw)}" y="${y(value+base)}" width="${Math.max(.3,bw-1)}" height="${Math.max(0,value/limit*plotH)}" rx="2" fill="${reportColors[k]}"><title>${esc(r.label+' '+reportNames[k]+' '+reportNumber(value)+' '+unit)}</title></rect>`;}).join('');}).join('');
  }
  return `<section class="card report-chart-card section-space"><div class="card-head"><div><h2>${title}</h2><p>單位：${unit}${rows.length>48?' · 時段較多，以折線呈現完整趨勢':''}</p></div></div><div class="report-legend">${keys.map((k,i)=>`<span><i style="${line||soc||rows.length>48?'height:0;border-top:4px '+(i===0?'solid':i===1?'dashed':'dotted')+' '+reportColors[k]:'background:'+reportColors[k]}"></i>${reportNames[k]}</span>`).join('')}</div><div class="report-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}，${rows.length} 個時間區間；完整數值可查看下方明細表"><title>${title}</title>${marks}${marksData}${labels}</svg></div><p class="help-text">${soc?'期末電量採該時段最後一筆紀錄；最高、最低包含整段時間的變化。':'每筆對應'+({hour:'一小時',day:'一天',month:'一個月',year:'一年'}[reportApplied.filters.grain])+'，完整數值見下方明細。'}</p></section>`;
}
function reportPager(pageIndex,count,action){const total=Math.max(1,Math.ceil(count/12));return `<div class="report-pager"><button data-report-action="${action}" data-step="-1" ${pageIndex===0?'disabled':''}>上一頁</button><span role="status">第 ${pageIndex+1}／${total} 頁，共 ${count} 筆</span><button data-report-action="${action}" data-step="1" ${pageIndex>=total-1?'disabled':''}>下一頁</button></div>`;}
function reportTable(r){
  const cols=reportColumns(r),rows=r.rows.slice(reportPage*12,reportPage*12+12);
  const totalValue=k=>k==='label'?'整段查詢期間':reportNumber(r.total[k]);
  return `<section class="card section-space" id="report-detail"><div class="card-head"><div><h2>統計明細</h2><p>每頁 12 筆；下載會包含全部 ${r.rows.length} 筆。小螢幕可左右滑動表格。</p></div></div><div class="table-wrap report-table" tabindex="0" aria-label="統計明細表，窄螢幕可左右捲動"><table><caption class="sr-only">${ReportData.kinds[r.filters.kind]} · ${esc(ReportData.scope(r.filters))}</caption><thead><tr>${cols.map(([,name])=>`<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(([k])=>`<td>${k==='label'?esc(row.label):reportNumber(row[k])}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr>${cols.map(([k])=>`<th scope="${k==='label'?'row':'col'}">${totalValue(k)}</th>`).join('')}</tr></tfoot></table></div>${reportPager(reportPage,r.rows.length,'page')}${r.filters.kind==='storage'?'<p class="help-text">整段期間的電量百分比採期初、最低、最高及期末值，沒有加總百分比。</p>':''}</section>`;
}
function reportEventTable(r){
  const counts=Object.keys(ReportData.causes).map(k=>({name:ReportData.causes[k].name,count:r.events.filter(e=>e.cause===k).length})).filter(x=>x.count);
  return `<section class="card section-space" id="report-events"><div class="card-head"><div><h2>異常事件明細</h2><p>每一列是一個事件；依發生時間計數。</p></div><button data-report-action="export-events" ${reportDirty()||!r.events.length?'disabled':''}>下載事件明細 CSV</button></div><div class="report-cause-list">${counts.map(c=>`<span class="pill neutral">${c.name} ${c.count} 件</span>`).join('')}</div>${r.events.length?`<div class="table-wrap report-table" tabindex="0" aria-label="異常事件明細"><table><thead><tr><th scope="col">發生時間</th><th scope="col">地點與設備</th><th scope="col">異常情形</th><th scope="col">提醒程度</th><th scope="col">處理情形</th></tr></thead><tbody>${r.events.slice(reportEventPage*12,reportEventPage*12+12).map(e=>`<tr><td>${e.date}</td><td>${ReportData.sites.find(s=>s.id===e.site).name}<br>${ReportData.assets.find(a=>a.id===e.device).name}</td><td>${ReportData.causes[e.cause].name}</td><td>${badge(ReportData.severity[e.severity],e.severity==='high'?'danger':e.severity==='warn'?'warn':'info')}</td><td>${e.status}</td></tr>`).join('')}</tbody></table></div>${reportPager(reportEventPage,r.events.length,'event-page')}`:'<div class="empty">所選時間內沒有符合條件的異常事件。統計表中的 0 代表這段時間沒有事件。</div>'}</section>`;
}
function reportResults(){
  const r=reportApplied,f=r.filters,disabled=reportDirty()||!r.rows.length;
  let html=`<section class="report-result-heading section-space" id="report-results" aria-label="已查詢的報表"><div><span class="eyebrow">已查詢結果</span><h2>${ReportData.kinds[f.kind]} · ${ReportData.grains[f.grain]}</h2><p>${esc(ReportData.scope(f))}</p><p class="help-text">${ReportData.period(r)}${r.range.partial?' · 最後一期尚未完整，只計至資料截止日':''}</p></div><div class="actions"><button class="primary" data-report-action="export" ${disabled?'disabled':''}>${icon('download')} 下載統計 CSV</button><button data-report-action="print" ${disabled?'disabled':''}>列印這頁</button></div></section>`;
  if(!r.selected.length)return html+'<section class="card empty section-space"><h2>這個範圍沒有符合的設備</h2><p>海工停車場設有太陽能；柴油發電機與儲能位於國研。請調整場域或設備種類後重新查詢。</p></section>';
  html+=`<div class="grid metrics section-space">${reportSummary(r)}</div>`;
  if(f.kind==='usage')html+=reportChart(r.rows,['usage'],{title:'各時段用電量'});
  if(f.kind==='generation')html+=reportChart(r.rows,f.type==='all'?['pv','diesel']:[f.type],{title:'各時段發電量比較'});
  if(f.kind==='storage'){
    if(f.metric!=='soc')html+=reportChart(r.rows,f.metric==='all'?['charge','discharge']:[f.metric],{title:'充入與放出的電量'});
    if(f.metric==='all'||f.metric==='soc')html+=reportChart(r.rows,['socEnd','socMin','socMax'],{title:'電池剩餘電量（SoC）變化',unit:'%',soc:true});
  }
  if(f.kind==='alarms')html+=reportChart(r.rows,['high','warn','info'],{title:'各時段異常事件數',unit:'件',stack:true});
  html+=reportTable(r);
  if(f.kind==='alarms')html+=reportEventTable(r);
  return html;
}
function renderReports(){
  if(!reportApplied)reportApplied=ReportData.query(reportDraft);
  const navigation=heading('校園能源統計報表','選擇報表、地點與時間，再查看圖表或下載明細。')+`<div class="report-tabs" role="tablist" aria-label="統計報表種類">${Object.entries(reportTabKinds).map(([id,name])=>`<button role="tab" id="report-tab-${id}" aria-controls="report-panel" aria-selected="${reportActiveTab===id}" tabindex="${reportActiveTab===id?0:-1}" data-report-action="kind" data-kind="${id}">${icon({usage:'power',generation:'sun',storage:'battery',alarms:'bell',island:'grid'}[id])}${name}</button>`).join('')}</div>`;
  if(reportActiveTab==='island')return navigation+`<div role="tabpanel" id="report-panel" aria-labelledby="report-tab-island">${renderIsland()}</div>`;
  return navigation+`<div role="tabpanel" id="report-panel" aria-labelledby="report-tab-${reportDraft.kind}">${reportForm()}${reportResults()}</div><details class="card section-space"><summary>這些示範資料如何計算？</summary><p>歷史資料固定，不隨首頁的供電情境或設備操作改變。用電依設備、空間、場域逐層加總；一度電就是 1 kWh。2026/10/6 的原四個區域合計為 8,380 度，海工停車場另計。空間及設備迴路屬示範配置。</p><p>太陽能採國研 135 kWp、海工 295 kWp 的自用系統；柴油機採國研 400 kW 設備。太陽能夜間為 0，柴油機僅在固定示範運轉時段發電；未納入躉售太陽能與未來規劃。</p><p>儲能採 3,000 度容量的教學模型，充放電暫未計入損耗。SoC 是電池剩餘比例，依每小時的充放電量推算。日、月、年報表保留各期起訖及最高、最低電量。</p><p>異常報表採固定歷史事件；同一事件只計一次，與「提醒與帳號管理」頁的示範待辦分開。所有數值皆為示範，並非校園實際量測。</p></details>`;
}
function refreshReport(focus){render();if(focus)document.getElementById(focus)?.focus({preventScroll:true});}
function markReportDirty(){const dirty=reportDirty();const note=$('#report-dirty');if(note)note.textContent=dirty?'條件已變更，請按「查詢報表」。':'';$$('[data-report-action="export"],[data-report-action="export-events"],[data-report-action="print"]').forEach(b=>b.disabled=dirty||!reportApplied?.rows.length||(b.dataset.reportAction==='export-events'&&!reportApplied.events.length));}
function reportExport(eventsOnly=false){
  if(reportDirty()||!reportApplied?.rows.length)return;
  const r=reportApplied,f=r.filters,metadata=[['中山大學雲端能源管理系統','固定歷史示範資料，非現場量測'],['報表',ReportData.kinds[f.kind]],['時間單位',ReportData.grains[f.grain]],['查詢範圍',ReportData.scope(f)],['選擇起訖',f.start+' 至 '+f.end],['實際統計期間',ReportData.period(r)],['資料截止','2026-10-06 23:59']];
  if(f.kind==='storage')metadata.push(['計算方式','充放電分別加總；SoC 採期初、期間最低、期間最高與期末百分比'],['查看項目',{all:'充電、放電與SoC',charge:'充電量',discharge:'放電量',soc:'SoC變化'}[f.metric]]);
  let rows;
  if(eventsOnly)rows=[...metadata,['事件編號','發生時間','場域','設備','設備種類','異常類型','提醒程度','處理情形'],...r.events.map(e=>[e.id,e.date,ReportData.sites.find(s=>s.id===e.site).name,ReportData.assets.find(a=>a.id===e.device).name,ReportData.types[e.type],ReportData.causes[e.cause].name,ReportData.severity[e.severity],e.status])];
  else{const cols=reportColumns(r);rows=[...metadata,cols.map(c=>c[1]),...r.rows.map(row=>cols.map(([k])=>k==='label'?row.label:ReportData.round(row[k]))),cols.map(([k])=>k==='label'?'整段查詢期間':ReportData.round(r.total[k]))];}
  exportCsv(`中山大學_${ReportData.kinds[f.kind]}_${ReportData.grains[f.grain]}_${eventsOnly?'事件明細_':''}${f.start.replaceAll(':','')}_${f.end.replaceAll(':','')}.csv`,rows);
}
document.addEventListener('input',e=>{
  if(['report-start','report-end'].includes(e.target.id)){const key=e.target.id.slice(7);reportDraft[key]=reportDraft.grain==='hour'?(e.target.value?e.target.value+'T'+$('#report-'+key+'-hour').value:''):e.target.value;reportError='';markReportDirty();}
});
document.addEventListener('change',e=>{
  if(!e.target.closest('#report-form')||!e.target.id.startsWith('report-'))return;
  let key=e.target.id.slice(7);if(key.endsWith('-hour')){key=key.replace('-hour','');reportDraft[key]=$('#report-'+key).value?$('#report-'+key).value+'T'+e.target.value:'';}else reportDraft[key]=reportDraft.grain==='hour'&&['start','end'].includes(key)?(e.target.value?e.target.value+'T'+$('#report-'+key+'-hour').value:''):e.target.value;reportError='';
  if(key==='start'||key==='end'){const error=$('#report-error');if(error)error.textContent='';markReportDirty();return;}
  if(key==='grain'){const d=ReportData.defaults(reportDraft.kind,reportDraft.grain);reportDraft.start=d.start;reportDraft.end=d.end;}
  if(key==='site'){reportDraft.space='all';reportDraft.device='all';}
  if(key==='space')reportDraft.device='all';
  if(key==='type'){reportDraft.device='all';reportDraft.cause='all';}
  refreshReport(e.target.id);
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='report-form')return;e.preventDefault();
  try{reportApplied=ReportData.query(reportDraft);reportPage=0;reportEventPage=0;reportError='';refreshReport();toast('已更新'+ReportData.kinds[reportDraft.kind]+'，共 '+reportApplied.rows.length+' 個時間區間。');}
  catch(error){reportError=error.message;refreshReport();$('#report-error')?.scrollIntoView({block:'center'});}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-report-action]');if(!b||b.disabled)return;
  const action=b.dataset.reportAction;
  if(action==='kind'){reportActiveTab=b.dataset.kind;if(reportActiveTab==='island'){refreshReport('report-tab-island');return;}reportDraft=ReportData.defaults(b.dataset.kind,reportDraft.grain);reportApplied=ReportData.query(reportDraft);reportError='';reportPage=0;reportEventPage=0;refreshReport('report-tab-'+reportDraft.kind);}
  if(action==='reset'){reportDraft=ReportData.defaults(reportDraft.kind);reportApplied=ReportData.query(reportDraft);reportError='';reportPage=0;reportEventPage=0;refreshReport();}
  if(action==='export')reportExport();if(action==='export-events')reportExport(true);
  if(action==='print'&&!reportDirty())window.print();
  if(action==='page'||action==='event-page'){const field=action==='page'?'rows':'events',current=action==='page'?reportPage:reportEventPage,value=Math.max(0,Math.min(Math.ceil(reportApplied[field].length/12)-1,current+Number(b.dataset.step)));if(action==='page')reportPage=value;else reportEventPage=value;refreshReport();document.getElementById(action==='page'?'report-detail':'report-events')?.scrollIntoView({block:'start'});}
});
document.addEventListener('keydown',e=>{
  const tab=e.target.closest('[data-report-action="kind"]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();e.stopImmediatePropagation();const keys=Object.keys(reportTabKinds),i=keys.indexOf(tab.dataset.kind),next=e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowRight'?1:keys.length-1))%keys.length;
  document.querySelector(`[data-report-action="kind"][data-kind="${keys[next]}"]`).click();
});
