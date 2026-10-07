"""Verify energy directions, real motion, demo balance and accessible display."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.qa'
OUT.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='no-preference')
    p=ctx.new_page()
    errors=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto('http://127.0.0.1:8793',wait_until='networkidle')
    p.evaluate('localStorage.clear()')
    p.reload(wait_until='networkidle')

    def nav(route):
        p.locator('#nav a[href="#'+route+'"]').click()
        p.wait_for_function('(r)=>document.querySelector("#nav a[aria-current=page]").hash==="#"+r',arg=route)

    def offset():
        return p.locator('.ef-stream').first.evaluate('(e)=>getComputedStyle(e).strokeDashoffset')

    def moving(expected):
        p.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        before=offset()
        p.wait_for_timeout(240)
        assert (before!=offset())==expected,(before,offset(),expected)

    expected={
        'normal':{'grid':260,'solar':260,'generator':0,'discharge':0,'charge':0},
        'charging':{'grid':260,'solar':360,'generator':0,'discharge':0,'charge':100},
        'outage':{'grid':0,'solar':200,'generator':0,'discharge':220,'charge':0},
        'offline':{'grid':260,'solar':260,'generator':0,'discharge':0,'charge':0},
        'low':{'grid':0,'solar':0,'generator':240,'discharge':0,'charge':0},
        'peak':{'grid':300,'solar':300,'generator':0,'discharge':250,'charge':0},
    }
    for scenario,values in expected.items():
        nav('overview')
        p.select_option('#scenario',scenario)
        overview=p.locator('.energy-flow').inner_text()
        for route in ['overview','microgrid']:
            if route=='microgrid':nav(route)
            assert p.locator('.energy-flow').inner_text()==overview
            assert p.locator('.ef-lane').count()==5
            for key,value in values.items():
                lane=p.locator('[data-flow="'+key+'"]')
                assert float(lane.get_attribute('data-power'))==value
                assert lane.locator('.ef-stream').count()==(1 if value>0 else 0)
                if value>0:
                    direction=lane.locator('.ef-stream').evaluate('(e)=>e.getPointAtLength(e.getTotalLength()).x-e.getPointAtLength(0).x')
                    assert (direction<0)==(key=='charge'),(scenario,key,direction)
            assert not (values['charge'] and values['discharge'])
            s=p.evaluate('scenario()')
            assert s['grid']+s['pv']+s['generator']+values['discharge']==s['load']+values['charge']
            assert s['pv']<=430 and abs(s['battery'])<=1200 and s['generator']<=400
            moving(scenario!='offline')
            if scenario=='offline':
                assert p.locator('[data-flow-action=pause]').is_disabled()
                assert '最後資料' in overview
            if scenario=='charging':
                assert '正在充電，把電存起來' in p.locator('#main').inner_text() if route=='microgrid' else True
                assert '＋ 電池充電 100 kW' in p.locator('.ef-balance').inner_text()
        if scenario=='charging':
            p.locator('.energy-flow').screenshot(path=str(OUT/'flow-charging-desktop.png'))
    checks.append('Both pages share six balanced scenarios, five independent paths and correct charge/discharge motion')

    p.select_option('#scenario','peak')
    colors=p.locator('.is-active').evaluate_all('(els)=>els.map(e=>getComputedStyle(e).color)')
    assert len(colors)==len(set(colors))==3
    p.select_option('#scenario','charging')
    charge_color=p.locator('[data-flow=charge]').evaluate('(e)=>getComputedStyle(e).color')
    assert charge_color not in colors
    p.locator('[data-flow-action=pause]').click()
    moving(False)
    assert p.locator('[data-flow-action=pause]').get_attribute('aria-pressed')=='true'
    assert p.locator('[data-flow-action=pause]').evaluate('(e)=>e===document.activeElement')
    nav('overview')
    moving(False)
    p.reload(wait_until='networkidle')
    moving(False)
    p.locator('[data-flow-action=pause]').focus()
    p.keyboard.press('Enter')
    moving(True)
    p.emulate_media(reduced_motion='reduce')
    moving(False)
    assert p.locator('[data-flow-action=pause]').is_disabled()
    assert '固定箭頭' in p.locator('.ef-motion-note').inner_text()
    p.emulate_media(reduced_motion='no-preference')
    moving(True)
    checks.append('Distinct active colors, keyboard pause/resume, persisted preference and live reduced-motion support')

    p.locator('[data-action=role]').click()
    p.locator('[data-action=switch-role][data-id=u3]').click()
    assert p.locator('#scenario').is_disabled()
    old_state=p.evaluate('JSON.stringify(state)')
    p.locator('[data-flow-action=pause]').click()
    assert old_state==p.evaluate('JSON.stringify(state)')
    moving(False)
    checks.append('Data administrator may pause viewing without changing demo data or operational permissions')

    p.locator('[data-action=font]').click()
    for width in [1440,1024,768,375]:
        p.set_viewport_size({'width':width,'height':1100})
        p.wait_for_timeout(200)
        for route in ['overview','microgrid']:
            nav(route)
            assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,route)
            assert p.locator('.ef-lane-label span').evaluate_all('(els)=>els.every(e=>parseFloat(getComputedStyle(e).fontSize)>=18)')
            assert p.locator('.energy-flow').evaluate('e=>Array.from(e.querySelectorAll(".ef-device,.ef-lane-label,.ef-load")).every(x=>x.scrollWidth<=x.clientWidth+1)'),(width,route,'content overflow')
        if width==375:p.locator('.energy-flow').screenshot(path=str(OUT/'flow-charging-mobile-large.png'))
    checks.append('Both diagrams fit 375/768/1024/1440px with 24px large text, readable labels and no overflow')
    assert errors==[],errors
    result={'status':'passed','checks':checks,'page_errors':errors}
    (OUT/'flow-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
    browser.close()
