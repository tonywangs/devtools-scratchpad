import html
import json


def standalone(report):
    """Self-contained, script-free HTML; imported strings are always escaped."""
    e=lambda v:html.escape(str(v),quote=True)
    project=report['project']
    schedules={s['id']:s for s in project['schedules']}
    status='COMPLETE' if report['complete'] else 'INCOMPLETE'
    out=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cron Schedule Atlas report</title>',
         '<style>body{max-width:1100px;margin:40px auto;padding:0 20px;font:16px system-ui;color:#182c3c;background:#f5f4ee}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;border-bottom:1px solid #ccd4d6;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px}h2{margin-top:40px}.status{padding:18px;background:#fff0c7}a{color:#165a60}</style>',
         '<h1>'+e(project['title'])+'</h1><p class="status">'+status+' · Source integrity: '+e(report['source_integrity'])+' · '+e(report['reason'] or 'Entire interval searched')+'</p>',
         '<p>UTC interval: '+e(project['start'])+' ≤ t &lt; '+e(project['end'])+'</p>',
         '<p>'+e(report['policy']['warning'])+'</p><h2>Annotation</h2><pre>'+e(project['annotation'])+'</pre>',
         '<h2>Schedules and evaluation status</h2>']
    for s,r in zip(project['schedules'],report['results']):
        out.append('<h3>'+e(s['name'])+'</h3><pre>'+e(json.dumps({'schedule':s,'evaluation':r},indent=2,ensure_ascii=False))+'</pre>')
    out.append('<h2>Occurrence table</h2><p>Simultaneous means matching the same UTC instant, not execution overlap.</p><table><thead><tr><th>Schedule</th><th>UTC</th><th>Local / offset</th><th>Fold</th><th>Simultaneous</th></tr></thead><tbody>')
    for row in report['occurrences']:
        out.append('<tr>'+''.join('<td>'+e(x)+'</td>' for x in [schedules[row['schedule_id']]['name'],row['utc'],row['local']+' · '+row['timezone'],row['fold'],row['simultaneous']])+'</tr>')
    out.append('</tbody></table><h2>Policy, versions and limits</h2><pre>'+e(json.dumps({k:report[k] for k in ['policy','versions','limits']},indent=2))+'</pre><h2>Provenance — embedded source snapshots</h2>')
    for source in project['sources']:
        out.append('<pre>'+e(json.dumps(source,indent=2,ensure_ascii=False))+'</pre>')
    # The exact portable JSON is escaped inside a text element, never executable.
    out.append('<details><summary>Exact report JSON (copy to a .json file to reimport)</summary><pre id="report-json">'+e(json.dumps(report,ensure_ascii=False))+'</pre></details></html>')
    return ''.join(out)
