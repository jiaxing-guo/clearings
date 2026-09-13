export default async function (input: { root: string; path: string }) {
  const { text } = await clearings.call('files.read', input);
  const groups = new Map<string, { level: string; message: string; count: number }>();
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > 5000)
    return {
      status: 'needs_agent',
      reason: 'Log sample is too large',
      context: { lines: lines.length },
    };
  for (let index = 0; index < lines.length; index++) {
    let row: { level?: unknown; message?: unknown };
    try {
      row = JSON.parse(lines[index]);
    } catch {
      return {
        status: 'needs_agent',
        reason: 'Invalid log record',
        context: { record: index + 1 },
      };
    }
    if (!row || typeof row.level !== 'string' || typeof row.message !== 'string') {
      return {
        status: 'needs_agent',
        reason: 'Unsupported log shape',
        context: { record: index + 1 },
      };
    }
    const key = JSON.stringify([row.level, row.message]);
    const group = groups.get(key) ?? { level: row.level, message: row.message, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  const output = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
  return { status: 'completed', output };
}
