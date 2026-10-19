#!/usr/bin/env python3
"""Build the pinned real static site, then a separate controlled-defect copy."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from site_link_inspector.core import inspect
from site_link_inspector.cli import write_report


def main():
    fixture = ROOT / "examples/mdn"
    provenance = json.loads((ROOT / "examples/provenance.json").read_text())
    for name, expected in provenance["sha256"].items():
        assert hashlib.sha256((fixture / name).read_bytes()).hexdigest() == expected, name
    build = ROOT / "build/demo"
    build.mkdir(parents=True, exist_ok=True)
    site = build / "site"
    # For this hand-written HTML/CSS site, building is an exact asset copy.
    # Recreate our own bounded output to prevent stale files masking failures.
    for directory in (site, build / "controlled-site"):
        if directory.exists():
            shutil.rmtree(directory)
    site.mkdir()
    for name in provenance["sha256"]:
        if name == "LICENSE":
            continue
        dest = site / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fixture / name, dest)
    clean = inspect(site)
    assert clean["counts"] == {"checked": 2, "skipped": 2, "unsupported": 0, "failed": 0}
    write_report(clean, build / "clean-report")
    broken = build / "controlled-site"
    shutil.copytree(site, broken)
    # These defects and valid controls are ours, never upstream MDN findings.
    additions = '''
<section id="inspector-controls">
<h2 id="known-anchor">Inspector controlled checks (not upstream content)</h2>
<a href="missing-page.html">Injected missing page</a>
<img src="images/missing-image.png" alt="Injected missing asset">
<a href="#absent-anchor">Injected invalid anchor</a>
<a href="#known-anchor">Valid anchor control</a>
<a href="/styles/style.css?v=1">Valid root-relative asset control</a>
<a href="guide/#chapter">Valid directory-index control</a>
<script src="scripts/control.js"></script>
<a href="docs/hello%20world.html#caf%C3%A9">Valid decoded path and anchor</a>
</section>
'''
    page = broken / "index.html"
    page.write_text(page.read_text().replace("</body>", additions + "</body>"))
    for name, content in {"guide/index.html": '<h1 id="chapter">Directory index</h1>',
                          "scripts/control.js": '/* Static controlled fixture; no navigation. */',
                          "docs/hello world.html": '<h1 id="café">Decoded target</h1>'}.items():
        dest = broken / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
    controlled = inspect(broken)
    assert controlled["counts"] == {"checked": 7, "skipped": 2, "unsupported": 0, "failed": 3}
    write_report(controlled, build / "controlled-report")
    (build / "index.html").write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Site inspector demo</title>
<style>body{font:18px system-ui;max-width:800px;margin:60px auto;padding:20px;background:#101622;color:#e8edf5}a{color:#8edfd1}li{margin:20px 0}p{line-height:1.7}</style>
<h1>Inspect a real static site</h1><p>MDN's CC0 beginner HTML site, pinned and built from bundled source. The original has two checked local resources and two unchecked external URLs. The controlled copy adds three intentional defects, independently checked by the browser verification script.</p>
<ul><li><a href="clean-report/index.html">1. Inspect the unchanged real site report</a></li><li><a href="controlled-report/index.html">2. Explore the three injected defects</a></li><li><a href="site/index.html">View the original built site</a> (may request its upstream Google Font)</li><li><a href="controlled-site/index.html">View the labeled controlled copy</a></li></ul>
<p>In a report, select Failed, search a URL, and expand a row to see the responsible source tag and resolution evidence. JSON is available beside each report.</p></html>''', encoding="utf-8")
    print(json.dumps({"clean": clean["counts"], "controlled": controlled["counts"]}, indent=2))
    print(f"Open {(build / 'index.html').as_uri()}")
    if "--open" in sys.argv:
        webbrowser.open((build / "index.html").as_uri())

if __name__ == "__main__":
    main()
