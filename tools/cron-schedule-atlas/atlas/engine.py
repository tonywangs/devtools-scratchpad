"""Bounded wall-time candidate engine. Never executes schedule payloads."""
import calendar
import hashlib
import importlib.metadata
import json
import platform
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, TZPATH

VERSION = '1.0.0'
UTC = timezone.utc
LIMITS = {'days': 366, 'schedules': 24, 'occurrences': 10000, 'seconds': 8, 'source_bytes': 131072, 'request_bytes': 1048576}
POLICY = {'dialect': 'atlas-five-field-v1', 'day_fields': 'AND when either field starts with *; OR otherwise', 'gap': 'nonexistent wall minutes yield zero instants', 'fold': 'repeated wall minutes yield both distinct UTC instants', 'interval': '[start, end), minute-aligned UTC boundaries', 'warning': 'Simulation only: daemon and hosted scheduler behavior may differ; matching instants do not guarantee execution. No commands are executed.', 'calendar': 'proleptic Gregorian; no leap seconds; 2000–2100 UTC'}

class Invalid(ValueError):
    pass

class Unsupported(Invalid):
    pass


def field(raw, low, high):
    values = set()
    for part in raw.split(','):
        if not re.fullmatch(r'(?:\*|[0-9]+(?:-[0-9]+)?)(?:/[0-9]+)?', part):
            raise Invalid('Malformed field: ' + raw)
        base, *steps = part.split('/')
        step = int(steps[0]) if steps else 1
        if step < 1 or step > high - low + 1:
            raise Invalid('Step outside field width: ' + raw)
        if base == '*':
            a, b = low, high
        elif '-' in base:
            a, b = map(int, base.split('-'))
        else:
            a = b = int(base)
            if steps:
                raise Unsupported('Steps require * or a range, not a single value')
        if not low <= a <= b <= high:
            raise Invalid('Field value/range out of bounds: ' + raw)
        values.update(range(a, b + 1, step))
    return values


class Cron:
    def __init__(self, expression):
        if not isinstance(expression, str) or not 1 <= len(expression) <= 256:
            raise Invalid('Expression must be 1–256 characters')
        parts = expression.split()
        if len(parts) != 5:
            raise Unsupported('Exactly five fields required; no macros, seconds or year')
        if re.search(r'[A-Za-z@?#~]', expression):
            raise Unsupported('Names, macros, L/W/#/?, hashed and random extensions are unsupported')
        self.fields = [field(p, a, b) for p, (a, b) in zip(parts, [(0,59),(0,23),(1,31),(1,12),(0,7)])]
        self.fields[4] = {x % 7 for x in self.fields[4]}
        self.day_and = parts[2].startswith('*') or parts[4].startswith('*')

    def day_matches(self, day):
        dom, dow = day.day in self.fields[2], (day.weekday()+1)%7 in self.fields[4]
        return day.month in self.fields[3] and ((dom and dow) if self.day_and else (dom or dow))

    def impossible(self):
        # In OR mode a nonempty weekday set always permits a date. In AND
        # mode every valid month/day meets every weekday within 400 years.
        return self.day_and and not any(
            day <= calendar.monthrange(2000, month)[1]
            for month in self.fields[3] for day in self.fields[2]
        )



def instant(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, TypeError, AttributeError):
        raise Invalid('Interval requires ISO timestamps with UTC offset') from None
    if result.tzinfo is None or result.utcoffset() != timedelta(0) or result.second or result.microsecond:
        raise Invalid('Interval boundaries must be whole minutes in UTC (Z or +00:00)')
    if not 2000 <= result.year <= 2100:
        raise Invalid('Supported UTC years: 2000–2100')
    return result.astimezone(UTC)


def utcstr(value):
    return value.astimezone(UTC).isoformat().replace('+00:00','Z')


def text(value, label, length=256):
    if not isinstance(value, str) or len(value) > length:
        raise Invalid(f'{label} must be text of at most {length} characters')
    return value


def normalize(project):
    if not isinstance(project, dict) or project.get('schema') != 'atlas-project-v1':
        raise Invalid('Expected atlas-project-v1 project')
    start, end = instant(project.get('start')), instant(project.get('end'))
    if not start < end <= start + timedelta(days=LIMITS['days']):
        raise Invalid('Interval must be positive and at most 366 days')
    schedules = project.get('schedules')
    if not isinstance(schedules, list) or not 1 <= len(schedules) <= LIMITS['schedules']:
        raise Invalid('Project requires 1–24 schedules')
    sources = project.get('sources', [])
    if not isinstance(sources, list) or len(sources) > 24:
        raise Invalid('At most 24 source files')
    normalized_sources = []
    ids = set()
    for source in sources:
        if not isinstance(source, dict): raise Invalid('Invalid source')
        sid = text(source.get('id'), 'Source ID')
        if not sid or sid in ids: raise Invalid('Source IDs must be unique and nonempty')
        ids.add(sid)
        content = text(source.get('content'), 'Source content', LIMITS['source_bytes'])
        if len(content.encode()) > LIMITS['source_bytes']: raise Invalid('Source too large')
        digest = text(source.get('sha256'), 'SHA-256', 64)
        if not re.fullmatch('[a-f0-9]{64}', digest): raise Invalid('Invalid SHA-256')
        item = {k: text(source.get(k,''), k, 2048) for k in ['name','url','revision','license','license_url','format']}
        item.update(id=sid, content=content, sha256=digest, actual_sha256=hashlib.sha256(content.encode()).hexdigest())
        item['integrity'] = 'verified' if digest == item['actual_sha256'] else 'CHANGED'
        normalized_sources.append(item)
    cleaned = []
    ids = set()
    for schedule in schedules:
        if not isinstance(schedule, dict): raise Invalid('Invalid schedule')
        sid = text(schedule.get('id'), 'Schedule ID')
        if not sid or sid in ids: raise Invalid('Schedule IDs must be unique and nonempty')
        ids.add(sid)
        item = {k: text(schedule.get(k,''), k, 4096 if k=='annotation' else 256) for k in ['name','expression','timezone','annotation','source_id','original_expression','original_timezone','source_locator','import_status','import_message']}
        if item['source_id'] and item['source_id'] not in {s['id'] for s in normalized_sources}: raise Invalid('Missing referenced source')
        item['id'] = sid
        cleaned.append(item)
    return {'schema':'atlas-project-v1','title':text(project.get('title','Schedule comparison'),'Title'),'start':utcstr(start),'end':utcstr(end),'annotation':text(project.get('annotation',''),'Annotation',8192),'sources':normalized_sources,'schedules':cleaned}


def versions(zones):
    data = {'engine': VERSION, 'python': platform.python_version(), 'timezone_engine':'Python zoneinfo', 'tzdb':'unknown', 'zone_sha256':{}}
    for base in TZPATH:
        path = Path(base)/'tzdata.zi'
        if path.exists():
            data['tzdb'] = path.read_text().splitlines()[0].removeprefix('# version ')
            break
    for zone in zones:
        for base in TZPATH:
            path = Path(base)/zone
            if path.is_file():
                data['zone_sha256'][zone] = hashlib.sha256(path.read_bytes()).hexdigest()
                break
    return data


def evaluate(project, *, max_occurrences=None, seconds=None, cancelled=None):
    project = normalize(project)
    limit = min(max_occurrences if max_occurrences is not None else LIMITS['occurrences'], LIMITS['occurrences'])
    budget = min(seconds if seconds is not None else LIMITS['seconds'], LIMITS['seconds'])
    deadline = time.monotonic() + budget
    start, end = instant(project['start']), instant(project['end'])
    rows, results, zones = [], [], set()
    stop_reason = None
    for schedule in project['schedules']:
        result = {'id':schedule['id'], 'status':'supported', 'complete':False, 'count':0, 'message':''}
        results.append(result)
        try:
            if schedule['import_status'] in ['failed','unsupported']:
                exc = Unsupported if schedule['import_status']=='unsupported' else Invalid
                raise exc(schedule['import_message'] or 'Import could not identify this schedule')
            cron = Cron(schedule['expression'])
            try:
                zone = ZoneInfo(schedule['timezone'])
            except (ZoneInfoNotFoundError, ValueError):
                raise Invalid('Unknown IANA timezone: ' + schedule['timezone']) from None
            zones.add(zone.key)
        except Unsupported as exc:
            result.update(status='unsupported',message=str(exc));continue
        except Invalid as exc:
            result.update(status='failed',message=str(exc));continue
        if stop_reason:
            result['message'] = 'Not searched: ' + stop_reason;continue
        seen = set()
        # Enumerate local dates with a two-day UTC margin, then roundtrip candidate
        # wall minutes through both fold flags. This is deliberately unlike the oracle.
        day = (start - timedelta(days=2)).replace(tzinfo=None,hour=0,minute=0)
        final_day = (end + timedelta(days=2)).replace(tzinfo=None,hour=0,minute=0)
        while day <= final_day and not stop_reason:
            if time.monotonic() >= deadline or (cancelled and cancelled()):
                stop_reason = 'execution deadline or cancellation';break
            if cron.day_matches(day):
                for hour in sorted(cron.fields[1]):
                    for minute in sorted(cron.fields[0]):
                        if time.monotonic() >= deadline or (cancelled and cancelled()):
                            stop_reason = 'execution deadline or cancellation';break
                        wall = day.replace(hour=hour,minute=minute)
                        for fold in (0,1):
                            candidate = wall.replace(tzinfo=zone,fold=fold).astimezone(UTC)
                            local = candidate.astimezone(zone)
                            if local.replace(tzinfo=None) != wall or not start <= candidate < end or candidate in seen:
                                continue
                            if len(rows) >= limit:
                                stop_reason = 'occurrence limit';break
                            seen.add(candidate)
                            rows.append({'schedule_id':schedule['id'],'utc':utcstr(candidate),'local':local.isoformat(),'offset_seconds':int(local.utcoffset().total_seconds()),'fold':local.fold,'timezone':zone.key})
                            result['count'] += 1
                        if stop_reason:break
                    if stop_reason:break
            day += timedelta(days=1)
        result['complete'] = stop_reason is None
        result['message'] = stop_reason or ('calendar-impossible: no matching date in a 400-year Gregorian cycle' if not seen and cron.impossible() else 'no occurrences in the searched interval' if not seen else 'searched entire interval')
    rows.sort(key=lambda row:(row['utc'],row['schedule_id']))
    counts = {}
    for row in rows: counts[row['utc']] = counts.get(row['utc'],0)+1
    for row in rows: row['simultaneous'] = counts[row['utc']]
    complete = all(x['complete'] for x in results)
    return {'schema':'atlas-report-v1','project':project,'policy':POLICY,'versions':versions(zones),'limits':LIMITS,'complete':complete,'status':'complete' if complete else 'incomplete','reason':stop_reason or (None if complete else 'unsupported or failed schedules'),'source_integrity':'CHANGED' if any(s['integrity']=='CHANGED' for s in project['sources']) else 'verified','results':results,'occurrences':rows}
