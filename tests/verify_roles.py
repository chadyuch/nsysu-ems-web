"""Exercise the three demo roles through UI and the guarded operation handlers."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.qa';OUT.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True,reduced_motion='reduce')
    # Captures callbacks for permission unit checks; does not certify native WebMCP support.
    ctx.add_init_script("""window.demoTestTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.demoTestTools[t.name]=t;}}});""")
    p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto('http://127.0.0.1:8793',wait_until='networkidle')
    p.locator('[data-action=role]').wait_for(state='visible')
    def nav(route):
        p.locator('#nav a[href="#'+route+'"]').click()
        p.wait_for_function('(route)=>page===route',arg=route)
    def switch(id):
        p.locator('[data-action=role]').click()
        p.locator('[data-action=switch-role][data-id='+id+']').click()
    def snapshot():
        return p.evaluate('JSON.stringify({scenario:state.scenario,policy:state.policy,energySettings:state.energySettings,alerts:state.alerts,accounts:state.accounts,logs:state.logs})')
    def submit_fake(id,values,record=''):
        p.evaluate('''({id,values,record})=>{const form=document.createElement('form');form.id=id;form.dataset.id=record;for(const [key,value] of Object.entries(values)){const input=document.createElement('input');input.name=key;input.value=value;form.append(input);}document.body.append(form);form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.remove();}''',{'id':id,'values':values,'record':record})
    def confirm():
        p.locator('[data-action=confirm]').click();p.locator('[data-action=close]').click()
    def denied_actions(actions):
        before=snapshot()
        for action,id in actions:
            p.evaluate('([a,id])=>handleAction(a,id)',[action,id])
            assert snapshot()==before,action
            assert not p.locator('#dialog').is_visible(),action

    switch('u3')
    assert p.locator('#current-role').inner_text()=='數據管理員'
    assert p.locator('#scenario').is_disabled()
    assert p.locator('[data-action=reset]').first.is_disabled()
    before=snapshot()
    p.evaluate("document.querySelector('#scenario').value='outage';document.querySelector('#scenario').dispatchEvent(new Event('change',{bubbles:true}))")
    assert snapshot()==before and p.input_value('#scenario')=='normal'
    result=p.evaluate("(()=>{try{demoTestTools.set_energy_demo_scenario.execute({scenario:'outage'});return ''}catch(e){return e.message}})()")
    assert '只能查看' in result and snapshot()==before
    assert p.evaluate('demoTestTools.read_energy_demo_status.execute().role')=='數據管理員'
    # A stale or forged cached role must not grant authority over the active account.
    assert p.evaluate("state.role='admin';permission('admin')") is False
    p.evaluate('render()')
    denied_actions([('policy','saving'),('account-add',''),('account-edit','u2'),('account-toggle','u2'),('reset',''),('reset-confirm','')])
    for id,values,record in [
        ('settings-form',{'gridMin':'20','gridMax':'90','islandMin':'10','islandMax':'95','contractKw':'1000','triggerPct':'90'},''),
        ('alert-form',{'note':'不應寫入'},'mg-battery-01'),
        ('account-form',{'name':'不應建立','role':'admin'},'')]:
        before=snapshot();submit_fake(id,values,record);assert snapshot()==before,id
    nav('strategy')
    assert all(p.locator('#'+id).is_disabled() for id in ['grid-min','grid-max','island-min','island-max','contract-capacity','demand-percent'])
    assert all(b.is_disabled() for b in p.locator('[data-action=policy]').all())
    nav('safety');p.locator('[data-action=alert][data-id=mg-battery-01]').click()
    assert p.locator('#alert-note').is_disabled();p.locator('[data-action=close]').click()
    for tab in ['accounts','security']:
        p.locator('[data-action=safety-tab][data-id='+tab+']').click()
        if tab=='accounts':assert p.locator('[data-action=account-add]').count()==0
    with p.expect_download() as d:p.locator('[data-action=export-logs]').click()
    assert d.value.failure() is None
    checks.append('數據管理員：設定、提醒、帳號、情境與重設均禁止，操作處理與工具回呼再次檢查權限')

    # All five reports remain usable without mutating operational state.
    before=snapshot();nav('analysis')
    for kind in ['usage','generation','storage','alarms','island']:
        p.locator('[data-kind='+kind+']').click()
        if kind=='island':
            p.fill('#island-from','2026/09/29');p.fill('#island-to','2026/09/29')
            p.locator('#island-filter [type=submit]').click()
            assert p.locator('[data-island-action=event]').count()==1
            action='[data-island-action=export-data]'
        else:
            p.locator('#report-form [type=submit]').click()
            action='[data-report-action=export]'
        with p.expect_download() as d:p.locator(action).click()
        assert d.value.failure() is None
    assert snapshot()==before
    p.locator('[data-action=font]').click()
    assert p.evaluate('state.large') is True
    checks.append('數據管理員：五類報表均可查詢匯出，查詢不改變操作資料，字體可放大')

    switch('u2');assert p.locator('#current-role').inner_text()=='能源管理員'
    accounts=p.evaluate('JSON.stringify(state.accounts)')
    denied_actions([('account-add',''),('account-edit','u3'),('account-toggle','u3')])
    before=snapshot();submit_fake('account-form',{'name':'禁止帳號','role':'admin'});assert snapshot()==before
    nav('safety');p.locator('[data-action=safety-tab][data-id=accounts]').click()
    assert p.locator('[data-action=account-add]').count()==0
    assert '能源管理員' in p.locator('#main').inner_text()
    nav('strategy');p.select_option('#scenario','peak');assert p.evaluate('state.scenario')=='peak'
    p.select_option('#scenario','normal')
    p.locator('[data-action=policy][data-id=saving]').click();confirm();assert p.evaluate('state.policy')=='saving'
    p.fill('#contract-capacity','1250');p.fill('#demand-percent','80');p.locator('#settings-form [type=submit]').click();confirm()
    assert p.evaluate('state.energySettings.contractKw===1250&&state.energySettings.triggerPct===80') is True
    nav('safety');p.locator('[data-action=safety-tab][data-id=alerts]').click();p.locator('[data-action=alert][data-id=mg-battery-01]').click()
    p.fill('#alert-note','能源管理員已安排檢查。');p.locator('#alert-form button').click()
    assert p.evaluate('state.alerts[0].status')=='working'
    logs=p.evaluate('state.logs.length')
    p.locator('[data-action=reset]').first.click();assert '帳號' in p.locator('#dialog').inner_text();p.locator('[data-action=reset-confirm]').click()
    assert p.evaluate('JSON.stringify(state.accounts)')==accounts
    assert p.evaluate('state.userId')=='u2' and p.evaluate('state.role')=='operator'
    assert p.evaluate('state.logs.length')==logs+1
    assert p.evaluate('state.energySettings.contractKw')==1000 and p.evaluate('state.alerts[0].status')=='new'
    checks.append('能源管理員：可操作供電設定與提醒；帳號寫入被拒絕，重設保留帳號、權限、身分及操作紀錄')

    switch('u1');nav('safety');p.locator('[data-action=safety-tab][data-id=accounts]').click()
    assert p.locator('#current-role').inner_text()=='系統管理員'
    p.locator('[data-action=account-add]').click()
    assert p.locator('#account-role option').all_text_contents()==['系統管理員','數據管理員','能源管理員']
    assert p.input_value('#account-role')=='viewer'
    p.fill('#account-name','許資料管理員');p.select_option('#account-role','viewer');p.locator('#account-form button').click()
    uid=p.evaluate('state.accounts.at(-1).id')
    p.locator('[data-action=account-edit][data-id='+uid+']').click();p.select_option('#account-role','operator');p.locator('#account-form button').click()
    assert p.evaluate('state.accounts.at(-1).role')=='operator'
    p.locator('[data-action=account-toggle][data-id='+uid+']').click();confirm();assert not p.evaluate('state.accounts.at(-1).active')
    p.locator('[data-action=account-toggle][data-id='+uid+']').click();confirm();assert p.evaluate('state.accounts.at(-1).active')
    checks.append('系統管理員：可新增、修改角色、停用及恢復帳號，三種角色名稱一致')

    # Old dialogs cannot survive dismissal or a different actor taking over.
    nav('strategy');before=snapshot();p.locator('[data-action=policy][data-id=saving]').click();p.keyboard.press('Escape')
    assert p.evaluate('pending') is None;p.evaluate("handleAction('confirm')");assert snapshot()==before
    p.locator('[data-action=policy][data-id=saving]').click();p.evaluate("handleAction('switch-role','u2');handleAction('confirm')");assert snapshot()==before
    p.locator('[data-action=policy][data-id=saving]').click();p.evaluate("state.userId='u1';handleAction('confirm')");assert snapshot()==before
    p.keyboard.press('Escape');p.evaluate('render()')
    # A disabled or missing account can never fall back to the system administrator.
    saved=p.evaluate("localStorage.getItem('nsysu-energy-demo-v1')")
    for id in ['missing','u2']:
        p.evaluate("(id)=>{state.userId=id;if(id==='u2')state.accounts.find(u=>u.id==='u2').active=false;persist()}",id)
        p.reload(wait_until='networkidle');assert p.evaluate('permission()||permission("admin")') is False
        assert p.locator('#current-role').inner_text()=='數據管理員'
        assert '沒有有效' in p.locator('.role-status').inner_text()
    p.evaluate("(saved)=>localStorage.setItem('nsysu-energy-demo-v1',saved)",saved);p.reload(wait_until='networkidle')
    switch('u1');p.locator('[data-action=reset]').first.click();p.locator('[data-action=reset-confirm]').click()
    assert p.evaluate('state.accounts.length')==3
    checks.append('關閉確認窗、換角色、帳號失效皆不會執行舊操作或自動取得管理權限；系統管理員可完整重設')

    # Inspect role explanations and picker at desktop and mobile enlarged text.
    p.locator('[data-action=font]').click()
    for width in [1440,768,375]:
        p.set_viewport_size({'width':width,'height':1000})
        for id in ['u1','u2','u3']:
            switch(id);nav('safety');p.locator('[data-action=safety-tab][data-id=accounts]').click()
            p.wait_for_timeout(180)
            assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,id)
            p.locator('[data-action=role]').click()
            assert p.locator('#dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),(width,id)
            if width==375 and id=='u3':p.screenshot(path=str(OUT/'roles-mobile-picker.png'))
            p.locator('[data-action=close]').click()
            if width==1440 and id=='u2':p.screenshot(path=str(OUT/'roles-desktop.png'),full_page=True)
        if width==375:
            p.locator('.role-status').scroll_into_view_if_needed();p.screenshot(path=str(OUT/'roles-mobile.png'))
    assert not errors,errors
    checks.append('三角色說明與展示切換器在桌面、平板及手機大字模式可完整閱讀')
    result={'status':'passed','checks':checks,'page_errors':errors,'tool_callback_testing':'stubbed registration; native WebMCP compatibility not asserted'}
    (OUT/'roles-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False));browser.close()
