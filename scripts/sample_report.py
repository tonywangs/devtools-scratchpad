"""Regenerate the real-input sample, with deterministic IDs and current tzdb metadata."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from atlas.engine import evaluate
from atlas.server import demo
from atlas.report import standalone

project = demo()
for i, source in enumerate(project['sources']):
    old = source['id']
    source['id'] = f'source-{i + 1}'
    for schedule in project['schedules']:
        if schedule['source_id'] == old:
            schedule['source_id'] = source['id']
for i, schedule in enumerate(project['schedules']):
    schedule['id'] = f'schedule-{i + 1}'
report = evaluate(project)
assert report['complete'] and len(report['occurrences']) == 22
for name, content in [('real-workflows.json', json.dumps(report, indent=2, ensure_ascii=False) + '\n'), ('real-workflows.html', standalone(report))]:
    (ROOT / 'examples' / name).write_text(content)
print('Generated examples/real-workflows.{json,html}: 22 occurrences, 10 simultaneous instants')
