import { PROGRAM_EXECUTION_DEFAULT_LIMITS, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';

// Keep test-input encoding independent of the compiler's literal emitter.
function rustCodeUnits(text) {
  return `vec![${Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).join(',')}]`;
}

function rustOwnedValue(value) {
  if (value === null) return 'OwnedValue::Null';
  switch (typeof value) {
    case 'boolean':
      return `OwnedValue::Boolean(${value})`;
    case 'number':
      if (!Number.isSafeInteger(value))
        throw new Error('Test arguments require portable integers.');
      return `OwnedValue::Integer(${value})`;
    case 'string':
      return `OwnedValue::String(${rustCodeUnits(value)})`;
    default:
      if (Array.isArray(value))
        return `OwnedValue::List(vec![${value.map(rustOwnedValue).join(',')}])`;
      return `OwnedValue::Record(vec![${Object.entries(value)
        .map(([key, field]) => `(${rustCodeUnits(key)},${rustOwnedValue(field)})`)
        .join(',')}])`;
  }
}

function nativeCaseSource({ program = 0, args, limits = {} }, index, programCount) {
  if (!Number.isInteger(program) || program < 0 || program >= programCount)
    throw new Error('Invalid test program index.');
  const resolvedLimits = { ...PROGRAM_EXECUTION_DEFAULT_LIMITS, ...limits };
  if (
    Object.keys(resolvedLimits).length !== 4 ||
    Object.entries(resolvedLimits).some(
      ([resource, limit]) =>
        !Number.isSafeInteger(limit) || limit < 1 || limit > PROGRAM_EXECUTION_MAX_LIMITS[resource],
    )
  )
    throw new Error('Invalid test limits.');
  const argumentsSource = args.map(rustOwnedValue).join(',');
  const limitsSource = Object.entries(resolvedLimits)
    .map(([resource, limit]) => `${resource}: ${limit}`)
    .join(',');
  return [
    `fn case_${index}() -> (String, u128) {`,
    `let args = vec![${argumentsSource}];`,
    `let limits = Limits { ${limitsSource} };`,
    'let start = std::time::Instant::now();',
    `let result = program_${program}::execute(&args, limits);`,
    'let nanos = start.elapsed().as_nanos();',
    'let output = match result {',
    'Ok(result) => support::execution(result.limits, result.usage, &result.completion),',
    `Err(program_${program}::ExecutionError::Input(error)) => support::input_error(&error),`,
    'Err(error) => panic!("Host failure: {error:?}"),',
    '};',
    '(output, nanos)',
    '}\n',
  ].join('\n');
}

/** Render authored fixed inputs; the harness owns batch bounds and process execution. */
export function nativeTestSource(programCount, cases, repeat) {
  let source = 'use clearings_runtime::*;\nmod support;\n';
  source += Array.from({ length: programCount }, (_, index) => `mod program_${index};\n`).join('');
  cases.forEach((testCase, index) => {
    source += nativeCaseSource(testCase, index, programCount);
    if (Buffer.byteLength(source) > 8 * 1024 * 1024)
      throw new Error('Native test harness exceeds 8 MiB.');
  });
  source += `fn main() {\nlet mut nanos = 0u128;\nfor iteration in 0..${repeat} {\n`;
  source += cases
    .map((_, index) =>
      [
        `let (output, elapsed) = case_${index}();`,
        'nanos += elapsed;',
        'if iteration == 0 { println!("{output}"); }\n',
      ].join('\n'),
    )
    .join('');
  return source + '}\neprintln!("{nanos}");\n}\n';
}
