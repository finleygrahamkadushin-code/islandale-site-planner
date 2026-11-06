/**
 * Names in the exported model, as the Blender importer (tools/blender/islandale3d/importer.py)
 * and check_export.py read them. Pure.
 */

/** A scheme or plan title as a file slug: `C · Prow & Lantern` → `c-prow-lantern`. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'plan'
}

/** One plan object's node: `<name> #<id>`. */
export const nodeName = (o: { readonly name: string; readonly id: string }): string => `${o.name} #${o.id}`

export interface MeshNameParts {
  readonly part: string
  readonly mi?: number
  readonly ei?: number
  /** The mesh's index within its object. */
  readonly k: number
}

/** One drawn piece: `<node>|<part>|m<mi>|e<ei>|<k>`, with m and e left out when missing. */
export function meshName(node: string, { part, mi, ei, k }: MeshNameParts): string {
  const bits = [node, part]
  if (mi !== undefined) bits.push(`m${mi}`)
  if (ei !== undefined) bits.push(`e${ei}`)
  bits.push(String(k))
  return bits.join('|')
}
