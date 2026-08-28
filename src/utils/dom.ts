export function canUseDOM() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function isElement(value: unknown): value is Element {
  return typeof Element !== 'undefined' && value instanceof Element
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

export function safeClosest(target: EventTarget | null, selector: string | undefined) {
  if (!selector || !isElement(target)) return null

  try {
    return target.closest(selector)
  }
  catch {
    return null
  }
}

/**
 * Bounding rect with the element's current transform TRANSLATION removed —
 * i.e. the element's resting layout position.
 *
 * List motion (FLIP) animates relocations through inline `translate3d`
 * transforms, and `getBoundingClientRect` includes in-flight transforms.
 * Feeding mid-flight positions into index resolution creates feedback loops:
 * a resolution during the ~150ms flight reads half-way geometry, computes a
 * different index, relocates the placeholder, starts new flights, and so on —
 * visible as chips flickering wildly (worst across row boundaries, where the
 * flights are longest). Every measurement that feeds placement math must use
 * this instead of the raw rect; only the FLIP capture itself wants visuals.
 */
export function getLayoutRect(element: Element): DOMRect {
  const rect = element.getBoundingClientRect()

  // List motion sets its transforms INLINE (first FLIP frame), so prefer the
  // inline value; mid-transition the inline transform is cleared and the
  // interpolated value only exists in the computed style.
  let transform = isHTMLElement(element) ? element.style.transform : ''
  if ((!transform || transform === 'none') && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    transform = window.getComputedStyle(element).transform
  }
  if (!transform || transform === 'none') return rect

  // Browsers compute transforms to matrix()/matrix3d(); the translate forms
  // cover environments that echo the inline value back (test DOMs).
  let translateX = 0
  let translateY = 0
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)
  const matrix2d = transform.match(/^matrix\((.+)\)$/)
  const translate = transform.match(/^translate(?:3d)?\(([^,)]+)(?:,([^,)]+))?/)
  if (matrix3d?.[1]) {
    const values = matrix3d[1].split(',')
    translateX = Number.parseFloat(values[12] ?? '0') || 0
    translateY = Number.parseFloat(values[13] ?? '0') || 0
  }
  else if (matrix2d?.[1]) {
    const values = matrix2d[1].split(',')
    translateX = Number.parseFloat(values[4] ?? '0') || 0
    translateY = Number.parseFloat(values[5] ?? '0') || 0
  }
  else if (translate) {
    translateX = Number.parseFloat(translate[1] ?? '0') || 0
    translateY = Number.parseFloat(translate[2] ?? '0') || 0
  }

  if (translateX === 0 && translateY === 0) return rect

  return {
    bottom: rect.bottom - translateY,
    height: rect.height,
    left: rect.left - translateX,
    right: rect.right - translateX,
    top: rect.top - translateY,
    width: rect.width,
    x: rect.x - translateX,
    y: rect.y - translateY,
    toJSON: () => ({}),
  } as DOMRect
}
