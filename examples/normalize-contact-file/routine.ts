async function normalize(input: { rows: { name?: unknown; email?: unknown }[] }) {
  const contacts = new Map<string, { name: string; email: string }>();
  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];
    if (typeof row.name !== 'string' || typeof row.email !== 'string') {
      return {
        status: 'needs_agent',
        reason: 'Missing contact fields',
        context: { row: index + 1 },
      };
    }
    const name = row.name.trim();
    const email = row.email.trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+$/.test(email))
      return {
        status: 'needs_agent',
        reason: 'Review contact fields',
        context: { row: index + 1 },
      };
    if (!contacts.has(email)) contacts.set(email, { name, email });
  }
  const output = [...contacts.values()].sort((a, b) =>
    a.email < b.email ? -1 : a.email > b.email ? 1 : 0,
  );
  return { status: 'completed', output };
}

export default async function (input: { root: string; path: string }) {
  let text: string;
  try {
    ({ text } = await clearings.call('files.read', input));
  } catch {
    return {
      status: 'needs_agent',
      reason: 'Contact document could not be read',
      context: { path: input.path },
    };
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { status: 'needs_agent', reason: 'Invalid contact JSON', context: { path: input.path } };
  }
  if (
    !document ||
    typeof document !== 'object' ||
    !('rows' in document) ||
    !Array.isArray(document.rows) ||
    document.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
  ) {
    return {
      status: 'needs_agent',
      reason: 'Unsupported contact document',
      context: { path: input.path },
    };
  }
  return normalize({ rows: document.rows });
}
