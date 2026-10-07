"""SOC/contract setup, read-only simulation, removed module, and equipment-only overview."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'.qa';out.mkdir(exist_ok=True);checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1050},reduced_motion='reduce')
    p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto('http://127.0.0.1:8793',wait_until='networkidle');p.locator('#main h1').wait_for()
    def nav(route):
        p.locator('#nav a[href="#'+route+'"]').click();p.wait_for_function('(r)=>page===r',arg=route)
    def fill(values):
        for id,value in values.items():p.fill('#'+id,str(value))
    def save():p.locator('#settings-form [type=submit]').click()
    def state():return p.evaluate('JSON.stringify(state.energySettings)')
    def simulate(mode='grid',soc=72,demand=950):
        p.select_option('#trial-mode',mode);p.fill('#trial-soc',str(soc))
        if mode=='grid':p.fill('#trial-demand',str(demand))
        return p.locator('#energy-trial-result').inner_text()
    assert p.locator('#nav a').count()==5
    assert '設備與使用時間' not in p.locator('body').inner_text()
    assert '二樓教室仍在用電' not in p.locator('#main').inner_text()
    assert '一處水表較晚回報資料' not in p.locator('#main').inner_text()
    assert 'PCS 暫時沒有回報資料' in p.locator('#main').inner_text()
    assert p.evaluate('equipmentAlerts().every(a=>a.category==="equipment"&&a.status!=="done")')
    p.evaluate("state.alerts.find(a=>a.id==='mg-pcs-01').status='working';render()")
    assert p.locator('[data-action=alert][data-id=mg-pcs-01]').count()==1
    p.evaluate("state.alerts.forEach(a=>a.status='done');render()")
    assert '目前沒有待確認的微電網設備異常' in p.locator('#main').inner_text()
    p.evaluate("state.alerts=structuredClone(DEMO.alerts);location.hash='devices'")
    p.wait_for_function("page==='overview'")
    assert p.locator('#nav a[aria-current=page]').get_attribute('href')=='#overview'
    before=p.evaluate('JSON.stringify(state)')
    p.evaluate("for(const action of ['device-toggle','device-detail','schedule-add','schedule-edit','schedule-toggle','schedule-delete'])handleAction(action,'ac1')")
    assert p.evaluate('JSON.stringify(state)')==before
    assert not p.locator('#dialog').is_visible()
    nav('safety');assert '二樓教室仍在用電' not in p.locator('#main').inner_text()
    checks.append('設備與使用時間入口、頁面及操作已移除；總覽只顯示未恢復設備／通訊異常，空狀態與計數一致')
    nav('strategy');assert '像手機的電量百分比' in p.locator('#main').inner_text()
    assert p.input_value('#grid-min')=='30' and p.input_value('#grid-max')=='80'
    assert p.input_value('#island-min')=='10' and p.input_value('#island-max')=='95'
    assert '900 kW' in p.locator('#energy-demand-formula').inner_text()
    before=state();fill({'contract-capacity':1251,'demand-percent':83})
    assert '1,038.33 kW' in p.locator('#energy-demand-formula').inner_text()
    assert state()==before and '尚未儲存' in p.locator('#energy-dirty').inner_text()
    p.locator('[data-action=discard-energy]').click();assert p.input_value('#contract-capacity')=='1000'
    fill({'grid-min':25,'grid-max':85,'island-min':10,'island-max':95,'contract-capacity':1250,'demand-percent':80})
    save();assert '1,000 kW' in p.locator('#dialog').inner_text();assert state()==before
    p.locator('[data-action=close]').first.click();assert state()==before
    save();p.locator('[data-action=confirm]').click();p.locator('[data-action=close]').click()
    assert p.evaluate('state.energySettings.contractKw')==1250
    assert '併聯 SoC 25%～85%' in p.evaluate('state.logs[0].text')
    p.reload(wait_until='networkidle');assert p.input_value('#grid-min')=='25' and p.input_value('#demand-percent')=='80'
    checks.append('六項設定、精確門檻試算、放棄變更、確認前不寫入、儲存紀錄及重新載入保留設定')
    for id,value,word in [('grid-min','85','下限必須'),('island-min','25','停電下限'),('island-max','85','停電上限'),('contract-capacity','','不能留白'),('contract-capacity','0','大於 0'),('demand-percent','101','1% 到 100%')]:
        before=state();p.fill('#'+id,value);save();assert word in p.locator('#settings-error').inner_text()
        assert p.locator('#settings-error').evaluate('(e)=>e===document.activeElement')
        p.locator('#settings-error a').first.click();assert p.evaluate('page')=='strategy'
        assert not p.locator('#dialog').is_visible() and state()==before
        p.locator('[data-action=discard-energy]').click()
    checks.append('下限小於上限、孤島範圍較寬、必填與數字界限均檢查；錯誤可鍵盤定位且不離開設定頁')
    p.locator('.energy-trial summary').click()
    assert '尚未到門檻' in simulate(demand=999.99)
    assert '符合啟動儲能' in simulate(demand=1000)
    assert '電量已到下限' in simulate(soc=25,demand=1300)
    assert '停止繼續充電' in simulate(soc=85)
    assert '可繼續支援' in simulate(mode='island',soc=20)
    assert '不使用契約需量門檻' in p.locator('#energy-trial-result').inner_text()
    assert '電量已到下限' in simulate(mode='island',soc=10)
    assert '停止繼續充電' in simulate(mode='island',soc=95)
    p.locator('[data-action=policy][data-id=backup]').click();p.locator('[data-action=confirm]').click();p.locator('[data-action=close]').click()
    assert p.evaluate('state.energySettings.gridMin')==25
    p.locator('.energy-trial summary').click();assert '不啟動平常需量支援' in simulate(demand=1400)
    assert '可繼續支援' in simulate(mode='island',soc=20)
    checks.append('需量等於門檻即可符合啟動條件；兩組 SoC 上下限、停電門檻不適用及防災策略試算正確')
    # An in-flight confirmation cannot change settings after switching demo roles.
    p.fill('#contract-capacity','1500');save();before=state()
    p.evaluate("handleAction('switch-role','u3');handleAction('confirm')")
    assert state()==before
    assert all(p.locator('#'+id).is_disabled() for id in ['grid-min','grid-max','island-min','island-max','contract-capacity','demand-percent'])
    assert p.locator('#settings-form [type=submit]').is_disabled()
    p.locator('.energy-trial summary').click();simulate(mode='island',soc=40);assert state()==before
    p.locator('[data-action=role]').click();p.locator('[data-action=switch-role][data-id=u2]').click()
    p.select_option('#scenario','offline');assert p.locator('#settings-form [type=submit]').is_disabled()
    p.select_option('#scenario','outage');assert p.locator('#settings-form [type=submit]').is_disabled()
    p.select_option('#scenario','normal');assert p.locator('#settings-form [type=submit]').is_enabled()
    checks.append('數據管理員只能閱讀與獨立試算；能源管理員可儲存，斷線或停電時禁止送出；換角色取消確認')
    p.locator('#toast').wait_for(state='hidden');p.screenshot(path=str(out/'settings-desktop.png'),full_page=True)
    p.locator('[data-action=font]').click()
    for width in [1440,1024,768,375]:
        p.set_viewport_size({'width':width,'height':1000});p.wait_for_timeout(200)
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
        for id in ['grid-min','grid-max','island-min','island-max','contract-capacity','demand-percent']:
            r=p.locator('#'+id).bounding_box();assert r['x']>=0 and r['x']+r['width']<=width+1,(width,id)
        if width==375:
            p.locator('#energy-demand-formula').scroll_into_view_if_needed();p.screenshot(path=str(out/'settings-mobile-demand.png'))
            p.locator('.energy-fieldset').nth(1).scroll_into_view_if_needed();p.screenshot(path=str(out/'settings-mobile-soc.png'))
    # Upgrade an old browser snapshot without dropping user accounts or reminders.
    p.evaluate("state.accounts.push({id:'saved-user',name:'保留的示範帳號',role:'viewer',active:true});delete state.energySettings;state.reserve=80;state.threshold=700;state.alerts.forEach(a=>delete a.category);persist()")
    p.reload(wait_until='networkidle');assert p.evaluate('state.accounts.some(a=>a.id==="saved-user")')
    assert p.evaluate('state.energySettings.gridMin')==30
    assert p.evaluate('state.alerts.find(a=>a.id==="mg-pcs-01").category')=='equipment'
    assert p.evaluate('state.devices===undefined&&state.schedules===undefined')
    assert not errors,errors
    checks.append('四種螢幕寬度與 24px 大字版面，舊示範資料升級保留帳號及提醒')
    result={'status':'passed','checks':checks,'page_errors':errors};(out/'settings-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False));browser.close()
