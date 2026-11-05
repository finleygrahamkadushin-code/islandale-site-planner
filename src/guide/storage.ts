/** One remembered value per browser; quiet when storage is missing or blocked (tests, private windows). */
export function readSaved(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeSaved(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // blocked storage: the choice just isn't remembered
  }
}
