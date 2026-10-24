"""Independent UTC-minute enumeration. No imports from atlas or production parser.
The parser is deliberately a membership predicate rather than a set expansion.
Shares the platform zoneinfo database (not an independent tzdb implementation).
"""
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo


def contains(token, value, lo, hi):
    for term in token.split(','):
        pieces=term.split('/')
        stride=int(pieces[1]) if len(pieces)==2 else 1
        span=pieces[0]
        if span=='*':first,last=lo,hi
        elif '-' in span:first,last=[int(x) for x in span.split('-')]
        else:first=last=int(span)
        if first<=value<=last and (value-first)%stride==0:return True
    return False


def enumerate_minutes(expression, zone, start, end):
    minute,hour,dom,month,dow=expression.split()
    t=datetime.fromisoformat(start.replace('Z','+00:00'))
    stop=datetime.fromisoformat(end.replace('Z','+00:00'))
    tz=ZoneInfo(zone)
    found=[]
    while t<stop:
        local=t.astimezone(tz)
        d=contains(dom,local.day,1,31)
        weekday=(local.weekday()+1)%7
        w=contains(dow,weekday,0,7) or (weekday==0 and contains(dow,7,0,7))
        days=(d and w) if dom[0]=='*' or dow[0]=='*' else (d or w)
        if days and contains(minute,local.minute,0,59) and contains(hour,local.hour,0,23) and contains(month,local.month,1,12):
            found.append(t.isoformat().replace('+00:00','Z'))
        t+=timedelta(minutes=1)
    return found
