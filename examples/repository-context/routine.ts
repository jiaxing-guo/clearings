export default async function (input: { root: string; paths: string[] }) {
  const paths = [...new Set(input.paths)];
  if (paths.length > 20)
    return {
      status: 'needs_agent',
      reason: 'Choose at most 20 context files',
      context: { count: paths.length },
    };
  const files: { path: string; text: string }[] = [];
  for (const path of paths) {
    const file = await clearings.call('files.read', { root: input.root, path });
    files.push({ path, text: file.text });
  }
  return { status: 'completed', output: files };
}
