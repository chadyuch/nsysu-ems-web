(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnergySettings=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const defaults=()=>({gridMin:30,gridMax:80,islandMin:10,islandMax:95,contractKw:1000,triggerPct:90});
  const keys=Object.keys(defaults());
  function validate(raw){
    const values={},errors={};
    for(const key of keys){
      const v=raw?.[key];values[key]=v===null||v===undefined||String(v).trim()===''?NaN:Number(v);
      if(!Number.isFinite(values[key]))errors[key]='請填寫有效的數字，不能留白。';
      else if(!Number.isSafeInteger(values[key]))errors[key]='請填寫整數。';
      else if(key==='contractKw'&&values[key]<=0)errors[key]='契約容量必須大於 0 kW。';
      else if(key==='triggerPct'&&(values[key]<1||values[key]>100))errors[key]='請填寫 1% 到 100% 之間的百分比。';
      else if(key!=='contractKw'&&key!=='triggerPct'&&(values[key]<10||values[key]>95))errors[key]='本示範可設定 10% 到 95%；正式範圍須依現場核定。';
    }
    if(!errors.gridMin&&!errors.gridMax&&values.gridMin>=values.gridMax)errors.gridMin='平常供電下限必須比充電上限低。';
    if(!errors.islandMin&&!errors.islandMax&&values.islandMin>=values.islandMax)errors.islandMin='停電供電下限必須比充電上限低。';
    if(!errors.islandMin&&!errors.gridMin&&values.islandMin>=values.gridMin)errors.islandMin='停電下限要比平常下限低，才能多用一些備用電。';
    if(!errors.islandMax&&!errors.gridMax&&values.islandMax<=values.gridMax)errors.islandMax='停電上限要比平常上限高，讓有電可充時能多存一些。';
    return {valid:Object.keys(errors).length===0,values,errors};
  }
  const threshold=c=>Math.round(c.contractKw*c.triggerPct)/100;
  const restore=raw=>{const r=validate(raw);return r.valid?r.values:defaults();};
  function evaluate(config,{mode='grid',soc=72,demand=950,policy='balanced'}={}){
    const checked=validate(config);if(!checked.valid)throw Error('設定尚未完整。');
    if(!['grid','island'].includes(mode)||!Number.isFinite(soc)||soc<0||soc>100||!Number.isFinite(demand)||demand<0)throw Error('試算數值不正確。');
    const c=checked.values,min=mode==='island'?c.islandMin:c.gridMin,max=mode==='island'?c.islandMax:c.gridMax;
    const reached=demand>=threshold(c);let code,title,detail;
    if(soc<=min){code='reserve';title='電量已到下限，停止由電池供電';detail=mode==='island'?'交由現場安排柴油機等備用電源。':'保留這些電量，先由台電及其他電源供電。';}
    else if(mode==='island'){code='island';title='停電備援：電池可繼續支援重要用電';detail='孤島時不看契約需量門檻，改依停電電量範圍與現場供電需要運作。';}
    else if(policy==='backup'){code='backup';title='目前優先保留備用電，不啟動平常需量支援';detail='停電時仍依孤島電量範圍支援；契約容量與門檻設定會保留。';}
    else if(reached){code='start';title='已達門檻，符合啟動儲能供電條件';detail='即時需量大於或等於啟動門檻，且電池仍高於供電下限；實際供電功率由現場依設備狀況決定。';}
    else{code='wait';title='尚未到門檻，電池先待命';detail='需量達到設定門檻，且電池有足夠電量時，才請電池幫忙。';}
    return {code,title,detail,min,max,threshold:threshold(c),reached,canDischarge:soc>min,canCharge:soc<max,charging:soc>=max?'已達充電上限，停止繼續充電':'尚未到充電上限，有電可充時可繼續儲存'};
  }
  return {defaults,keys,validate,threshold,restore,evaluate};
});
