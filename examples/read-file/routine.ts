export default async function (input: { root: string; path: string }) {
  const { text } = await clearings.call('files.read', input);
  return { status: 'completed', output: text.trim() };
}
