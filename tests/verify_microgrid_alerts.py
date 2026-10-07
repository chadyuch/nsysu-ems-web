from pathlib import Path
import csv,io,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'.qa';out.mkdir(exist_ok=True);checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True,reduced_motion='reduce')
    p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto('http://127.0.0.1:8793',wait_until='networkidle');p.locator('#main h1').wait_for()
    def nav(route):
        p.locator('#nav a[href="#'+route+'"]').click();p.wait_for_function('(r)=>page===r',arg=route)
    def download(selector):
        with p.expect_download() as d:p.locator(selector).click()
        dest=out/d.value.suggested_filename;d.value.save_as(dest)
        return list(csv.reader(io.StringIO(dest.read_text(encoding='utf-8-sig'))))
    assert p.evaluate('microgridAlerts().length')==4
    assert p.evaluate('equipmentAlerts().length')==3
    assert set(p.evaluate('microgridAlerts().map(a=>alertDevice(a).type)'))=={'storage','pcs','pv','diesel'}
    assert 'PCS 暫時沒有回報資料' in p.locator('#main').inner_text()
    nav('safety');assert p.locator('.alert-item').count()==4
    assert '教室' not in p.locator('#main').inner_text() and '水表' not in p.locator('#main').inner_text()
    data=download('[data-action=export-alerts]')
    assert data[0][2:4]==['設備名稱','設備種類']
    assert len(data)==5 and any('PCS' in row[2] for row in data[1:])
    p.locator('[data-action=alert][data-id=mg-pcs-01]').click()
    assert '幫電池轉換電力' in p.locator('#dialog').inner_text()
    p.fill('#alert-note','已安排人員檢查 PCS 的通訊線路。');p.locator('#alert-form button').click()
    p.select_option('#alert-filter','working');assert p.locator('.alert-item').count()==1
    assert len(download('[data-action=export-alerts]'))==2
    p.reload(wait_until='networkidle');assert p.evaluate('state.alerts.find(a=>a.id==="mg-pcs-01").note')=='已安排人員檢查 PCS 的通訊線路。'
    checks.append('四種微電網設備提醒、設備名稱與種類、狀態篩選、CSV 匯出及處理紀錄保存')

    # Legacy unrelated data is removed on load, while relevant records/configuration survive.
    p.evaluate("""state.accounts.push({id:'keep-user',name:'保留帳號',role:'viewer',active:true});state.energySettings.contractKw=1500;state.alerts.push(
      {id:'a1',device:'ac2',category:'usage',title:'二樓教室仍在用電',place:'管理學院',status:'new',note:'舊教室紀錄'},
      {id:'a2',device:null,category:'equipment',title:'一處水表較晚回報資料',place:'社科院',status:'new',note:''},
      {id:'a3',device:null,category:'equipment',title:'電池室溫度曾經偏高',place:'國研儲能區',level:'info',time:'10:42',status:'done',note:'舊儲能處理紀錄'});persist();""")
    p.reload(wait_until='networkidle')
    assert p.evaluate('state.alerts.every(a=>!!alertDevice(a))')
    assert p.evaluate('state.alerts.some(a=>a.id==="a1"||a.id==="a2")') is False
    assert p.evaluate('state.alerts.find(a=>a.id==="a3").note')=='舊儲能處理紀錄'
    assert p.evaluate('state.alerts.find(a=>a.id==="mg-pcs-01").status')=='working'
    assert p.evaluate('state.energySettings.contractKw')==1500
    assert p.evaluate('state.accounts.some(a=>a.id==="keep-user")')
    # Filters guard every entry point even if an unrelated record is injected after load.
    p.evaluate("state.alerts.push({id:'water-test',device:'wm1',category:'equipment',title:'不應出現的水表提醒',status:'new',note:''});render()")
    assert '不應出現' not in p.locator('#main').inner_text()
    assert not any('不應出現' in ','.join(r) for r in download('[data-action=export-alerts]'))
    p.evaluate("handleAction('alert','water-test')");assert not p.locator('#dialog').is_visible()
    p.evaluate("""const f=document.createElement('form');f.id='alert-form';f.dataset.id='water-test';f.innerHTML='<textarea name="note">不應寫入</textarea>';document.body.append(f);f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.remove();""")
    assert p.evaluate('state.alerts.find(a=>a.id==="water-test").note')==''
    nav('overview');assert '不應出現' not in p.locator('#main').inner_text()
    assert p.evaluate('equipmentAlerts().length')==3
    checks.append('舊教室／水表提醒載入即排除；微電網處理紀錄、帳號與設定保留；總覽、詳細資料、寫入及匯出均有範圍檢查')

    nav('analysis');p.locator('[data-kind=alarms]').click()
    assert set(p.locator('#report-type option').evaluate_all('(els)=>els.map(e=>e.value)'))=={'all','pv','storage','pcs','diesel'}
    assert set(p.locator('#report-site option').evaluate_all('(els)=>els.map(e=>e.value)'))=={'all','research','marine'}
    p.select_option('#report-type','pcs');p.select_option('#report-grain','year');p.locator('#report-form [type=submit]').click()
    events=p.evaluate('reportApplied.events');assert events and all(e['type']=='pcs' and e['device']=='pcs-research' for e in events)
    rows=download('[data-report-action=export-events]');idx=next(i for i,r in enumerate(rows) if r and r[0]=='事件編號')
    assert len(rows[idx+1:])==len(events) and all('PCS' in r[3] for r in rows[idx+1:])
    p.locator('[data-kind=generation]').click()
    assert set(p.locator('#report-type option').evaluate_all('(els)=>els.map(e=>e.value)'))=={'all','pv','diesel'}
    checks.append('告警報表只含微電網場域與設備，PCS 可獨立查詢與匯出，發電量報表維持太陽能／柴油機')

    nav('safety');p.locator('#toast').wait_for(state='hidden');p.screenshot(path=str(out/'microgrid-alerts-desktop.png'),full_page=True)
    p.locator('[data-action=font]').click()
    for width in [768,375]:
        p.set_viewport_size({'width':width,'height':1000});p.wait_for_timeout(180)
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    p.locator('.alert-item').nth(1).scroll_into_view_if_needed();p.screenshot(path=str(out/'microgrid-alerts-mobile.png'))
    assert not errors,errors
    result={'status':'passed','checks':checks,'page_errors':errors};(out/'microgrid-alerts-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False));browser.close()
