import json
from pathlib import Path
import tempfile
import unittest

from site_link_inspector.core import inspect
from site_link_inspector.cli import main, write_report


class InspectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "site"
        self.root.mkdir()

    def put(self, name, text=""):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def links(self, html, **kwargs):
        self.put("index.html", html)
        result = inspect(self.root, **kwargs)
        self.assertEqual(result['total'], sum(result['counts'].values()))
        return result['links']

    def test_core_types_and_failures(self):
        self.put('style.css'); self.put('script.js'); self.put('image.png')
        rows = self.links('<link href="style.css"><script src="script.js"></script><img src="image.png">'
                          '<a href="missing.html">x</a><img src="absent.png"><a href="#no">x</a>')
        self.assertEqual([x['status'] for x in rows], ['checked']*3+['failed']*3)
        self.assertEqual(rows[-1]['reason'], 'missing_anchor')

    def test_decoding_query_index_named_anchors(self):
        self.put('docs/hello world.html', '<a name="café"></a>')
        self.put('guide/index.html', '<h1 id="chapter">Hi</h1>')
        rows=self.links('<a href="docs/hello%20world.html?q=ignored#caf%C3%A9">x</a>'
                        '<a href="/guide/#chapter">x</a><a href="guide#chapter">x</a>'
                        '<a href="#top">x</a><a href="">x</a>')
        self.assertTrue(all(x['status']=='checked' for x in rows))
        self.assertEqual(rows[0]['query_ignored'],'q=ignored')
        self.assertEqual(rows[1]['target'],'guide/index.html')

    def test_first_base_applies_to_all_links(self):
        self.put('guide/index.html','<h1 id="x">x</h1>')
        rows=self.links('<a href="#x">x</a><base href="guide/"><base href="/elsewhere/">')
        self.assertEqual(rows[0]['target'],'guide/index.html')
        self.assertEqual(rows[0]['status'],'checked')
        self.assertEqual([x['status'] for x in rows[1:]],['skipped','skipped'])

    def test_external_and_external_base_not_success(self):
        rows=self.links('<a href="https://example.com">x</a><a href="//example.com">x</a>'
                        '<a href="mailto:a@example.com">x</a><a href="data:text/plain,x">x</a>')
        self.assertTrue(all(x['status']=='skipped' for x in rows))
        rows=self.links('<base href="https://example.com/"><a href="#local">x</a>')
        self.assertEqual(rows[-1]['reason'],'external_base_network_disabled')

    def test_unsupported_are_accounted_for(self):
        self.put('image.svg')
        rows=self.links('<img srcset="a.png 1x, b.png 2x"><form action="/submit"></form>'
                        '<a href="image.svg#x">x</a><a href="a%2fb">x</a>'
                        '<a href="%2e%2e/escape">x</a><a href="bad%zz">x</a>'
                        '<a href="x" href="y">x</a>')
        self.assertEqual(len(rows),8)
        self.assertEqual(sum(x['status']=='unsupported' for x in rows),7)

    def test_empty_resource_sources_are_not_successes(self):
        rows=self.links('<img src=""><script src=""></script><video poster=" "></video><a href="">self</a>')
        self.assertEqual([x["status"] for x in rows],["unsupported"]*3+["checked"])
        self.assertEqual(rows[0]["reason"],"empty_resource_url")

    def test_location_and_entities(self):
        self.put('a&b.html')
        row=self.links('<html>\n  <a\n href="a&amp;b.html">go</a></html>')[0]
        self.assertEqual((row['line'],row['column']),(2,3))
        self.assertEqual(row['url'],'a&b.html')
        self.assertEqual(row['status'],'checked')
        self.assertIn('href="a&amp;b.html"',row['snippet'])

    def test_no_css_or_script_execution(self):
        rows=self.links('<script>const s = \'<a href="no.html">\';</script><!-- <img src="bad"> -->')
        self.assertEqual(rows,[])

    def test_symlink_escape_and_scan_errors(self):
        outside=Path(self.tmp.name)/'outside.html'; outside.write_text('secret')
        (self.root/'escape.html').symlink_to(outside)
        rows=self.links('<a href="escape.html">x</a>')
        self.assertEqual(rows[0]['reason'],'outside_root')
        self.assertEqual(inspect(self.root)['scan_errors'][0]['reason'],'symlink_html_excluded')

    def test_invalid_encoding_is_visible(self):
        (self.root/'bad.html').write_bytes(b'\xff')
        self.put('index.html','<a href="bad.html#x">x</a>')
        result=inspect(self.root)
        self.assertEqual(result['scan_errors'][0]['reason'],'unreadable_html')
        self.assertEqual(result['links'][0]['status'],'unsupported')

    def test_index_and_trailing_slash(self):
        self.put('guide/home.htm','<h1 id="yes">Hi</h1>'); self.put('asset.png')
        rows=self.links('<a href="guide/#yes">x</a><img src="asset.png/">',index='home.htm')
        self.assertEqual(rows[0]['status'],'checked')
        self.assertEqual(rows[1]['reason'],'not_a_directory')
        with self.assertRaises(ValueError): inspect(self.root,'../index.html')

    def test_cli_exit_codes_and_output(self):
        output=Path(self.tmp.name)/'report'
        self.assertEqual(main([str(self.root),'--output',str(output)]),2)
        self.put('index.html','<img srcset="a.png 1x">')
        self.assertEqual(main([str(self.root),'--output',str(output)]),0)
        self.assertEqual(main([str(self.root),'--output',str(output),'--strict']),1)
        self.put('index.html','<a href="missing.html">x</a>')
        self.assertEqual(main([str(self.root),'--output',str(output)]),1)
        self.assertEqual(json.loads((output/'report.json').read_text())['counts']['failed'],1)
        with self.assertRaises(SystemExit) as caught: main([str(self.root),'--output',str(self.root/'report')])
        self.assertEqual(caught.exception.code,2)

    def test_report_escapes_untrusted_source(self):
        self.links('<a href="&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>')
        output=Path(self.tmp.name)/'report'; write_report(inspect(self.root),output)
        text=(output/'index.html').read_text()
        self.assertIn('\\u003c/script\\u003e',text)
        self.assertNotIn('<script>alert(1)</script>',text)

if __name__ == '__main__': unittest.main()
