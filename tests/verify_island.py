from pathlib import Path
import csv,io,json,re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'.qa';out.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True,reduced_motion='reduce')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8793/#analysis',wait_until='networkidle')
    page.locator('[data-kind=island]').click()
    assert page.locator('[data-report-action=kind]').count()==5
    assert page.locator('.island-chart').count()==5
    def download(action):
        with page.expect_download() as d:page.locator('[data-island-action='+action+']').click()
        path=out/d.value.suggested_filename;d.value.save_as(path)
        return list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
    for id in ['ISLAND-20261006','ISLAND-20260928','ISLAND-20260918']:
        page.locator('[data-island-action=event][data-id='+id+']').click()
        event=page.evaluate('currentIsland()')
        assert page.locator('.island-chart').count()==5
        for t in page.locator('.island-result time').all_inner_texts():
            assert re.fullmatch(r'\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}',t),t
        data=download('export-data');start=next(i for i,r in enumerate(data) if r and r[0]=='日期時間')
        records=data[start+1:];assert len(records)==len(event['rows'])
        assert records[0][0]==event['rows'][0]['date'] and records[-1][0]==event['rows'][-1]['date']
        for a,b in zip(records,event['rows']):
            for idx,key in [(3,'battery'),(4,'soc'),(5,'diesel'),(6,'fuel'),(7,'pv'),(8,'grid'),(9,'load')]:assert abs(float(a[idx])-b[key])<.011
        summary=download('export-summary');header=next(i for i,r in enumerate(summary) if r and r[0]=='事件時間')
        assert len(summary[header+1:])==len(event['milestones'])
        assert all(re.fullmatch(r'\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}',r[0]) for r in summary[header+1:])
        if event['transfer']:
            page.locator('[data-island-action=moment][data-time="'+str(event['transfer'])+'"]').click()
            assert page.evaluate('currentIsland().rows[islandState.index].time')==event['transfer']
            assert '柴油機供應國研必要設備' in page.locator('#island-moment').inner_text()
        else:assert '本次柴油機沒有啟動' in page.locator('.island-result').inner_text()
    checks.append('All three events render five charts, timestamped milestones, matching summary and full telemetry CSVs')
    page.fill('#island-from','2026/09/29');page.fill('#island-to','2026/09/29')
    assert page.locator('[data-island-action=export-data]').is_disabled()
    page.locator('#island-filter [type=submit]').click()
    assert page.locator('[data-island-action=event]').count()==1
    assert '2026/09/28' in page.locator('.island-period').inner_text()
    assert '2026/09/29' in page.locator('.island-period').inner_text()
    page.fill('#island-from','2026/09/31');page.locator('#island-filter [type=submit]').click()
    assert '有效日期' in page.locator('#island-filter-error').inner_text()
    page.fill('#island-from','2026/10/06');page.locator('#island-filter [type=submit]').click()
    assert '不能晚於' in page.locator('#island-filter-error').inner_text()
    page.fill('#island-from','2026/09/01');page.fill('#island-to','2026/09/02');page.locator('#island-filter [type=submit]').click()
    assert '這段日期沒有孤島事件' in page.locator('#report-panel').inner_text()
    assert page.locator('.island-result').count()==0
    assert page.locator('[data-island-action=export-data]').count()==0
    page.locator('[data-island-action=reset]').click()
    page.select_option('#island-sample',index=15)
    assert page.evaluate('islandState.index')==15
    before=page.evaluate('islandState.page')
    page.locator('[data-island-action=page][data-step="1"]').click()
    assert page.evaluate('islandState.page')==before+1
    assert len(download('export-data'))>page.locator('#island-records tbody tr').count()
    checks.append('Date overlap includes cross-midnight event; invalid and empty ranges; sample picker and paging; full export beyond page')
    page.locator('[data-island-action=reset]').click()
    page.locator('#toast').wait_for(state='hidden')
    page.screenshot(path=str(out/'island-desktop.png'),full_page=True)
    page.locator('#font-button').click()
    for width in [1440,1024,768,375]:
        page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(200)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
        for selector in ['#island-from','#island-to','#island-sample']:
            r=page.locator(selector).bounding_box();assert r['x']>=0 and r['x']+r['width']<=width+1,(width,selector,r)
        # Date ticks on the same chart must never overlap, even with enlarged text.
        for chart in page.locator('.island-chart').all():
            rects=chart.locator('.island-axis-date').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}})')
            for a,b in zip(rects,rects[1:]):assert a['right']+14<=b['left'],(width,rects)
        if width==375:
            page.locator('.island-chart[data-series=soc]').screenshot(path=str(out/'island-mobile-soc.png'))
            page.evaluate('window.scrollTo(0,document.querySelector("#island-filter").getBoundingClientRect().top+scrollY-10)')
            page.screenshot(path=str(out/'island-mobile.png'))
    page.locator('[data-kind=island]').focus();page.keyboard.press('Home')
    assert page.evaluate('reportActiveTab')=='usage'
    page.keyboard.press('End');assert page.evaluate('reportActiveTab')=='island'
    assert page.locator('[data-kind=island]').get_attribute('aria-selected')=='true'
    assert not errors,errors
    checks.append('Five-tab keyboard navigation, 24px text, four viewport widths, full date/time labels without overlap')
    result={'status':'passed','checks':checks,'page_errors':errors}
    (out/'island-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False));browser.close()
