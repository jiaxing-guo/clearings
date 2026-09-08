/** Closed implementation language. These records contain no host code or imports. */
export type ProgramValue =
  null | boolean | number | string | ProgramValue[] | { [key: string]: ProgramValue };
export type ProgramType =
  | { kind: 'null' | 'boolean' | 'integer' | 'string' }
  | { kind: 'list'; element: ProgramType }
  | { kind: 'record'; fields: Record<string, ProgramType> };

export type ProgramExpression =
  | { kind: 'literal'; type: ProgramType; value: ProgramValue }
  | { kind: 'ref'; name: string }
  | { kind: 'record'; fields: { name: string; value: ProgramExpression }[] }
  | { kind: 'field'; record: ProgramExpression; name: string }
  | { kind: 'list'; element_type: ProgramType; items: ProgramExpression[] }
  | { kind: 'index'; list: ProgramExpression; index: ProgramExpression }
  | { kind: 'length' | 'sort'; list: ProgramExpression }
  | { kind: 'append' | 'contains'; list: ProgramExpression; value: ProgramExpression }
  | { kind: 'not'; value: ProgramExpression }
  | {
      kind: 'binary';
      op: 'add' | 'sub' | 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'and' | 'or';
      left: ProgramExpression;
      right: ProgramExpression;
    }
  | { kind: 'call'; function_id: string; arguments: ProgramExpression[] };

export type ProgramStatement =
  | { kind: 'let' | 'var'; name: string; type: ProgramType; value: ProgramExpression }
  | { kind: 'assign'; name: string; value: ProgramExpression }
  | { kind: 'if'; condition: ProgramExpression; then: ProgramStatement[]; else: ProgramStatement[] }
  | { kind: 'while'; condition: ProgramExpression; body: ProgramStatement[] }
  | { kind: 'return'; value: ProgramExpression }
  | { kind: 'fail'; code: string; details: ProgramExpression };

export interface ProgramFunction {
  id: string;
  parameters: { name: string; type: ProgramType }[];
  returns: ProgramType;
  failures: { code: string; details: ProgramType }[];
  body: ProgramStatement[];
}
export interface Program {
  schema_version: '0.1.0';
  kind: 'program';
  artifact_id: string;
  name: string;
  entry_function: string;
  functions: ProgramFunction[];
}
