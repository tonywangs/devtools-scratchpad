"""Real Chromium end-to-end workflow, own ephemeral loopback server, no external requests."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect
from atlas.server import Handler, ROOT
from tests.oracle import enumerate_minutes

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(headless=True)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1000})
        self.page=self.context.new_page();self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.goto(self.url);self.page.wait_for_selector('.schedule')
    def tearDown(self):
        self.context.close();self.assertEqual(self.errors,[])
    def evaluated(self):
        self.page.click('#evaluate');expect(self.page.locator('#result-status')).to_have_text('COMPLETE')
    def download(self,selector,path):
        with self.page.expect_download() as d:self.page.click(selector)
        d.value.save_as(path)

    def test_real_workflow_and_offline_report(self):
        p=self.page
        p.click('#demo');expect(p.locator('#count')).to_have_text('22')
        self.assertEqual(p.locator('#collision-count').inner_text(),'10')
        # Real file import through the file input, including provenance snapshot.
        p.set_input_files('#source-file',str(ROOT/'fixtures/sources/pallets-flask/lock.yaml'))
        p.click('#import-source');expect(p.locator('.schedule')).to_have_count(4)
        cards=p.locator('.schedule');cards.nth(3).get_by_label('Simulation IANA timezone').fill('America/New_York');cards.nth(3).get_by_label('Simulation IANA timezone').press('Tab')
        cards.nth(3).get_by_label('Schedule annotation').fill('US offset shifts from -04:00 to -05:00 in this interval.');cards.nth(3).get_by_label('Schedule annotation').press('Tab')
        p.fill('#annotation','<script>window.pwned=true</script> Real sources compared in UTC and New York.');p.locator('#annotation').press('Tab')
        self.evaluated();self.assertEqual(p.locator('#count').inner_text(),'32')
        p.locator('#timeline circle').first.click();self.assertIn('SHA-256',p.locator('#inspection').inner_text())
        self.assertEqual(p.locator('tbody tr.selected').count(),1)
        p.check('#simultaneous');self.assertIn('20 visible',p.locator('#page-status').inner_text());p.uncheck('#simultaneous')
        p.fill('#view-start','2026-11-01T00:00');p.locator('#view-start').press('Tab');self.assertIn('7 visible',p.locator('#page-status').inner_text());p.click('#reset-view')
        with tempfile.TemporaryDirectory() as tmp:
            report_path=Path(tmp)/'report.json';html_path=Path(tmp)/'report.html';project_path=Path(tmp)/'project.json'
            self.download('#export-json',report_path);self.download('#export-html',html_path);self.download('#save-project',project_path)
            report=json.loads(report_path.read_text());self.assertTrue(report['complete']);self.assertEqual(len(report['occurrences']),32)
            locals_=[o['local'] for o in report['occurrences'] if o['timezone']=='America/New_York']
            self.assertTrue(any(t.endswith('-04:00') for t in locals_));self.assertTrue(any(t.endswith('-05:00') for t in locals_))
            self.assertTrue(report['versions']['zone_sha256'])
            # Verify each exported occurrence set independently of the app engine.
            for schedule in report['project']['schedules']:
                expected=enumerate_minutes(schedule['expression'],schedule['timezone'],report['project']['start'],report['project']['end'])
                actual=[row['utc'] for row in report['occurrences'] if row['schedule_id']==schedule['id']]
                self.assertEqual(actual,expected)
            p.reload();p.wait_for_selector('.schedule');self.assertEqual(p.locator('.schedule').count(),4)
            self.assertIn('Real sources',p.input_value('#annotation'));self.assertTrue(p.locator('#export-json').is_disabled())
            # Browser recovery rolls back the latest named edit.
            old=p.input_value('#title');p.fill('#title','Temporary comparison title');p.locator('#title').press('Tab');p.click('#recover');expect(p.locator('#title')).to_have_value(old)
            p.set_input_files('#project-file',str(report_path));expect(p.locator('#notice')).to_contain_text('Portable project loaded');self.evaluated()
            second=Path(tmp)/'second.json';self.download('#export-json',second)
            self.assertEqual(json.loads(second.read_text())['occurrences'],report['occurrences'])
            # Compare changed source bytes without overwriting original snapshot.
            changed=Path(tmp)/'changed.yaml';changed.write_text('on:\n  schedule:\n    - cron: "5 0 * * *"\n')
            p.locator('#sources details').first.locator('summary').click();p.locator('#sources input[type=file]').first.set_input_files(str(changed));expect(p.locator('#notice')).to_contain_text('SOURCE CHANGED')
            offline=self.context.new_page();self.context.set_offline(True);offline.goto(html_path.as_uri());self.assertEqual(offline.locator('script').count(),0);self.assertIsNone(offline.evaluate('window.pwned'))
            embedded=json.loads(offline.locator('#report-json').inner_text());self.assertEqual(embedded,report)
            self.assertIn('COMPLETE',offline.locator('body').inner_text());self.assertEqual(offline.locator('table tr').count(),33)
            self.context.set_offline(False);offline.close()
        if os.environ.get('ATLAS_SCREENSHOT'):
            p.screenshot(path=os.environ['ATLAS_SCREENSHOT'],full_page=True)

    def test_failure_recovery_incomplete_and_hostile_text(self):
        p=self.page
        p.select_option('#import-format','crontab');p.fill('#source-text','CRON_TZ=UTC\n@reboot echo x\nmalformed line\n0 0 * * * echo "<img src=x onerror=alert(1)>"')
        p.click('#import-source');expect(p.locator('.schedule')).to_have_count(6)
        p.click('#evaluate');expect(p.locator('#result-status')).to_have_text('INCOMPLETE')
        self.assertIn('unsupported',p.locator('#accounting').inner_text());self.assertIn('failed',p.locator('#accounting').inner_text())
        self.assertEqual(p.locator('#sources img').count(),0)
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'incomplete.html';self.download('#export-html',out);q=self.context.new_page();q.goto(out.as_uri());self.assertIn('INCOMPLETE',q.locator('body').inner_text());q.close()
            bad=Path(tmp)/'bad.json';bad.write_text('{invalid');p.set_input_files('#project-file',str(bad));expect(p.locator('#notice')).to_contain_text('Project import failed');self.assertEqual(p.locator('.schedule').count(),6)
        # Invalid stored JSON is retained for explicit recovery; app still initializes.
        p.evaluate("localStorage.setItem('cron-atlas-project-v1','{broken')");p.reload();p.wait_for_selector('.schedule');self.assertIn('Saved draft could not be loaded',p.locator('#notice').inner_text());p.click('#recover');expect(p.locator('#notice')).to_contain_text('Previous draft recovered')

    def test_edits_after_evaluation_are_persisted(self):
        p=self.page
        self.evaluated()
        card=p.locator('.schedule').first
        for label,value in [('Name','Changed schedule'),('Five-field expression','0 12 * * *'),('Simulation IANA timezone','America/New_York'),('Schedule annotation','After evaluation edit')]:
            card.get_by_label(label,exact=True).fill(value)
            card.get_by_label(label,exact=True).press('Tab')
        self.evaluated()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'edited.json';self.download('#export-json',path)
            report=json.loads(path.read_text());schedule=report['project']['schedules'][0]
            self.assertEqual(schedule['name'],'Changed schedule')
            self.assertEqual(schedule['expression'],'0 12 * * *')
            self.assertEqual(schedule['timezone'],'America/New_York')
            self.assertEqual(schedule['annotation'],'After evaluation edit')
            rows=[r for r in report['occurrences'] if r['schedule_id']==schedule['id']]
            self.assertEqual(len(rows),10)
            self.assertTrue(all('T12:00:00' in r['local'] for r in rows))
        p.reload();p.wait_for_selector('.schedule')
        self.assertEqual(p.locator('.schedule').first.get_by_label('Simulation IANA timezone').input_value(),'America/New_York')

    def test_cancel_and_truncation(self):
        p=self.page
        # Delay only the evaluation response so cancellation is deterministic.
        p.route('**/api/evaluate',lambda route:route.fulfill(status=200,content_type='application/json',body='{}'))
        p.evaluate("document.getElementById('evaluate').click();document.getElementById('cancel').click()")
        expect(p.locator('#result-status')).to_contain_text('INTERRUPTED')
        self.assertTrue(p.locator('#export-json').is_disabled());p.unroute('**/api/evaluate')
        p.locator('.schedule').first.get_by_label('Five-field expression').fill('* * * * *');p.locator('.schedule').first.get_by_label('Five-field expression').press('Tab')
        p.click('#evaluate');expect(p.locator('#result-status')).to_have_text('INCOMPLETE')
        self.assertIn('occurrence limit',p.locator('#result-message').inner_text());self.assertEqual(p.locator('#count').inner_text(),'10,000')

if __name__=='__main__':unittest.main()
