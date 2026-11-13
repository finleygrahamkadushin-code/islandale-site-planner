import { create } from 'zustand'

/** A request to fly the camera to one object (F, or "Fly to" in command search); `n` makes a repeat request fly again. View state. */
export const useFocusRequest = create<{ readonly request: { readonly id: string; readonly n: number } | null; readonly flyTo: (id: string) => void }>((set, get) => ({
  request: null,
  flyTo: (id) => set({ request: { id, n: (get().request?.n ?? 0) + 1 } }),
}))

type SitePoint = { readonly x: number; readonly n: number }

/** Reads the point the camera orbits (the orbit target) as a site point; set by CameraRig while the view is up. */
let viewCentreSource: (() => SitePoint | null) | null = null

/** CameraRig registers how to read the view's centre (null when it goes away); tests set their own. */
export function setViewCentreSource(source: (() => SitePoint | null) | null): void {
  viewCentreSource = source
}

/** The site point the view looks at, where keyboard placing starts the ghost (R10.1); null with no view. */
export function viewCentre(): SitePoint | null {
  return viewCentreSource?.() ?? null
}
