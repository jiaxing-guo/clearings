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
                   'capture_requirements': array(enum('arguments-before', 'arguments-after', 'return', 'exception'), unique=True),
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

# Native observations use a new record schema; keep the historical closed v0.1 schema unchanged.
import copy
native_record = copy.deepcopy(json.loads((ROOT / 'schemas/execution-record.v0.1.json').read_text()))
native_record['$id'] = 'https://clearings.dev/schemas/execution-record.v0.2.json'
native_record['properties']['schema_version'] = enum('0.2.0')
units = obj({name: {'type': 'integer', 'minimum': 0, 'maximum': 9007199254740991} for name in ['work','allocation_units','value_units','evaluation_depth']})
limits = copy.deepcopy(units)
for value in limits['properties'].values(): value['minimum'] = 1
native = obj({
    'status': enum('observed'), 'policy': enum('context-native-v1'),
    'program_id': {'type':'string','pattern':'^program:[a-f0-9]{64}$'},
    'compiled_artifact_id': {'type':'string','pattern':'^compiled-program:[a-f0-9]{64}$'},
    'compiler_version': TEXT, 'execution_semantics_version': TEXT,
    'runtime': obj({'abi_version':TEXT,'source_id':{'type':'string','pattern':'^rust-runtime:[a-f0-9]{64}$'}}),
    'runner': obj({'version':TEXT,'source_id':{'type':'string','pattern':'^rust-runner:[a-f0-9]{64}$'}}),
    'native': obj({'build_id':{'type':'string','pattern':'^native-build:[a-f0-9]{64}$'},'executable_sha256':HASH,'platform':TEXT,'architecture':TEXT}),
    'limits': limits, 'usage':units,
    'completion':enum('return','application-failure','runtime-fault','resource-exhaustion'),
})
native_record['properties']['native_execution'] = {'oneOf':[native,unavailable]}
native_record['required'].append('native_execution')
(ROOT / 'schemas/execution-record.v0.2.json').write_text(json.dumps(native_record,indent=2)+'\n')

# Ordered stage observations extend the record contract without reinterpreting v0.1/v0.2.
stage_record = copy.deepcopy(json.loads((ROOT / 'schemas/execution-record.v0.1.json').read_text()))
stage_record['$id'] = 'https://clearings.dev/schemas/execution-record.v0.3.json'
stage_record['properties']['schema_version'] = enum('0.3.0')
stage = enum('closure', 'selection')
stage_native = copy.deepcopy(native)
stage_native['properties'].update({'stage': stage, 'policy': enum('context-native-v2'),
    'arguments_sha256': HASH, 'result_sha256': HASH, 'result': ref('JsonValue')})
stage_native['required'] += ['stage', 'arguments_sha256', 'result_sha256', 'result']
stage_capture = {'oneOf': [stage_native,
    obj({'stage': stage, 'status': enum('not-run'), 'reason': TEXT}),
    obj({'stage': stage, 'status': enum('unavailable'), 'reason': TEXT, 'arguments_sha256': HASH}, ['arguments_sha256'])]}
program_binding = {'oneOf': [obj({'stage': stage, 'status': enum('bound'), 'path': PATH,
    'sha256': HASH, 'program_id': {'type':'string','pattern':'^program:[a-f0-9]{64}$'}}),
    obj({'stage': stage, 'status': enum('unavailable'), 'reason': TEXT})]}
stage_record['properties'].update({
    'native_stages': {**array(stage_capture, 2), 'maxItems': 2},
    'native_programs': {**array(program_binding, 2), 'maxItems': 2},
    'native_stage_errors': {**array(TEXT), 'maxItems': 8},
})
stage_record['required'] += ['native_stages', 'native_programs', 'native_stage_errors']
(ROOT / 'schemas/execution-record.v0.3.json').write_text(json.dumps(stage_record, indent=2)+'\n')
