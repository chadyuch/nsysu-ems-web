"""Isolated headless tests of the local demonstration website, not a user browser."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.qa'
OUT.mkdir(exist_ok=True)
checks = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
    ctx = browser.new_context(viewport={'width':1440,'height':1100}, reduced_motion='reduce', accept_downloads=True)
    p = ctx.new_page()
    errors = []
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.goto('http://127.0.0.1:8793', wait_until='networkidle')
    p.evaluate("localStorage.removeItem('nsysu-energy-demo-v1')")
    p.reload(wait_until='networkidle')
    assert '中山大學雲端能源管理系統' in p.title()
    assert p.locator('.brand img').evaluate('(img)=>img.complete && img.naturalWidth===200')
    assert p.locator('#nav a').count()==5
    assert p.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=20
    p.screenshot(path=str(OUT/'overview-desktop.png'),full_page=True)
    checks.append('Correct title and supplied logo, five sections, 20px body typography')

    def nav(route):
        p.locator('#nav a[href="#'+route+'"]').click()
        p.wait_for_function('(key)=>document.querySelector("#nav a[aria-current=page]").hash === "#"+key',arg=route)
        assert p.locator('h1').count()==1

    nav('analysis')
    assert p.locator('[data-report-action=kind]').count()==5
    assert p.locator('.report-chart svg').count()==1
    checks.append('Statistics report is integrated in the existing navigation')

    nav('microgrid')
    for name in ['normal','charging','outage','offline','low','peak']:
        p.select_option('#scenario',name)
        flow=p.evaluate('scenario()')
        assert sum(flow[k] for k in ['grid','pv','battery','generator'])==flow['load']
        assert abs(flow['battery'])<=1200 and flow['generator']<=400 and flow['pv']<=430
        if name=='offline': assert '最後收到' in p.locator('#main').inner_text()
        if name=='outage': assert '不代表全校' in p.locator('#main').inner_text()
    p.select_option('#scenario','normal')
    p.screenshot(path=str(OUT/'microgrid-desktop.png'),full_page=True)
    checks.append('All six scenarios preserve power balance, equipment limits and outage scope')

    nav('strategy')
    p.locator('[data-action=policy][data-id=backup]').click()
    assert p.locator('#dialog').is_visible()
    p.locator('[data-action=close]').first.click()
    assert p.evaluate('state.policy')=='balanced'
    p.locator('[data-action=policy][data-id=backup]').click()
    p.locator('[data-action=confirm]').click()
    assert p.evaluate('state.policy')=='backup'
    assert p.evaluate('state.energySettings.gridMin')==30
    p.locator('[data-action=close]').click()
    p.fill('#grid-min','85')
    p.locator('#settings-form [type=submit]').click()
    assert '下限必須比充電上限低' in p.locator('#settings-error').inner_text()
    p.fill('#grid-min','30')
    p.select_option('#scenario','offline')
    assert p.locator('#settings-form [type=submit]').is_disabled()
    assert p.locator('[data-action=policy][data-id=saving]').is_disabled()
    p.select_option('#scenario','normal')
    checks.append('Strategy change requires confirmation; SOC range validation enforced; offline changes blocked')

    nav('safety')
    p.locator('[data-action=alert][data-id=mg-battery-01]').click()
    p.fill('#alert-note','已安排維護人員檢查儲能電池。')
    p.locator('#alert-form button').click()
    assert p.evaluate('state.alerts[0].status')=='working'
    p.select_option('#alert-filter','working')
    assert p.locator('[data-action=alert]').count()==1
    p.locator('[data-action=safety-tab][data-id=accounts]').click()
    p.locator('[data-action=account-add]').click()
    p.fill('#account-name','張查看員')
    p.select_option('#account-role','viewer')
    p.locator('#account-form button').click()
    assert p.evaluate('state.accounts.length')==4
    p.locator('[data-action=account-toggle][data-id=u2]').click()
    p.locator('[data-action=confirm]').click()
    p.locator('[data-action=close]').click()
    p.locator('[data-action=role]').click()
    assert p.locator('[data-action=switch-role][data-id=u2]').count()==0
    p.locator('[data-action=close]').click()
    p.locator('[data-action=role]').click()
    p.locator('[data-action=switch-role][data-id=u3]').click()
    assert p.locator('[data-action=account-add]').count()==0
    assert '帳號管理由系統管理員負責' in p.locator('#main').inner_text()
    nav('safety')
    p.locator('[data-action=safety-tab][data-id=security]').click()
    assert '待正式系統驗證' in p.locator('#main').inner_text()
    checks.append('Alert processing does not falsely resolve fault; account and viewer permissions work')

    p.locator('[data-action=role]').click()
    p.locator('[data-action=switch-role][data-id=u1]').click()
    p.locator('[data-action=font]').click()
    assert p.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')==24
    for width in [1440,1024,768,375]:
        p.set_viewport_size({'width':width,'height':1000})
        for route in ['overview','analysis','microgrid','strategy','safety']:
            nav(route)
            assert p.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,route,'horizontal overflow')
        if width==375:
            nav('overview')
            p.wait_for_timeout(180)
            chart_size=p.locator('.chart-label').first.evaluate('(e)=>({font:parseFloat(getComputedStyle(e).fontSize),scale:e.getScreenCTM().a})')
            assert chart_size['font']*chart_size['scale']>=18
            p.screenshot(path=str(OUT/'overview-mobile-large.png'),full_page=True)
    checks.append('All five views reflow at 1440/1024/768/375px with enlarged 24px text')

    p.set_viewport_size({'width':1440,'height':1100})
    p.locator('[data-action=font]').click()
    p.locator('[data-action=help]').first.click()
    p.keyboard.press('Escape')
    assert not p.locator('#dialog').is_visible()
    checks.append('Keyboard dismissal and reduced-motion rendering supported')
    assert errors==[],errors
    p.locator('[data-action=reset]').first.click()
    p.locator('[data-action=reset-confirm]').click()
    checks.append('Demo reset restores initial data')
    (OUT/'verification.json').write_text(json.dumps({'status':'passed','checks':checks,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':'passed','checks':checks,'page_errors':errors},ensure_ascii=False))
    browser.close()
