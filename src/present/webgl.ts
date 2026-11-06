/**
 * Can this browser draw the 3D view (4D)? WebGL 2 is what three.js needs.
 * `make` is for tests; it defaults to a fresh canvas.
 */
export function hasWebGL2(make: () => { getContext: (kind: string) => unknown } = () => document.createElement('canvas')): boolean {
  try {
    return Boolean(make().getContext('webgl2'))
  } catch {
    return false
  }
}
