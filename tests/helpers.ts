import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { h, nextTick } from 'vue'
import type { DefineComponent } from 'vue'
import Sortable from '../src/components/Sortable.vue'
import type { SortableDefaultSlotProps, SortableProps } from '../src/types'

export type Item = {
  id: string
  label: string
}

export type Box = {
  height: number
  left: number
  top: number
  width: number
}

/** How a list's children are laid out, in DOM order, from the corner of its root. */
export type ListGeometry = {
  root: Box
  direction: 'column' | 'row'
  size: { width: number, height: number }
  gap?: number
  /** Wraps a row after this many children. */
  columns?: number
}

// `Sortable` is a generic SFC; pin its props to `Item` so `props('modelValue')` stays typed.
export const SortableForItems = Sortable as unknown as DefineComponent<SortableProps<Item>>

export type MountedSortable = ReturnType<typeof mount<typeof SortableForItems>>

const geometries = new Map<Element, ListGeometry>()
const boxes = new Map<Element, Box>()

function rectFrom(box: Box): DOMRect {
  return {
    bottom: box.top + box.height,
    height: box.height,
    left: box.left,
    right: box.left + box.width,
    top: box.top,
    width: box.width,
    x: box.left,
    y: box.top,
    toJSON: () => ({}),
  } as DOMRect
}

/**
 * Gives every element a rect computed when it is read: a root registered with `layoutList` has its box and its
 * list's children (items and placeholder alike) take one slot each in DOM order, as a flex container would lay
 * them out; `placeBox` pins any other element. Everything else is empty. Call in `beforeEach`.
 */
export function installLayout() {
  geometries.clear()
  boxes.clear()

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const own = geometries.get(this)?.root ?? boxes.get(this)
    if (own) return rectFrom(own)

    const list = this.parentElement
    const root = list?.closest('[data-vuesortable-root]')
    const geometry = root ? geometries.get(root) : undefined
    if (!list || !geometry || !list.hasAttribute('data-vuesortable-list')) {
      return rectFrom({ height: 0, left: 0, top: 0, width: 0 })
    }

    const slot = Array.from(list.children).indexOf(this)
    const gap = geometry.gap ?? 0
    const column = geometry.direction === 'row' ? slot % (geometry.columns ?? Infinity) : 0
    const line = geometry.direction === 'row' ? Math.floor(slot / (geometry.columns ?? Infinity)) : slot

    return rectFrom({
      ...geometry.size,
      left: geometry.root.left + column * (geometry.size.width + gap),
      top: geometry.root.top + line * (geometry.size.height + gap),
    })
  })
}

export function layoutList(wrapper: MountedSortable, geometry: ListGeometry) {
  geometries.set(wrapper.get('[data-vuesortable-root]').element, geometry)
}

export function placeBox(element: Element, box: Box) {
  boxes.set(element, box)
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new MouseEvent(type, { bubbles: true, button: 0, cancelable: true, clientX, clientY })
}

export async function press(element: Element, clientX: number, clientY: number) {
  element.dispatchEvent(pointerEvent('pointerdown', clientX, clientY))
  await nextTick()
}

export async function dragTo(clientX: number, clientY: number) {
  document.dispatchEvent(pointerEvent('pointermove', clientX, clientY))
  await nextTick()
}

export async function release(clientX: number, clientY: number) {
  document.dispatchEvent(pointerEvent('pointerup', clientX, clientY))
  await nextTick()
}

export function items(...ids: string[]): Item[] {
  return ids.map(id => ({ id, label: id }))
}

export function itemOf(wrapper: MountedSortable, key: string) {
  return wrapper.get(`[data-vuesortable-item-key="${key}"]`).element
}

/** The list's children in DOM order: an item's key, or the dragged key in brackets for the placeholder. */
export function orderOf(wrapper: MountedSortable) {
  return Array.from(wrapper.get('[data-vuesortable-list]').element.children).map((element) => {
    const placeholder = element.getAttribute('data-vuesortable-placeholder')
    return placeholder === null ? element.getAttribute('data-vuesortable-item-key') : `(${placeholder})`
  })
}

export function overlayStyle(wrapper: { find: MountedSortable['find'] }) {
  return wrapper.find('[data-vuesortable-overlay]').attributes('style') ?? ''
}

/** Mounts a list as a template would render it: keyed items, the placeholder and the overlay. */
export function mountList(
  model: Item[],
  options: {
    host?: HTMLElement
    props?: Partial<SortableProps<Item>>
    geometry?: ListGeometry
    onSlot?: (slotProps: SortableDefaultSlotProps<Item>) => void
  } = {},
) {
  let wrapper!: MountedSortable

  wrapper = mount(SortableForItems, {
    attachTo: options.host ?? document.body,
    props: {
      'itemKey': 'id',
      'modelValue': model,
      'motion': false,
      'onUpdate:modelValue': (value: Item[]) => wrapper.setProps({ modelValue: value }),
      ...options.props,
    },
    slots: {
      default: (slotProps: SortableDefaultSlotProps<Item>) => {
        options.onSlot?.(slotProps)

        return [
          h('div', slotProps.listAttrs, slotProps.entries.map((entry) => {
            if (entry.type === 'placeholder') {
              const placeholder = slotProps.getPlaceholderAttrs(entry)
              return h('div', { ...placeholder.attrs, key: entry.key, style: placeholder.style })
            }

            return h('div', { ...slotProps.getItemAttrs(entry).attrs, key: entry.key }, entry.element.label)
          })),
          slotProps.overlay
            ? h('div', { ...slotProps.overlay.attrs, style: slotProps.overlay.style }, slotProps.overlay.element.label)
            : null,
        ]
      },
    },
  })

  if (options.geometry) layoutList(wrapper, options.geometry)
  return wrapper
}
