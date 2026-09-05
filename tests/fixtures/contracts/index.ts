// Unicode source prefix: π 中文 😀
export class ResponseState {
  private value: string | undefined
  finalized = false
  get response() { return this.value ?? 'empty' }
  set response(value: string) { this.value = value; this.finalized = true }
}

export function finish(state: ResponseState, result: string | undefined) {
  if (result !== undefined) state.response = result
  return state.response
}

export async function run(state: ResponseState, handler: () => Promise<string | undefined>) {
  const result = await handler()
  return finish(state, result)
}
