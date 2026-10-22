import copy
import hashlib
import json
import unittest
from datetime import datetime,timedelta
from pathlib import Path
from croniter import croniter
from atlas.engine import Cron, Invalid, evaluate, normalize
from atlas.importing import import_source, load_project
from atlas.report import standalone
from atlas.server import demo
from tests.oracle import enumerate_minutes

ROOT=Path(__file__).resolve().parent.parent
CASES=json.loads((ROOT/'fixtures/cases.json').read_text())['cases']

def project(case):
    return dict(schema='atlas-project-v1',title=case['id'],start=case['start'],end=case['end'],schedules=[dict(id='s',name=case['id'],expression=case['expression'],timezone=case['timezone'])],sources=[])

class EngineTests(unittest.TestCase):
    def test_frozen_complete_sets(self):
        for case in CASES:
            with self.subTest(case=case['id']):
                r=evaluate(project(case));self.assertTrue(r['complete'])
                actual=[o['utc'] for o in r['occurrences']]
                expected=enumerate_minutes(case['expression'],case['timezone'],case['start'],case['end'])
                self.assertEqual(actual,expected)
                self.assertEqual(len(actual),case['expected_count'])
                if 'expected_utc' in case:self.assertEqual(actual,case['expected_utc'])

    def test_established_utc_implementation(self):
        for case in CASES:
            if case['timezone']!='UTC' or case['id']=='impossible':continue
            with self.subTest(case=case['id']):
                start=datetime.fromisoformat(case['start'].replace('Z','+00:00'))
                end=datetime.fromisoformat(case['end'].replace('Z','+00:00'))
                # croniter default OR differs for wildcard steps. Its documented
                # implement_cron_bug switch matches our declared Vixie-style rule.
                iterator=croniter(case['expression'],start-timedelta(minutes=1),ret_type=datetime,implement_cron_bug=True)
                expected=[]
                while True:
                    nxt=iterator.get_next()
                    if nxt>=end:break
                    expected.append(nxt.isoformat().replace('+00:00','Z'))
                self.assertEqual([o['utc'] for o in evaluate(project(case))['occurrences']],expected)

    def test_no_occurrences_vs_impossible(self):
        self.assertIn('calendar-impossible',evaluate(project(CASES[-2]))['results'][0]['message'])
        self.assertEqual(evaluate(project(CASES[-1]))['results'][0]['message'],'no occurrences in the searched interval')

    def test_malformed_and_unsupported(self):
        for value in ['60 * * * *','* 24 * * *','0 0 0 * *','0 0 * 13 *','0 0 * * 8','*/0 * * * *','*/61 * * * *','5-1 * * * *','1,,2 * * * *','-1 * * * *','@daily','0 0 * * MON','0 0 L * *','0 0 * * 1#2','0 0 * * ?','H * * * *','0 0 0 * * *','1/5 * * * *']:
            with self.subTest(value=value),self.assertRaises(Invalid):Cron(value)

    def test_limits(self):
        p=project(CASES[0]);p['end']='2028-01-01T00:00:00Z'
        with self.assertRaises(Invalid):evaluate(p)
        p=project(CASES[0]);p['schedules']*=25
        with self.assertRaises(Invalid):evaluate(p)
        p=project(CASES[0]);p['schedules'][0]['expression']='* * * * *'
        r=evaluate(p,max_occurrences=3);self.assertFalse(r['complete']);self.assertEqual(len(r['occurrences']),3);self.assertEqual(r['reason'],'occurrence limit')
        r=evaluate(p,seconds=0);self.assertFalse(r['complete']);self.assertEqual(len(r['occurrences']),0)
        r=evaluate(p,cancelled=lambda:True);self.assertFalse(r['complete'])
        for value in ['2026-10-24T00:00:01Z','2026-10-24T00:00:00','2026-10-24T00:00:00+01:00','1999-01-01T00:00:00Z']:
            p['start']=value
            with self.assertRaises(Invalid):evaluate(p)

    def test_source_integrity_and_real_import(self):
        manifest=json.loads((ROOT/'fixtures/manifest.json').read_text())
        for source in manifest['sources']:
            self.assertEqual(hashlib.sha256((ROOT/source['local']).read_bytes()).hexdigest(),source['sha256'])
        p=demo();self.assertEqual(len(p['schedules']),3)
        self.assertEqual([s['expression'] for s in p['schedules']],['0 0 * * *','0 23 * * 0','0 0 * * *'])
        r=evaluate(p);self.assertTrue(r['complete']);self.assertEqual(len(r['occurrences']),22)
        self.assertEqual(sum(o['simultaneous']==2 for o in r['occurrences']),20)
        p['sources'][0]['content']+='\n# changed'
        self.assertEqual(evaluate(p)['source_integrity'],'CHANGED')

    def test_accounting_and_inert_commands(self):
        result=import_source({'format':'crontab','name':'test','content':'CRON_TZ=UTC\n0 0 * * * touch /tmp/atlas-command-must-not-run\n@reboot echo ignored\nbroken line\n'})
        self.assertEqual([s['import_status'] for s in result['schedules']],['supported','unsupported','failed'])
        p=project(CASES[0]);p['sources']=[result['source']];p['schedules']=result['schedules'];r=evaluate(p)
        self.assertFalse(r['complete']);self.assertEqual(len(r['results']),3)
        self.assertFalse(Path('/tmp/atlas-command-must-not-run').exists())
        result=import_source({'format':'workflow','content':'on:\n  schedule:\n    - cron: "0 0 * * *"\n    - what: bad\n','name':'sample'})
        self.assertEqual(len(result['schedules']),2);self.assertEqual(result['schedules'][1]['import_status'],'failed')
        for content in ['on: [push]','on:\n  schedule: &x [*x]','on:\n  schedule: '+ '['*40+'x'+']'*40]:
            with self.assertRaises(Invalid):import_source({'format':'workflow','content':content})

    def test_portable_and_html_escape(self):
        p=demo();p['annotation']='<script>globalThis.pwned=1</script>'
        p['schedules'][0]['annotation']='DST finding';p['schedules'][0]['timezone']='America/New_York'
        r=evaluate(p);reopened=load_project(json.loads(json.dumps(r)))
        self.assertEqual(reopened,r['project'])
        self.assertEqual(evaluate(reopened)['occurrences'],r['occurrences'])
        html=standalone(r);self.assertNotIn('<script>',html);self.assertIn('&lt;script&gt;',html)
        self.assertIn('America/New_York',html);self.assertIn('zone_sha256',html)

if __name__=='__main__':unittest.main()
