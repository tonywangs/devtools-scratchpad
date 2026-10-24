#!/usr/bin/env python3
"""Exercise the installed CLI from outside the source tree (after pip install .)."""
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
cli = root / '.venv/bin/site-link-inspector'
assert cli.is_file(), 'Install the package into .venv first'
with tempfile.TemporaryDirectory() as tmp:
    output = Path(tmp) / 'report'
    run = subprocess.run([str(cli), str(root / 'examples/mdn'), '--output', str(output), '--strict'],
                         cwd=tmp, capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    result = json.loads((output / 'report.json').read_text())
    assert result['counts'] == {'checked': 2, 'skipped': 2, 'unsupported': 0, 'failed': 0}
    html = (output / 'index.html').read_text()
    assert '<title>Site Link Inspector' in html and '__REPORT_DATA__' not in html
    evidence = {'command': ['site-link-inspector', 'examples/mdn', '--output', 'TEMP/report', '--strict'],
                'working_directory': 'temporary directory outside source checkout',
                'exit_code': run.returncode, 'counts': result['counts'], 'packaged_template_rendered': True}
    (root / 'results/install.json').write_text(json.dumps(evidence, indent=2)+'\n')
    print(json.dumps(evidence, indent=2))
