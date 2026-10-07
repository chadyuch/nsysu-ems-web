"""Isolated browser QA of the report journey, including downloads and layouts."""
import csv, io, json
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'.qa'
out.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True,reduced_motion='reduce')
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8793/#analysis',wait_until='networkidle')
    page.locator('[data-report-action=kind]').first.wait_for(state='visible')
    assert not errors,errors
    assert page.locator('[data-report-action=kind]').count()==5,page.locator('#main').inner_text()
    assert page.locator('#report-panel h2').count()>0
    def fill_time(boundary,value):
        parts=value.split('T')
        page.fill('#report-'+boundary,parts[0])
        if len(parts)>1:page.select_option('#report-'+boundary+'-hour',parts[1])
    def query():
        page.locator('#report-form [type=submit]').click()
        assert page.locator('#report-error').inner_text()==''
    def download(action='export'):
        with page.expect_download() as d:page.locator(f'[data-report-action={action}]').click()
        path=out/d.value.suggested_filename
        d.value.save_as(path)
        return list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
    for kind in ['usage','generation','storage','alarms']:
        page.locator(f'[data-report-action=kind][data-kind={kind}]').click()
        for grain,typ in [('hour','date'),('day','date'),('month','month'),('year','number')]:
            page.select_option('#report-grain',grain)
            assert page.locator('#report-start').get_attribute('type')==typ
            assert page.locator('[data-report-action=export]').is_disabled() or page.evaluate('!reportDirty()')
            query()
            result=page.evaluate('({n:reportApplied.rows.length,total:reportApplied.total,columns:reportColumns(reportApplied),kind:reportApplied.filters.kind})')
            assert result['n']>0
            rows=download()
            start=next(i for i,r in enumerate(rows) if r and r[0]=='時間區間')
            assert len(rows[start+1:-1])==result['n']
            for i,(key,_) in enumerate(result['columns'][1:],1):
                assert abs(float(rows[-1][i])-result['total'][key])<.011
            assert page.locator('.report-chart svg').count()>=1
    checks.append('All 16 report combinations query, graph and export full rows with matching totals')
    page.locator('[data-kind=usage]').click()
    page.select_option('#report-grain','hour')
    page.select_option('#report-site','research')
    page.select_option('#report-space','r-lab')
    page.select_option('#report-device','ac3')
    query()
    assert page.evaluate('reportApplied.selected.length')==1
    assert '實驗室專用冷氣' in page.locator('#report-results').inner_text()
    page.select_option('#report-site','management')
    assert page.input_value('#report-space')=='all'
    assert page.input_value('#report-device')=='all'
    assert '實驗室' not in page.locator('#report-device').inner_text()
    fill_time('start','2026-10-06T18:00')
    fill_time('end','2026-10-06T08:00')
    page.locator('#report-form [type=submit]').click()
    assert '不能晚於' in page.locator('#report-error').inner_text()
    assert page.locator('[data-report-action=export]').is_disabled()
    fill_time('start','')
    page.locator('#report-form [type=submit]').click()
    assert '完整' in page.locator('#report-error').inner_text()
    fill_time('start','2026-10-07T00:00')
    fill_time('end','2026-10-07T23:00')
    page.locator('#report-form [type=submit]').click()
    assert '示範資料範圍' in page.locator('#report-error').inner_text()
    page.locator('[data-report-action=reset]').click()
    checks.append('Dependent site/space/device selectors reset; inverted, blank and future ranges rejected')
    page.locator('[data-kind=generation]').click()
    page.select_option('#report-site','marine')
    page.select_option('#report-type','diesel')
    query()
    assert '沒有符合的設備' in page.locator('#report-panel').inner_text()
    assert page.locator('[data-report-action=export]').is_disabled()
    page.select_option('#report-site','research')
    query()
    assert page.evaluate('reportApplied.rows.length')>0
    assert page.locator('[data-report-action=export]').is_enabled()
    checks.append('Uninstalled generator is distinct from an installed generator with zero generation')
    page.locator('[data-kind=storage]').click()
    page.select_option('#report-grain','hour')
    page.select_option('#report-metric','soc')
    query()
    assert page.locator('.report-chart svg').count()==1
    assert '期末電量（%）' in page.locator('#report-detail').inner_text()
    assert page.evaluate('reportApplied.total.socMax>reportApplied.total.socMin')
    page.locator('[data-report-action=page][data-step="1"]').click()
    assert '12:00' in page.locator('#report-detail tbody tr').first.inner_text()
    rows=download()
    assert any(row and row[0]=='2026-10-06 00:00' for row in rows)
    assert any(row and row[0]=='2026-10-06 23:00' for row in rows)
    checks.append('SOC selection and pagination work; export includes hidden pages')
    page.locator('[data-kind=alarms]').click()
    page.select_option('#report-grain','year')
    page.select_option('#report-site','research')
    page.select_option('#report-type','storage')
    page.select_option('#report-device','ess-research')
    page.select_option('#report-cause','temperature')
    query()
    result=page.evaluate('reportApplied.events')
    assert len(result)>0
    rows=download('export-events')
    header=next(i for i,r in enumerate(rows) if r and r[0]=='事件編號')
    assert len(rows[header+1:])==len(result)
    assert all(e['type']=='storage' and e['cause']=='temperature' for e in result)
    page.select_option('#report-severity','high')
    query()
    assert page.evaluate('reportApplied.events.every(e=>e.severity==="high")')
    checks.append('Alarm filters combine correctly and unique event detail CSV matches counts')
    page.locator('[data-kind=usage]').click()
    page.select_option('#report-grain','day')
    query()
    page.screenshot(path=str(out/'reports-desktop.png'),full_page=True)
    page.locator('[data-kind=storage]').click()
    page.select_option('#report-grain','hour')
    query()
    page.screenshot(path=str(out/'reports-storage.png'),full_page=True)
    page.locator('#font-button').click()
    for width in [1440,1024,768,375]:
        page.set_viewport_size({'width':width,'height':1000})
        for kind in ['usage','generation','storage','alarms']:
            page.locator(f'[data-kind={kind}]').click()
            page.wait_for_timeout(150)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,kind)
            for key in ['report-site','report-grain','report-start','report-end']:
                rect=page.locator('#'+key).bounding_box()
                assert rect['x']>=0 and rect['x']+rect['width']<=width+1,(width,key,rect)
        if width==375:
            page.screenshot(path=str(out/'reports-mobile.png'),full_page=True)
    page.locator('[data-kind=usage]').focus()
    page.keyboard.press('ArrowRight')
    assert page.evaluate('reportDraft.kind')=='generation'
    assert page.locator('[data-kind=generation]').get_attribute('aria-selected')=='true'
    assert not errors,errors
    checks.append('Four general reports and the five-tab navigation reflow at 375/768/1024/1440px with 24px text, and support keyboard arrows')
    (out/'reports-verification.json').write_text(json.dumps({'status':'passed','checks':checks,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':'passed','checks':checks,'page_errors':errors},ensure_ascii=False))
    browser.close()
