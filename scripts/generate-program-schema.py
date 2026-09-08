"""Generate the standalone, closed Program IR schema. No historical schemas are modified."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ID = {'type': 'string', 'pattern': r'^[A-Za-z_][A-Za-z0-9_]*$'}


def obj(properties):
    return {'type': 'object', 'additionalProperties': False,
            'required': list(properties), 'properties': properties}


def ref(name):
    return {'$ref': '#/definitions/' + name}


def array(items, **limits):
    return {'type': 'array', 'items': items, **limits}


def tag(kinds, **properties):
    return obj({'kind': {'enum': kinds.split('|')}, **properties})


value = {'anyOf': [{'type': ['null', 'boolean', 'string']},
                   {'type': 'integer', 'minimum': -9007199254740991, 'maximum': 9007199254740991},
                   array(ref('ProgramValue')),
                   {'type': 'object', 'additionalProperties': ref('ProgramValue')}]}
types = {'oneOf': [tag('null|boolean|integer|string'), tag('list', element=ref('ProgramType')),
                   tag('record', fields={'type': 'object', 'propertyNames': ID, 'additionalProperties': ref('ProgramType')})]}
expr = ref('ProgramExpression')
statement = ref('ProgramStatement')
expressions = {'oneOf': [
    tag('literal', type=ref('ProgramType'), value=ref('ProgramValue')),
    tag('ref', name=ID),
    tag('record', fields=array(obj({'name': ID, 'value': expr}))),
    tag('field', record=expr, name=ID),
    tag('list', element_type=ref('ProgramType'), items=array(expr)),
    tag('index', list=expr, index=expr),
    tag('length|sort', list=expr),
    tag('append|contains', list=expr, value=expr),
    tag('not', value=expr),
    tag('binary', op={'enum': ['add', 'sub', 'eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'and', 'or']}, left=expr, right=expr),
    tag('call', function_id=ID, arguments=array(expr, maxItems=64)),
]}
statements = {'oneOf': [
    tag('let|var', name=ID, type=ref('ProgramType'), value=expr),
    tag('assign', name=ID, value=expr),
    tag('if', condition=expr, then=array(statement), **{'else': array(statement)}),
    tag('while', condition=expr, body=array(statement)),
    tag('return', value=expr),
    tag('fail', code=ID, details=expr),
]}
function = obj({'id': ID, 'parameters': array(obj({'name': ID, 'type': ref('ProgramType')}), maxItems=64),
                'returns': ref('ProgramType'),
                'failures': array(obj({'code': ID, 'details': ref('ProgramType')}), maxItems=64),
                'body': array(statement, minItems=1)})
program = obj({'schema_version': {'const': '0.1.0'}, 'kind': {'const': 'program'},
               'artifact_id': {'type': 'string', 'pattern': '^program:[a-f0-9]{64}$'},
               'name': {'type': 'string', 'minLength': 1}, 'entry_function': ID,
               'functions': array(ref('ProgramFunction'), minItems=1, maxItems=128)})
document = {'$schema': 'http://json-schema.org/draft-07/schema#',
            '$id': 'https://clearings.dev/schemas/program.v0.1.json', **program,
            'definitions': {'ProgramValue': value, 'ProgramType': types, 'ProgramExpression': expressions,
                            'ProgramStatement': statements, 'ProgramFunction': function}}
(ROOT / 'schemas/program.v0.1.json').write_text(json.dumps(document, indent=2) + '\n')
