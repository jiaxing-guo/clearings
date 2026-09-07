"""Generate closed evaluation-artifact schemas; reuse the v0.3 value domains."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'schemas/specification.v0.3.json').read_text())
TEXT = {'type': 'string', 'minLength': 1}
ID = {'type': 'string', 'pattern': r'^[a-zA-Z][a-zA-Z0-9_.:/-]*$'}
HASH = {'type': 'string', 'pattern': '^[a-f0-9]{64}$'}
GIT = {'type': 'string', 'pattern': '^([a-f0-9]{40}|[a-f0-9]{64})$'}
PATH = {'type': 'string', 'pattern': r'^(?!/)(?!.*(?:^|/)\.\.?(/|$))(?!.*//)[^\\\x00]+$'}


def obj(properties, optional=()):
    return {'type': 'object', 'additionalProperties': False,
            'required': [key for key in properties if key not in optional], 'properties': properties}


def array(items, minimum=0, unique=False):
    return {'type': 'array', 'items': items, 'minItems': minimum, **({'uniqueItems': True} if unique else {})}


def enum(*values):
    return {'enum': list(values)}


def ref(name):
    return {'$ref': '#/definitions/' + name}


def artifact(kind, properties):
    return obj({'schema_version': enum('0.1.0'), 'kind': enum(kind),
                'artifact_id': {'type': 'string', 'pattern': '^' + kind + ':[a-f0-9]{64}$'}, **properties})


measurement = obj({'id': ID, 'description': TEXT,
                   'source': enum('arguments-before', 'arguments-after', 'return', 'exception', 'independent', 'instrumentation'),
                   'type': ref('ValueType'), 'procedure': TEXT})
verification = {'oneOf': [obj({'kind': enum('predicate'), 'rule_ids': array(ID, 1, True)}),
                           obj({'kind': enum('independent-check'), 'check_id': ID}),
                           obj({'kind': enum('unresolved'), 'reason': TEXT})]}
profile = artifact('conformance-profile', {
    'name': TEXT, 'specification_id': {'type': 'string', 'pattern': '^specification:[a-f0-9]{64}$'},
    'target': obj({'module': PATH, 'export': ID}),
    'scope': obj({'input_domain': array(TEXT, 1), 'requirements': array(ID, 1, True), 'exclusions': array(TEXT, 1)}),
    'completion_operations': obj({'return': ID, 'throw': ID}),
    'measurements': array(measurement, 1),
    'obligations': array(obj({'id': ID, 'requirement': TEXT, 'operation_ids': array(ID, 1, True),
                             'rule_ids': array(ID, 1, True), 'measurement_ids': array(ID, 1, True),
                             'mandatory': {'type': 'boolean'}, 'verification': verification, 'limitation': TEXT}), 1),
})
capture = {'oneOf': [obj({'status': enum('captured'), 'value': ref('JsonValue')}),
                     obj({'status': enum('unavailable'), 'reason': TEXT})]}
content_identity = obj({'name': TEXT, 'sha256': HASH})
unavailable = obj({'status': enum('unavailable'), 'reason': TEXT})
component = {'oneOf': [obj({'status': enum('bound'), 'name': TEXT, 'sha256': HASH}), unavailable]}
record = artifact('execution-record', {
    'origin': enum('recorded-execution', 'authored-example'),
    'profile_id': {'type': 'string', 'pattern': '^conformance-profile:[a-f0-9]{64}$'},
    'specification_id': {'type': 'string', 'pattern': '^specification:[a-f0-9]{64}$'},
    'case_id': ID,
    'identities': obj({
        'implementation': obj({'repository': TEXT, 'commit': GIT, 'tree': GIT, 'module': PATH, 'export': ID,
                               'files': array(obj({'path': PATH, 'sha256': HASH}), 1)}),
        'adapter': component, 'evaluator': component, 'fixture': content_identity,
        'runtime': {'oneOf': [obj({'status': enum('bound'), 'name': TEXT, 'version': TEXT, 'platform': TEXT, 'architecture': TEXT, 'lockfile_sha256': HASH}), unavailable]},
    }),
    'arguments_before': ref('JsonValue'), 'arguments_after': ref('CapturedValue'),
    'completion': {'oneOf': [
        obj({'kind': enum('return'), 'result': ref('CapturedValue')}),
        obj({'kind': enum('throw'), 'thrown': ref('CapturedValue')}),
        obj({'kind': enum('timeout'), 'limit_ms': {'type': 'integer', 'minimum': 1, 'maximum': 9007199254740991}}),
        obj({'kind': enum('harness-failure'), 'phase': enum('prepare', 'invoke', 'capture'), 'message': TEXT}),
    ]},
    'measurements': array({'oneOf': [obj({'id': ID, 'status': enum('observed'), 'value': ref('JsonValue')}),
                                     obj({'id': ID, 'status': enum('unobserved'), 'reason': TEXT})]}, 1),
    'limitations': array(TEXT, 1),
})
for name, schema in [('conformance-profile', profile), ('execution-record', record)]:
    definitions = {key: SPEC['definitions'][key] for key in ['JsonValue', 'ValueType']}
    if name == 'execution-record':
        definitions['CapturedValue'] = capture
    document = {'$schema': 'http://json-schema.org/draft-07/schema#',
                '$id': f'https://clearings.dev/schemas/{name}.v0.1.json', **schema, 'definitions': definitions}
    (ROOT / f'schemas/{name}.v0.1.json').write_text(json.dumps(document, indent=2) + '\n')
