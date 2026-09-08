import type { Program, ProgramExpression, ProgramStatement, ProgramType } from './model.js';
import type { ProgramExecutionResult } from './execution.js';
import type { RustExecutionResult } from '../compiler/artifacts.js';
import { validateProgram } from './validate.js';

// A fence longer than any data backticks keeps authored strings inside the block.
function block(text: string, language = 'text'): string {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = '`'.repeat(length);
  return `${fence}${language}\n${text}\n${fence}\n`;
}
function json(value: unknown): string {
  return block(JSON.stringify(value, null, 2), 'json');
}

function typeName(type: ProgramType): string {
  switch (type.kind) {
    case 'list':
      return `list<${typeName(type.element)}>`;
    case 'record':
      return `{ ${Object.entries(type.fields)
        .map(([name, value]) => `${name}: ${typeName(value)}`)
        .join(', ')} }`;
    default:
      return type.kind;
  }
}
const operators = {
  add: '+',
  sub: '-',
  eq: '==',
  ne: '!=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  and: 'and',
  or: 'or',
} as const;

function expression(node: ProgramExpression): string {
  switch (node.kind) {
    case 'literal':
      return `literal<${typeName(node.type)}>(${JSON.stringify(node.value)})`;
    case 'ref':
      return node.name;
    case 'record':
      return `record { ${node.fields.map((field) => `${field.name}: ${expression(field.value)}`).join(', ')} }`;
    case 'field':
      return `(${expression(node.record)}).${node.name}`;
    case 'list':
      return `list<${typeName(node.element_type)}>[${node.items.map(expression).join(', ')}]`;
    case 'index':
      return `(${expression(node.list)})[${expression(node.index)}]`;
    case 'length':
    case 'sort':
      return `${node.kind}(${expression(node.list)})`;
    case 'append':
    case 'contains':
      return `${node.kind}(${expression(node.list)}, ${expression(node.value)})`;
    case 'not':
      return `(not ${expression(node.value)})`;
    case 'binary':
      return `(${expression(node.left)} ${operators[node.op]} ${expression(node.right)})`;
    case 'call':
      return `call ${node.function_id}(${node.arguments.map(expression).join(', ')})`;
  }
}

function statements(nodes: ProgramStatement[], depth: number): string[] {
  const indent = '  '.repeat(depth);
  return nodes.flatMap((node): string[] => {
    switch (node.kind) {
      case 'let':
      case 'var':
        return [
          `${indent}${node.kind} ${node.name}: ${typeName(node.type)} = ${expression(node.value)};`,
        ];
      case 'assign':
        return [`${indent}${node.name} = ${expression(node.value)};`];
      case 'return':
        return [`${indent}return ${expression(node.value)};`];
      case 'fail':
        return [`${indent}fail ${node.code}(${expression(node.details)});`];
      case 'if':
        return [
          `${indent}if ${expression(node.condition)} {`,
          ...statements(node.then, depth + 1),
          `${indent}} else {`,
          ...statements(node.else, depth + 1),
          `${indent}}`,
        ];
      case 'while':
        return [
          `${indent}while ${expression(node.condition)} {`,
          ...statements(node.body, depth + 1),
          `${indent}}`,
        ];
    }
  });
}

/** Validate and project every function into display notation; never execute it. */
export function renderProgram(program: Program): string {
  validateProgram(program);
  const lines = program.functions.flatMap((fn, index) => [
    `// /functions/${index}`,
    `function ${fn.id}(${fn.parameters.map((parameter) => `${parameter.name}: ${typeName(parameter.type)}`).join(', ')}) -> ${typeName(fn.returns)}`,
    ...(fn.failures.length
      ? [
          `  fails { ${fn.failures.map((failure) => `${failure.code}: ${typeName(failure.details)}`).join(', ')} }`,
        ]
      : []),
    '{',
    ...statements(fn.body, 1),
    '}',
    '',
  ]);
  return (
    '# Program inspection\n\n' +
    json({
      name: program.name,
      program_id: program.artifact_id,
      schema_version: program.schema_version,
      entry_function: program.entry_function,
    }) +
    '\nStatic validation passed. The listing is derived display notation; the JSON artifact is authoritative. Inspection does not execute the program.\n\n' +
    block(lines.join('\n').trimEnd())
  );
}

/** Format a fresh execution result. This does not validate saved execution evidence. */
export function renderProgramExecution(
  result: ProgramExecutionResult | RustExecutionResult,
): string {
  const completion = result.completion;
  let output = `# Program execution\n\nCompletion: **${completion.kind}**.\n\n`;
  switch (completion.kind) {
    case 'return':
      output += 'Returned value:\n\n' + json(completion.value);
      break;
    case 'application-failure':
      output +=
        'Application failure:\n\n' + json({ code: completion.code, details: completion.details });
      break;
    case 'runtime-fault':
      output += 'Runtime fault:\n\n' + json({ code: completion.code, message: completion.message });
      break;
    case 'resource-exhaustion':
      output +=
        'Resource limit reached:\n\n' +
        json({ resource: completion.resource, limit: completion.limit });
      break;
  }
  if (completion.kind !== 'return')
    output +=
      '\nDiagnostic (JSON Pointer path and entry-to-current call stack):\n\n' +
      json(completion.diagnostic);
  output +=
    '\nExecution identity:\n\n' +
    json(
      'backend' in result
        ? {
            program_id: result.program_id,
            backend: result.backend,
            compiled_artifact_id: result.compiled_artifact_id,
            compiler_version: result.compiler_version,
            execution_semantics_version: result.execution_semantics_version,
            runtime: result.runtime,
            runner: result.runner,
          }
        : { program_id: result.program_id, interpreter_version: result.interpreter_version },
    );
  output += '\n| Resource | Measurement | Used | Limit |\n| --- | --- | ---: | ---: |\n';
  for (const resource of ['work', 'allocation_units', 'value_units', 'evaluation_depth'] as const) {
    output += `| ${resource} | ${resource === 'work' || resource === 'allocation_units' ? 'Cumulative' : 'Peak admitted'} | ${result.usage[resource]} | ${result.limits[resource]} |\n`;
  }
  return output;
}
