export function makeId(prefix: string): string {
  const rand = Math.random().toString(16).slice(2)
  return `${prefix}_${Date.now().toString(16)}_${rand}`
}

export function makeUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback (not RFC4122 perfect, but sufficient for local-only usage)
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`
}
