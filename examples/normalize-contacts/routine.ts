export default async function (input: { rows: { name?: unknown; email?: unknown }[] }) {
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
