/** The PNG snapshot's file name (4D): the view's name and the date, `islandale-golden-hour-2026-11-05.png`. */
export function snapshotName(viewLabel: string | null, date: Date): string {
  const slug = (viewLabel ?? 'view')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `islandale-${slug || 'view'}-${y}-${m}-${d}.png`
}

/** Save a blob as a file through a temporary link. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
