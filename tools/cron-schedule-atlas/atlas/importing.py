"""Data-only imports: GitHub workflow YAML or user crontab. Commands stay inert."""
import hashlib
import json
import re
import uuid
import yaml
from .engine import Cron, Invalid, Unsupported, LIMITS, normalize


class UniqueLoader(yaml.BaseLoader):
    def construct_mapping(self, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise Invalid('YAML mapping keys must be scalar strings')
            if key in mapping:
                raise Invalid('Duplicate YAML key: ' + key)
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def record(expression, name, zone, source_id='', locator='', error=''):
    status, message = 'supported', ''
    try:
        if error: raise Invalid(error)
        Cron(expression)
    except Unsupported as exc: status,message='unsupported',str(exc)
    except Invalid as exc: status,message='failed',str(exc)
    return {'id':uuid.uuid4().hex,'name':name[:256],'expression':expression[:256], 'timezone':zone, 'original_expression':expression[:256], 'original_timezone':zone,'source_id':source_id,'source_locator':locator,'annotation':'','import_status':status,'import_message':message}


def parse_content(content, fmt, source_id, name):
    records=[]
    if fmt == 'workflow':
        # BaseLoader retains "on" as a string; disable aliases and tags before loading.
        try:
            depth = 0
            for token in yaml.scan(content):
                if isinstance(token,(yaml.tokens.AliasToken,yaml.tokens.AnchorToken,yaml.tokens.TagToken)):
                    raise Invalid('YAML aliases, anchors and tags are not supported')
                if isinstance(token,(yaml.tokens.BlockMappingStartToken,yaml.tokens.BlockSequenceStartToken,yaml.tokens.FlowMappingStartToken,yaml.tokens.FlowSequenceStartToken)):
                    depth += 1
                    if depth > 32:raise Invalid('YAML nesting limit: 32')
                if isinstance(token,(yaml.tokens.BlockEndToken,yaml.tokens.FlowMappingEndToken,yaml.tokens.FlowSequenceEndToken)): depth -= 1
            data=yaml.load(content, Loader=UniqueLoader)
        except yaml.YAMLError as exc: raise Invalid('Malformed YAML: '+str(exc)[:300]) from None
        if not isinstance(data,dict): raise Invalid('Workflow must be a YAML mapping')
        on=data.get('on')
        if not isinstance(on,dict): raise Invalid('Workflow requires on.schedule')
        entries=on.get('schedule')
        if not isinstance(entries,list) or not entries: raise Invalid('on.schedule must be a nonempty list')
        if len(entries)>LIMITS['schedules']:raise Invalid('Import exceeds 24 schedules; nothing imported')
        for i, entry in enumerate(entries):
            expression=entry.get('cron','') if isinstance(entry,dict) else ''
            zone=entry.get('timezone','UTC') if isinstance(entry,dict) else 'UTC'
            error='' if isinstance(expression,str) and expression else 'Missing scalar cron expression'
            if not isinstance(zone,str): zone='';error='Invalid timezone setting'
            if isinstance(entry,dict) and set(entry)-{'cron','timezone'}:error='Unsupported schedule entry keys'
            if not isinstance(expression,str):expression=''
            if len(expression)>256:error='Expression exceeds 256 characters'
            records.append(record(expression,name+' #'+str(i+1),zone,source_id,'on.schedule['+str(i)+']',error))
    elif fmt == 'crontab':
        zone=''
        for lineno,line in enumerate(content.splitlines(),1):
            line=line.strip()
            if not line or line.startswith('#'): continue
            env=re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)',line)
            if env:
                if env[1]=='CRON_TZ':zone=env[2].strip('\'"')
                continue
            parts=line.split()
            expression=' '.join(parts[:5]) if not line.startswith('@') else parts[0]
            error='' if len(parts)>=6 or line.startswith('@') else 'Expected five fields followed by an inert command'
            records.append(record(expression,name+' line '+str(lineno),zone,source_id,'line '+str(lineno),error))
            if len(records)>LIMITS['schedules']:raise Invalid('Import exceeds 24 schedules; nothing imported')
        if not records:raise Invalid('No schedule lines found')
    else: raise Invalid('Choose workflow or crontab import format')
    return records


def import_source(payload):
    content=payload.get('content')
    if not isinstance(content,str) or len(content.encode())>LIMITS['source_bytes']:raise Invalid('Source must be UTF-8 text, at most 128 KiB')
    fmt=payload.get('format')
    name=payload.get('name','Imported source')
    if not isinstance(name,str) or len(name)>256:raise Invalid('Invalid source name')
    sid=uuid.uuid4().hex
    source={'id':sid,'name':name,'content':content,'format':fmt,'sha256':hashlib.sha256(content.encode()).hexdigest()}
    for key in ['url','revision','license','license_url']:
        value=payload.get(key,'')
        if not isinstance(value,str) or len(value)>2048:raise Invalid('Invalid source metadata')
        source[key]=value
    return {'source':source,'schedules':parse_content(content,fmt,sid,name)}


def load_project(payload):
    if payload.get('schema')=='atlas-report-v1': payload=payload.get('project')
    return normalize(payload)
