import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import type { DefineComponent } from 'vue'
import Sortable from '../src/components/Sortable.vue'
import { getGroupedSortableEntries } from '../src/composables/useSortableList'
import type { SortableDefaultSlotProps, SortableProps } from '../src/types'

type Item = {
  id: string
  label: string
}

// `Sortable` is a generic SFC; pin its props to `Item` so wrapper helpers
// such as `props('modelValue')` stay typed.
const SortableForItems = Sortable as unknown as DefineComponent<SortableProps<Item>>

type MockItemRect = {
  height: number
  left?: number
  top: number
  width?: number
}

type MountedSortable = ReturnType<typeof mount<typeof SortableForItems>>

type SlotOptions = {
  itemClass?: string
  listContainerClass?: string
  listStyle?: Record<string, string>
  overlayClass?: string
}

function pointerEvent(type: string, options: MouseEventInit) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options,
  })
}

// Dispatch a real event instead of `trigger()`: @vue/test-utils assigns init keys
// such as `button` after construction, which throws on jsdom's getter-only props.
async function pointerDown(target: { element: Element }, options: MouseEventInit) {
  target.element.dispatchEvent(pointerEvent('pointerdown', options))
  await nextTick()
}

function rectFrom(input: { top: number, left: number, width: number, height: number }): DOMRect {
  return {
    bottom: input.top + input.height,
    height: input.height,
    left: input.left,
    right: input.left + input.width,
    top: input.top,
    width: input.width,
    x: input.left,
    y: input.top,
    toJSON: () => ({}),
  } as DOMRect
}

function renderDefaultSlot(options: SlotOptions = {}) {
  return (slotProps: SortableDefaultSlotProps<Item>) => {
    const list = h(
      'div',
      {
        ...slotProps.listAttrs,
        class: options.listContainerClass,
        style: options.listStyle,
      },
      slotProps.entries.map((entry) => {
        if (entry.type === 'placeholder') {
          const placeholder = slotProps.getPlaceholderAttrs(entry)

          return h('div', {
            ...placeholder.attrs,
            class: 'placeholder',
            style: placeholder.style,
          })
        }

        const item = slotProps.getItemAttrs(entry)

        return h(
          'div',
          {
            ...item.attrs,
            class: ['row', options.itemClass],
          },
          [
            h(
              'button',
              {
                ...slotProps.getHandleAttrs(entry),
                'data-test-handle': '',
                type: 'button',
              },
              'Grab',
            ),
            h('span', entry.element.label),
          ],
        )
      }),
    )

    const overlay = slotProps.overlay
      ? h(
          'div',
          {
            ...slotProps.overlay.attrs,
            class: ['overlay-row', options.overlayClass],
            style: slotProps.overlay.style,
          },
          slotProps.overlay.element.label,
        )
      : null

    return [list, overlay]
  }
}

function mockRootRect(wrapper: MountedSortable, rect: { top: number, left: number, width: number, height: number }) {
  const root = wrapper.get('[data-vuesortable-root]').element as HTMLElement
  root.getBoundingClientRect = () => rectFrom(rect)
}

function getSortableItemElement(wrapper: MountedSortable, key: string) {
  const item = wrapper
    .findAll('[data-vuesortable-item-key]')
    .find(candidate => (candidate.element as HTMLElement).dataset.vuesortableItemKey === key)

  if (!item) throw new Error(`Missing sortable item ${key}`)
  return item.element as HTMLElement
}

function mockItemRects(
  wrapper: MountedSortable,
  positions: Record<string, MockItemRect>,
  options: { onRead?: (key: string) => void } = {},
) {
  for (const [key, rect] of Object.entries(positions)) {
    const element = getSortableItemElement(wrapper, key)
    element.getBoundingClientRect = () => {
      options.onRead?.(key)
      const left = rect.left ?? 44
      const width = rect.width ?? 312

      return rectFrom({
        height: rect.height,
        left,
        top: rect.top,
        width,
      })
    }
  }
}

function mockItemRectSequences(wrapper: MountedSortable, positions: Record<string, MockItemRect[]>) {
  const reads = new Map<string, number>()

  for (const [key, rects] of Object.entries(positions)) {
    const element = getSortableItemElement(wrapper, key)
    element.getBoundingClientRect = () => {
      const readIndex = reads.get(key) ?? 0
      reads.set(key, readIndex + 1)

      const rect = rects[Math.min(readIndex, rects.length - 1)]
      if (!rect) throw new Error(`Missing mock rect for sortable item ${key}`)
      const left = rect.left ?? 44
      const width = rect.width ?? 312

      return rectFrom({
        height: rect.height,
        left,
        top: rect.top,
        width,
      })
    }
  }
}

// Browsers include CSS transforms in getBoundingClientRect; mirror that in
// the mocks so in-flight FLIP transforms are observable to the code under test.
function applyInlineTranslate(
  element: HTMLElement,
  box: { left: number, top: number, width: number, height: number },
) {
  const match = element.style.transform.match(/^translate(?:3d)?\(([^,)]+)(?:,([^,)]+))?/)
  if (!match) return box
  return {
    ...box,
    left: box.left + (Number.parseFloat(match[1] ?? '0') || 0),
    top: box.top + (Number.parseFloat(match[2] ?? '0') || 0),
  }
}

function mockFlowSlotRects(
  wrapper: MountedSortable,
  keys: string[],
  options: {
    baseLeft: number
    baseTop: number
    columns: number
    pitchX: number
    pitchY: number
    size: { width: number, height: number }
  },
) {
  // Simulates a live flex-wrap container: every list child (items and the
  // placeholder alike) occupies one fixed-size slot, laid out row by row in
  // current DOM order. Rects are computed at read time, so moving the
  // placeholder reflows the remaining items exactly like the browser would.
  const list = wrapper.get('[data-vuesortable-list]').element as HTMLElement

  const mockChild = (element: HTMLElement) => {
    element.getBoundingClientRect = () => {
      const slot = Array.from(list.children).indexOf(element)
      if (slot === -1) throw new Error('Sortable child is not in the list')

      return rectFrom(applyInlineTranslate(element, {
        height: options.size.height,
        left: options.baseLeft + (slot % options.columns) * options.pitchX,
        top: options.baseTop + Math.floor(slot / options.columns) * options.pitchY,
        width: options.size.width,
      }))
    }
  }

  for (const key of keys) {
    mockChild(getSortableItemElement(wrapper, key))
  }

  // The placeholder is created mid-drag; give it the same slot-based rect.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) mockChild(node as HTMLElement)
      })
    }
  }).observe(list, { childList: true })
}

// Simulates a live flex-wrap container with variable-width chips: children
// (items and the placeholder alike) are laid out in DOM order, wrapping when
// the next child would exceed the container width. Rects are computed at read
// time, so moving the placeholder reflows the remaining chips exactly like
// the browser would. Returns a refresh function that must be called after
// each re-render so newly created elements (the placeholder) are mocked too.
function mockFlowWrapRects(
  wrapper: MountedSortable,
  widths: Record<string, number>,
  options: {
    containerWidth: number
    gap: number
    root: { left: number, top: number }
    rowHeight: number
    rowPitch: number
  },
) {
  const list = wrapper.get('[data-vuesortable-list]').element as HTMLElement

  const computeBoxes = () => {
    const boxes = new Map<Element, { left: number, top: number, width: number, height: number }>()
    let x = 0
    let row = 0
    for (const child of Array.from(list.children)) {
      const key = child.getAttribute('data-vuesortable-item-key')
        ?? child.getAttribute('data-vuesortable-placeholder')
      if (!key) continue
      const width = child.hasAttribute('data-vuesortable-placeholder')
        ? Number.parseFloat((child as HTMLElement).style.width || '0')
        : widths[key] ?? 0
      if (x > 0 && x + width > options.containerWidth) {
        row += 1
        x = 0
      }
      boxes.set(child, {
        height: options.rowHeight,
        left: options.root.left + x,
        top: options.root.top + row * options.rowPitch,
        width,
      })
      x += width + options.gap
    }
    return boxes
  }

  const mockChild = (child: Element) => {
    (child as HTMLElement).getBoundingClientRect = () => {
      const box = computeBoxes().get(child)
      if (!box) throw new Error('Sortable child is not in the list')
      return rectFrom(applyInlineTranslate(child as HTMLElement, box))
    }
  }

  const refresh = () => {
    for (const child of Array.from(list.children)) mockChild(child)
  }
  refresh()
  return refresh
}

function listChildOrder(wrapper: MountedSortable) {
  return Array.from(wrapper.get('[data-vuesortable-list]').element.children).map(element =>
    element.getAttribute('data-vuesortable-item-key') ?? element.getAttribute('data-vuesortable-placeholder'),
  )
}

function mountSortable(
  items: Item[],
  options: {
    attachTo?: HTMLElement
    attrs?: Record<string, unknown>
    props?: Partial<SortableProps<Item>>
    slot?: SlotOptions
  } = {},
) {
  let wrapper!: MountedSortable

  wrapper = mount(SortableForItems, {
    props: {
      'modelValue': items,
      'itemKey': (item: Item) => item.id,
      'onUpdate:modelValue': (value: Item[]) => wrapper.setProps({ modelValue: value }),
      ...options.props,
    },
    attrs: options.attrs,
    attachTo: options.attachTo,
    slots: {
      default: renderDefaultSlot(options.slot),
    },
  })

  return wrapper
}

afterEach(() => {
  vi.useRealTimers()
  document.documentElement.removeAttribute('style')
  document.body.removeAttribute('style')
  document.body.innerHTML = ''
})

describe('Sortable', () => {
  it('renders the root and the user-owned default-slot list', () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    expect(wrapper.get('[data-vuesortable-root]').element).toBeTruthy()
    expect(wrapper.get('[data-vuesortable-list]').element).toBeTruthy()
    expect(wrapper.findAll('[data-vuesortable-item-key]')).toHaveLength(2)
    expect(wrapper.text()).toContain('One')
    expect(wrapper.text()).toContain('Two')
  })

  it('applies class to the root through Vue attrs', () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attrs: {
          class: 'sortable-root',
        },
      },
    )

    expect(wrapper.get('[data-vuesortable-root]').classes()).toContain('sortable-root')
  })

  it('lets the user render the list with a scoped class', () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        slot: {
          listContainerClass: 'lane',
        },
      },
    )

    expect(wrapper.get('[data-vuesortable-list]').classes()).toContain('lane')
  })

  it('adds accessible list, item, handle, keyboard, and live-region attributes', () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    const firstItem = wrapper.get('[data-vuesortable-item-key="one"]')
    const firstHandle = wrapper.get('[data-test-handle]')

    expect(wrapper.get('[data-vuesortable-list]').attributes('role')).toBe('list')
    expect(firstItem.attributes('role')).toBe('listitem')
    expect(firstItem.attributes('aria-posinset')).toBe('1')
    expect(firstItem.attributes('aria-setsize')).toBe('2')
    expect(firstHandle.attributes('aria-label')).toBe('Reorder one')
    expect(firstHandle.attributes('aria-keyshortcuts')).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight Home End')
    expect(firstHandle.attributes('aria-roledescription')).toBe('sortable handle')
    expect(firstHandle.attributes('tabindex')).toBe('0')
    expect(wrapper.get('[data-vuesortable-live-region]').attributes('role')).toBe('status')
    expect(wrapper.get('[data-vuesortable-live-region]').attributes('aria-live')).toBe('polite')
  })

  it('reorders with keyboard shortcuts, announces the move, and restores handle focus', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        attachTo: host,
      },
    )

    const handle = wrapper.get('[data-test-handle]')
    ;(handle.element as HTMLElement).focus()

    await handle.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { id: 'two', label: 'Two' },
      { id: 'one', label: 'One' },
      { id: 'three', label: 'Three' },
    ])
    expect(wrapper.emitted('reorder')?.[0]?.[0]).toEqual({
      from: 0,
      item: { id: 'one', label: 'One' },
      key: 'one',
      to: 1,
    })
    expect(wrapper.get('[data-vuesortable-live-region]').text()).toBe('Moved one from position 1 to 2.')
    expect(document.activeElement).toBe(getSortableItemElement(wrapper, 'one').querySelector('[data-vuesortable-handle]'))
  })

  it('drags vertically and clamps the overlay inside the root', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: -240, clientY: 320 }))
    await nextTick()

    expect(wrapper.find('[data-vuesortable-placeholder="one"]').exists()).toBe(true)
    expect(wrapper.find('[data-vuesortable-overlay-key="one"]').exists()).toBe(true)
    expect(wrapper.find('[data-vuesortable-item-key="one"]').exists()).toBe(false)
    expect(wrapper.get('[data-vuesortable-placeholder="one"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('[data-vuesortable-placeholder="one"]').attributes('role')).toBe('presentation')
    expect(wrapper.get('[data-vuesortable-overlay]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('[data-vuesortable-overlay]').attributes('style')).toContain('translate3d(4px, 92px, 0)')
  })

  it('bounds grouped overlay movement to the source and target roots', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'source-rules',
        },
      },
    )
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'target-rules',
        },
      },
    )

    mockRootRect(source, { top: 100, left: 40, width: 320, height: 88 })
    mockRootRect(target, { top: 220, left: 40, width: 320, height: 88 })
    mockItemRects(source, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 224, height: 40 },
      four: { top: 268, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: -200 }))
    await nextTick()

    expect(source.get('[data-vuesortable-overlay]').attributes('style')).toContain('translate3d(4px, 0px, 0)')

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 900 }))
    await nextTick()

    expect(source.get('[data-vuesortable-overlay]').attributes('style')).toContain('translate3d(4px, 168px, 0)')
  })

  it('selects grouped axis targets using the overlay center in viewport coordinates', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'source-rules',
        },
      },
    )
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'target-rules',
        },
      },
    )

    mockRootRect(source, { top: 300, left: 40, width: 320, height: 88 })
    mockRootRect(target, { top: 440, left: 40, width: 320, height: 88 })
    mockItemRects(source, {
      one: { top: 304, height: 40 },
      two: { top: 348, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 444, height: 40 },
      four: { top: 488, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 320,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 472 }))
    await nextTick()

    expect(listChildOrder(source)).toEqual(['two'])
    expect(listChildOrder(target)).toEqual(['three', 'one', 'four'])
  })

  it('moves an item between sortables that share a group', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'source-rules',
        },
      },
    )
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'target-rules',
        },
      },
    )

    mockRootRect(source, { top: 100, left: 40, width: 320, height: 88 })
    mockRootRect(target, { top: 220, left: 40, width: 320, height: 88 })
    mockItemRects(source, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 224, height: 40 },
      four: { top: 268, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 252 }))
    await nextTick()

    expect(listChildOrder(source)).toEqual(['two'])
    expect(listChildOrder(target)).toEqual(['three', 'one', 'four'])
    mockItemRects(target, {
      three: { top: 224, height: 40 },
      four: { top: 268, height: 40 },
    })

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 252 }))
    await nextTick()

    expect(source.props('modelValue')).toEqual([
      { id: 'two', label: 'Two' },
    ])
    expect(target.props('modelValue')).toEqual([
      { id: 'three', label: 'Three' },
      { id: 'one', label: 'One' },
      { id: 'four', label: 'Four' },
    ])
    expect(source.emitted('reorder')?.[0]?.[0]).toMatchObject({
      from: 0,
      fromList: 'source-rules',
      group: 'rules',
      key: 'one',
      to: 1,
      toList: 'target-rules',
    })
  })

  it('lets the target grouped list reject a cross-list drop', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
          listId: 'source-rules',
        },
      },
    )
    const targetCanDrop = vi.fn(() => false)
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          canDrop: targetCanDrop,
          group: 'rules',
          listId: 'target-rules',
        },
      },
    )

    mockRootRect(source, { top: 100, left: 40, width: 320, height: 88 })
    mockRootRect(target, { top: 220, left: 40, width: 320, height: 88 })
    mockItemRects(source, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 224, height: 40 },
      four: { top: 268, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 252 }))
    await nextTick()

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 252 }))
    await nextTick()

    expect(targetCanDrop).toHaveBeenCalledWith(expect.objectContaining({
      from: 0,
      fromList: 'source-rules',
      group: 'rules',
      key: 'one',
      to: expect.any(Number),
      toList: 'target-rules',
    }))
    expect(source.props('modelValue')).toEqual([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])
    expect(target.props('modelValue')).toEqual([
      { id: 'three', label: 'Three' },
      { id: 'four', label: 'Four' },
    ])
    expect(source.emitted('reorder')).toBeUndefined()
    expect(source.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({
      fromList: 'source-rules',
      toList: 'target-rules',
    })
  })

  it('uses the pointerup position as the final grouped drop target', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
        },
      },
    )
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
        },
      },
    )

    mockRootRect(source, { top: 100, left: 40, width: 320, height: 88 })
    mockRootRect(target, { top: 220, left: 40, width: 320, height: 88 })
    mockItemRects(source, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 224, height: 40 },
      four: { top: 268, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 152 }))
    await nextTick()

    expect(listChildOrder(source)).toEqual(['two', 'one'])

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 252 }))
    await nextTick()

    expect(source.props('modelValue')).toEqual([
      { id: 'two', label: 'Two' },
    ])
    expect(target.props('modelValue')).toEqual([
      { id: 'three', label: 'Three' },
      { id: 'one', label: 'One' },
      { id: 'four', label: 'Four' },
    ])
    expect(source.emitted('reorder')?.[0]?.[0]).toMatchObject({
      from: 0,
      group: 'rules',
      key: 'one',
      toList: expect.any(String),
    })
  })

  it('uses main-axis group thresholds instead of two-dimensional rect distance', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const source = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
        },
      },
    )
    const target = mountSortable(
      [
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        attachTo: host,
        props: {
          group: 'rules',
        },
      },
    )

    mockRootRect(source, { top: 100, left: 40, width: 120, height: 88 })
    mockRootRect(target, { top: 220, left: 260, width: 120, height: 88 })
    mockItemRects(source, {
      one: { top: 104, left: 40, width: 120, height: 40 },
      two: { top: 148, left: 40, width: 120, height: 40 },
    })
    mockItemRects(target, {
      three: { top: 224, left: 260, width: 120, height: 40 },
      four: { top: 268, left: 260, width: 120, height: 40 },
    })

    await pointerDown(source.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 208 }))
    await nextTick()

    expect(listChildOrder(target)).toEqual(['one', 'three', 'four'])
  })

  it('drags horizontally with a user-owned flex list', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
        slot: {
          listContainerClass: 'lane',
          listStyle: {
            display: 'flex',
          },
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 40, height: 40 },
      two: { top: 104, left: 88, width: 40, height: 40 },
      three: { top: 104, left: 132, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 240, clientY: -240 }))
    await nextTick()

    expect(wrapper.get('[data-vuesortable-list]').classes()).toContain('lane')
    expect((wrapper.get('[data-vuesortable-list]').element as HTMLElement).style.display).toBe('flex')
    expect(wrapper.get('[data-vuesortable-placeholder="one"]').attributes('style')).toContain('width: 40px')
    expect(wrapper.get('[data-vuesortable-overlay]').attributes('style')).toContain('translate3d(92px, 4px, 0)')
  })

  it('supports horizontal flow layouts that wrap across visual rows', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
      ],
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
        },
        slot: {
          listContainerClass: 'lane',
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    // 2 slots per row: rows are [one two] / [three four].
    mockRootRect(wrapper, { top: 100, left: 40, width: 88, height: 92 })
    mockFlowSlotRects(wrapper, ['one', 'two', 'three', 'four'], {
      baseLeft: 40,
      baseTop: 104,
      columns: 2,
      pitchX: 44,
      pitchY: 44,
      size: { width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 50,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 49, clientY: 164 }))
    await nextTick()

    expect(wrapper.get('[data-vuesortable-root]').attributes('data-vuesortable-layout')).toBe('flow')
    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three', 'four'])
    // Index 1 wraps as the end of row 1, so the overlay rides row 1 with the
    // placeholder instead of floating on the pointer's row.
    expect(wrapper.get('[data-vuesortable-overlay]').attributes('style')).toContain('translate3d(0px, 4px, 0)')
  })

  it('resolves flow preview indexes against the live layout after the placeholder reflows rows', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
        { id: 'five', label: 'Five' },
      ],
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    // 3 slots per row: initial rows are [one two three] / [four five].
    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 140 })
    mockFlowSlotRects(wrapper, ['one', 'two', 'three', 'four', 'five'], {
      baseLeft: 40,
      baseTop: 104,
      columns: 3,
      pitchX: 44,
      pitchY: 44,
      size: { width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 124,
    })

    // Drag past "five": the placeholder moves to the end of the list and the
    // wrap reflows — "four" and "five" shift into the freed row-1/row-2 slots.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 170 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'three', 'four', 'five', 'one'])

    // Now point at the left half of "five" AT ITS LIVE POSITION (row 2, first
    // slot — where "four" sat before the reflow; clearly left of its centre).
    // The placeholder must land before "five"; resolving against the stale
    // drag-start snapshot would target the pre-drag "four" instead and jump
    // back to row 1.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 55, clientY: 168 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'three', 'four', 'one', 'five'])

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 55, clientY: 168 }))
    await nextTick()
    expect((wrapper.props('modelValue') as Item[]).map(item => item.id))
      .toEqual(['two', 'three', 'four', 'one', 'five'])
  })

  it('resolves flow indexes from resting layout positions, ignoring in-flight FLIP transforms', async () => {
    // Regression: list motion animates relocations with inline translate3d
    // transforms, and getBoundingClientRect includes them. Resolving against
    // mid-flight geometry computes a different index, relocates the
    // placeholder, starts new flights, and loops — chips "flicker like
    // crazy", worst across row boundaries where flights are longest. The
    // resolution must read the resting layout, not the animation frame.
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
        { id: 'five', label: 'Five' },
      ],
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
          overlap: 0.55,
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 140 })
    mockFlowSlotRects(wrapper, ['one', 'two', 'three', 'four', 'five'], {
      baseLeft: 40,
      baseTop: 104,
      columns: 3,
      pitchX: 44,
      pitchY: 44,
      size: { width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 124,
    })

    // Move the placeholder to the tail; "five" reflows to row 2's first slot.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 170 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'three', 'four', 'five', 'one'])

    // Simulate the PLACEHOLDER mid-FLIP: visually flying over row 1 while its
    // resting slot is row 2. The placeholder is the one geometry read live on
    // EVERY resolution (items come from the pre-flight layout snapshot). If
    // the animated rect were used, the placeholder would register on row 1,
    // row 2 would look placeholder-free, and the direction hysteresis would
    // be dropped — flipping the index and starting the feedback loop.
    const placeholderElement = wrapper.get('[data-vuesortable-placeholder="one"]').element as HTMLElement
    placeholderElement.style.transform = 'translate3d(-44px, -44px, 0px)'

    // Cursor over five's right half approaching from the right: with resting
    // geometry the placeholder stays in row 2 and the −1-direction threshold
    // (centre+18) keeps the insertion BEFORE five.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 65, clientY: 168 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'three', 'four', 'one', 'five'])
  })

  it('keeps a flow placeholder stable when it wraps onto a row of its own', async () => {
    // Regression: the placeholder occupies real space in the wrap but is not
    // a measured item. When relocating it rewrapped the rows (e.g. it landed
    // on a row of its own and its old neighbor jumped up a row), the pointer
    // mapped into a different line on the next resolution, moved the
    // placeholder back, rewrapped again — an infinite A/B oscillation with a
    // completely still pointer.
    const widths: Record<string, number> = {
      a: 150,
      b: 210,
      c: 120,
      d: 260,
      e: 90,
      f: 180,
      g: 240,
      h: 110,
    }
    const wrapper = mountSortable(
      Object.keys(widths).map(id => ({ id, label: id })),
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
          overlap: 0.55,
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    // 640px container: rows are [a b c] / [d e f] / [g h]. Dragging d (260px)
    // to the tail wraps the placeholder onto a fourth row of its own, because
    // h (110px) fits next to e+f+g on the row above.
    mockRootRect(wrapper, { top: 20, left: 20, width: 640, height: 400 })
    const refreshRects = mockFlowWrapRects(wrapper, widths, {
      containerWidth: 640,
      gap: 6,
      root: { left: 20, top: 20 },
      rowHeight: 36,
      rowPitch: 44,
    })

    // Grab d at its center (row 2 start: left 20 + 260/2, top 64 + 36/2).
    await pointerDown(wrapper.get('[data-vuesortable-item-key="d"]'), {
      button: 0,
      clientX: 150,
      clientY: 82,
    })

    // Drag to the far end of row 3.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 600, clientY: 108 }))
    await nextTick()
    refreshRects()
    expect(listChildOrder(wrapper)).toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'h', 'd'])

    // With the pointer completely still, the resolution must be a fixpoint:
    // repeated identical moves may not change the order (this oscillated
    // between "…g d h" and "…g h d" before the fix).
    for (let repeat = 0; repeat < 3; repeat += 1) {
      document.dispatchEvent(pointerEvent('pointermove', { clientX: 600, clientY: 108 }))
      await nextTick()
      refreshRects()
      expect(listChildOrder(wrapper)).toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'h', 'd'])
    }

    // Same stability requirement at the position that flapped hardest before
    // the fix (over the row the placeholder now occupies alone).
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 528, clientY: 108 }))
    await nextTick()
    refreshRects()
    const settled = listChildOrder(wrapper)
    for (let repeat = 0; repeat < 3; repeat += 1) {
      document.dispatchEvent(pointerEvent('pointermove', { clientX: 528, clientY: 108 }))
      await nextTick()
      refreshRects()
      expect(listChildOrder(wrapper)).toEqual(settled)
    }

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 528, clientY: 108 }))
    await nextTick()
    expect((wrapper.props('modelValue') as Item[]).map(item => item.id))
      .toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'h', 'd'])
  })

  it('selects the flow row with the pointer even when the overlay centre sits on another row', async () => {
    // Contract: the ROW is aimed with the cursor (cross axis), while in-line
    // placement uses the overlay like a rail. With a grab near the item's
    // TOP edge the overlay centre hangs ~18px BELOW the cursor — enough to
    // land on the next row. The cursor's row must win.
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
        { id: 'four', label: 'Four' },
        { id: 'five', label: 'Five' },
      ],
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
          overlap: 0.55,
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    // 3 slots per row: rows are [one two three] / [four five].
    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 140 })
    mockFlowSlotRects(wrapper, ['one', 'two', 'three', 'four', 'five'], {
      baseLeft: 40,
      baseTop: 104,
      columns: 3,
      pitchX: 44,
      pitchY: 44,
      size: { width: 40, height: 40 },
    })

    // Grab "one" near its TOP edge, horizontally centred: the overlay centre
    // sits 18px below the cursor.
    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 106,
    })

    // Cursor at root-relative y=30 (row 1 band); overlay centre y=48 (row 2
    // band). The placeholder must land in ROW 1 (after "two": overlay centre
    // x=70 past two's 64−18=46 threshold, before three's 90) — an
    // overlay-centre row pick would have dropped it into row 2 instead.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 130 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three', 'four', 'five'])

    // Stability: identical position, identical order.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 130 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three', 'four', 'five'])
  })

  describe('flow row hysteresis', () => {
    // Shared geometry: 3 slots per row, 40px chips, 4px gaps. Root-relative
    // row bands are row 1 = 4..44 and row 2 = 48..88; items are
    // [one two three] / [four five]. Rows switch only once the pointer is
    // more than half a row height (20px) past the current row's band.
    function mountFlowRows() {
      const wrapper = mountSortable(
        ['one', 'two', 'three', 'four', 'five'].map(id => ({ id, label: id })),
        {
          props: {
            layout: 'flow',
            // No FLIP: placeholder rects read by the assertions are resting.
            motion: false,
            orientation: 'horizontal',
          },
          slot: {
            listStyle: {
              display: 'flex',
              flexWrap: 'wrap',
            },
          },
        },
      )

      mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 140 })
      mockFlowSlotRects(wrapper, ['one', 'two', 'three', 'four', 'five'], {
        baseLeft: 40,
        baseTop: 104,
        columns: 3,
        pitchX: 44,
        pitchY: 44,
        size: { width: 40, height: 40 },
      })

      return wrapper
    }

    function overlayPosition(wrapper: MountedSortable) {
      const overlay = wrapper.get('[data-vuesortable-overlay]').element as HTMLElement
      const match = overlay.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)
      if (!match) throw new Error(`Unexpected overlay transform: ${overlay.style.transform}`)
      return { left: Number(match[1]), top: Number(match[2]) }
    }

    function placeholderTop(wrapper: MountedSortable) {
      const placeholder = wrapper.get('[data-vuesortable-placeholder]').element as HTMLElement
      const root = wrapper.get('[data-vuesortable-root]').element as HTMLElement
      return placeholder.getBoundingClientRect().top - root.getBoundingClientRect().top
    }

    async function move(clientX: number, clientY: number) {
      document.dispatchEvent(pointerEvent('pointermove', { clientX, clientY }))
      await nextTick()
    }

    it('pins the overlay to the placeholder row while the pointer drifts vertically inside the threshold', async () => {
      const wrapper = mountFlowRows()

      // Grab "two" at its centre (row 1, second slot).
      await pointerDown(wrapper.get('[data-vuesortable-item-key="two"]'), {
        button: 0,
        clientX: 104,
        clientY: 124,
      })

      await move(108, 124)
      const rowTop = placeholderTop(wrapper)
      expect(overlayPosition(wrapper).top).toBe(rowTop)

      // Drift down inside row 1, then 12px into row 2's band (16px past the
      // row 1 edge, still under half a row): the overlay follows the pointer
      // horizontally only, and the placeholder never leaves row 1.
      await move(110, 134)
      expect(overlayPosition(wrapper)).toEqual({ left: 50, top: rowTop })
      expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three', 'four', 'five'])

      await move(112, 160)
      expect(overlayPosition(wrapper)).toEqual({ left: 52, top: rowTop })
      expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three', 'four', 'five'])
      expect(wrapper.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ to: 1 })
    })

    it('switches rows once the pointer passes the threshold and moves the overlay onto the new row', async () => {
      const wrapper = mountFlowRows()

      await pointerDown(wrapper.get('[data-vuesortable-item-key="two"]'), {
        button: 0,
        clientX: 104,
        clientY: 124,
      })
      await move(108, 124)

      // 26px past the row 1 edge: past half a row, so row 2 is targeted.
      await move(108, 170)
      expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'four', 'five', 'two'])
      expect(placeholderTop(wrapper)).toBeGreaterThanOrEqual(48)
      // The overlay lands on the placeholder's new row without waiting for
      // another pointer move.
      expect(overlayPosition(wrapper).top).toBe(placeholderTop(wrapper))

      document.dispatchEvent(pointerEvent('pointerup', { clientX: 108, clientY: 170 }))
      await nextTick()
      expect((wrapper.props('modelValue') as Item[]).map(item => item.id))
        .toEqual(['one', 'three', 'four', 'five', 'two'])
    })

    it('applies the same threshold when returning to the previous row', async () => {
      const wrapper = mountFlowRows()

      await pointerDown(wrapper.get('[data-vuesortable-item-key="two"]'), {
        button: 0,
        clientX: 104,
        clientY: 124,
      })
      await move(108, 124)
      await move(108, 170)
      expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'four', 'five', 'two'])
      const rowTop = placeholderTop(wrapper)

      // Back up into row 1's band, but only 8px past row 2's top edge.
      await move(108, 140)
      expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'four', 'five', 'two'])
      expect(overlayPosition(wrapper).top).toBe(rowTop)

      // Well inside row 1 (more than half a row past row 2's edge); the
      // overlay centre sits past "three", so the slot is after it.
      await move(108, 120)
      expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'two', 'four', 'five'])
      expect(placeholderTop(wrapper)).toBeLessThan(44)
      expect(overlayPosition(wrapper).top).toBe(placeholderTop(wrapper))
    })
  })

  it('stays fixpoint-stable across a variable-width sweep with repeated identical moves', async () => {
    // Anti-regression property: at ANY pointer position, re-resolving with an
    // identical event must not change the order (no reflow feedback loops).
    // This sweep reproduces the original infinite A/B oscillation setup.
    const widths: Record<string, number> = {
      a: 150,
      b: 210,
      c: 120,
      d: 260,
      e: 90,
      f: 180,
      g: 240,
      h: 110,
    }
    const wrapper = mountSortable(
      Object.keys(widths).map(id => ({ id, label: id })),
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
          overlap: 0.55,
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    mockRootRect(wrapper, { top: 20, left: 20, width: 640, height: 400 })
    const refreshRects = mockFlowWrapRects(wrapper, widths, {
      containerWidth: 640,
      gap: 6,
      root: { left: 20, top: 20 },
      rowHeight: 36,
      rowPitch: 44,
    })

    // Grab d (260px, row 2 start) at its centre.
    await pointerDown(wrapper.get('[data-vuesortable-item-key="d"]'), {
      button: 0,
      clientX: 150,
      clientY: 82,
    })

    const path: Array<[number, number]> = []
    for (let x = 150; x >= 40; x -= 22) path.push([x, 82])
    for (let x = 40; x <= 600; x += 22) path.push([x, 38])
    for (let x = 600; x >= 40; x -= 22) path.push([x, 108])
    for (let x = 40; x <= 600; x += 22) path.push([x, 152])

    for (const [x, y] of path) {
      document.dispatchEvent(pointerEvent('pointermove', { clientX: x, clientY: y }))
      await nextTick()
      refreshRects()
      const first = listChildOrder(wrapper)
      document.dispatchEvent(pointerEvent('pointermove', { clientX: x, clientY: y }))
      await nextTick()
      refreshRects()
      // Idempotence at (x, y): identical event, identical order.
      expect(listChildOrder(wrapper)).toEqual(first)
    }
  })

  it('uses rail-style overlay thresholds in flow rows, adapting to the approach direction mid-drag', async () => {
    // Contract: within a flow row, placement works EXACTLY like an axis rail —
    // the OVERLAY's centre against direction-aware overlap thresholds
    // (overlap 0.55 + 40px items + 40px active → overlapDistance 18). Two
    // chips: grab the right one, cross the left one moving LEFT (flips when
    // the overlay centre passes centre+18), then return RIGHT without
    // releasing: the boundary must have adapted to the new approach side
    // (centre−18 of the shifted chip), with a hysteresis window in between.
    const wrapper = mountSortable(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      {
        props: {
          layout: 'flow',
          orientation: 'horizontal',
          overlap: 0.55,
        },
        slot: {
          listStyle: {
            display: 'flex',
            flexWrap: 'wrap',
          },
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockFlowSlotRects(wrapper, ['a', 'b'], {
      baseLeft: 40,
      baseTop: 104,
      columns: 3,
      pitchX: 44,
      pitchY: 44,
      size: { width: 40, height: 40 },
    })

    // Grab "b" (right chip) at its centre → overlay centre tracks the cursor.
    await pointerDown(wrapper.get('[data-vuesortable-item-key="b"]'), {
      button: 0,
      clientX: 104,
      clientY: 124,
    })

    // Moving LEFT toward "a" (centre 20): threshold is 20+18=38. Overlay
    // centre at 39 → no flip yet.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 79, clientY: 124 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['a', 'b'])

    // Overlay centre at 37 → flips.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 77, clientY: 124 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['b', 'a'])

    // Return RIGHT: "a" now sits at centre 64; the flip-back boundary is
    // 64−18=46 (adapted to this approach side). Overlay centre 45 → still
    // inside the hysteresis window, no flip-back.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 85, clientY: 124 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['b', 'a'])

    // Overlay centre 47 → flips back, well before "a"'s midpoint.
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 87, clientY: 124 }))
    await nextTick()
    expect(listChildOrder(wrapper)).toEqual(['a', 'b'])
  })

  it('keeps the horizontal placeholder in place before the default overlap threshold', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 40, height: 40 },
      two: { top: 104, left: 88, width: 40, height: 40 },
      three: { top: 104, left: 132, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 80, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three'])
    expect(wrapper.get('[data-vuesortable-placeholder="one"]').attributes('style')).toContain('height: 40px')
    expect(wrapper.get('[data-vuesortable-placeholder="one"]').attributes('style')).toContain('width: 40px')
  })

  it('opens the horizontal placeholder at the default 50% overlap threshold', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 396, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 40, width: 132, height: 40 },
      two: { top: 104, left: 172, width: 132, height: 40 },
      three: { top: 104, left: 304, width: 132, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 52,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 117, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three'])

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 118, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three'])
  })

  it('uses custom overlap thresholds based on the active and neighboring item sizes', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
          overlap: 0.55,
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 420, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 40, width: 100, height: 40 },
      two: { top: 104, left: 140, width: 200, height: 40 },
      three: { top: 104, left: 340, width: 120, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 52,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 161, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three'])

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 162, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three'])
  })

  it('supports explicit center collision when strict center crossing is preferred', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          collision: 'center',
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 396, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 40, width: 132, height: 40 },
      two: { top: 104, left: 172, width: 132, height: 40 },
      three: { top: 104, left: 304, width: 132, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 52,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 183, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'two', 'three'])

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 184, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three'])
  })

  it('opens the vertical placeholder at the default next-item overlap threshold', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 164 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['two', 'one', 'three'])
  })

  it('opens the vertical placeholder at the default previous-item overlap threshold', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="three"]'), {
      button: 0,
      clientX: 60,
      clientY: 208,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 163 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'two'])
  })

  it('opens the horizontal placeholder at the default previous-item overlap threshold', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 40, height: 40 },
      two: { top: 104, left: 88, width: 40, height: 40 },
      three: { top: 104, left: 132, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="three"]'), {
      button: 0,
      clientX: 148,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 103, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['one', 'three', 'two'])
  })

  it('opens the horizontal placeholder when crossing the default last-slot overlap threshold', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 40, height: 40 },
      two: { top: 104, left: 88, width: 40, height: 40 },
      three: { top: 104, left: 132, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 148, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['two', 'three', 'one'])
  })

  it('opens the horizontal placeholder when crossing the default first-slot overlap threshold', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 40, height: 40 },
      two: { top: 104, left: 88, width: 40, height: 40 },
      three: { top: 104, left: 132, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="three"]'), {
      button: 0,
      clientX: 148,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 59, clientY: 120 }))
    await nextTick()

    expect(listChildOrder(wrapper)).toEqual(['three', 'one', 'two'])
  })

  it('renders the overlay outside the normal-flow list but inside the root', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 88 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 170 }))
    await nextTick()

    const root = wrapper.get('[data-vuesortable-root]').element
    const list = wrapper.get('[data-vuesortable-list]').element
    const overlay = wrapper.get('[data-vuesortable-overlay]').element

    expect(root.contains(overlay)).toBe(true)
    expect(list.contains(overlay)).toBe(false)
  })

  it('allows a button handle to start dragging even though button is ignored by default', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 88 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })

    await pointerDown(wrapper.get('[data-test-handle]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 170 }))
    await nextTick()

    expect(wrapper.find('[data-vuesortable-overlay-key="one"]').exists()).toBe(true)
  })

  it('does not reorder when movement stays below the activation threshold', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 20,
      clientY: 20,
    })

    expect(document.documentElement.style.cursor).toBe('grabbing')
    expect(document.body.style.cursor).toBe('grabbing')

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 21, clientY: 21 }))
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 21, clientY: 21 }))
    await nextTick()

    expect(document.documentElement.style.cursor).toBe('')
    expect(document.body.style.cursor).toBe('')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
  })

  it('keeps the document cursor grabbing during pointer drag and restores it on release', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 88 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })

    expect(document.documentElement.style.cursor).toBe('grabbing')
    expect(document.body.style.cursor).toBe('grabbing')

    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 170 }))
    await nextTick()

    expect(document.documentElement.style.cursor).toBe('grabbing')
    expect(document.body.style.cursor).toBe('grabbing')

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 170 }))
    await nextTick()

    expect(document.documentElement.style.cursor).toBe('')
    expect(document.body.style.cursor).toBe('')

    await vi.runAllTimersAsync()
  })

  it('emits exactly one model update and reorder event on release', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 220 }))
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 220 }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('reorder')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
      { id: 'one', label: 'One' },
    ])

    await vi.runAllTimersAsync()
    await nextTick()
  })

  it('supports repeated drags without leaving state behind', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: -240, clientY: 320 }))
    document.dispatchEvent(pointerEvent('pointerup', { clientX: -240, clientY: 320 }))
    await nextTick()
    await vi.runAllTimersAsync()
    await nextTick()

    expect(wrapper.find('[data-vuesortable-overlay]').exists()).toBe(false)

    mockItemRects(wrapper, {
      two: { top: 104, height: 40 },
      three: { top: 148, height: 40 },
      one: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 208,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: -240, clientY: 80 }))
    document.dispatchEvent(pointerEvent('pointerup', { clientX: -240, clientY: 80 }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0]).toEqual([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    await vi.runAllTimersAsync()
    await nextTick()
  })

  it('does not run list motion reads when only the overlay position changes', async () => {
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])
    let itemRectReads = 0

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(
      wrapper,
      {
        one: { top: 104, height: 40 },
        two: { top: 148, height: 40 },
        three: { top: 192, height: 40 },
      },
      {
        onRead: () => {
          itemRectReads += 1
        },
      },
    )

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 126 }))
    await nextTick()

    itemRectReads = 0
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 128 }))
    await nextTick()

    expect(itemRectReads).toBe(0)
  })

  it('cleans FLIP and drop motion inline transform and transition styles', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRectSequences(wrapper, {
      one: [
        { top: 104, height: 40 },
        { top: 104, height: 40 },
        { top: 104, height: 40 },
      ],
      two: [
        { top: 148, height: 40 },
        { top: 148, height: 40 },
        { top: 104, height: 40 },
      ],
      three: [
        { top: 192, height: 40 },
        { top: 192, height: 40 },
        { top: 148, height: 40 },
      ],
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 220 }))
    await nextTick()

    expect((wrapper.get('[data-vuesortable-item-key="two"]').element as HTMLElement).style.transform).not.toBe('')

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 220 }))
    await nextTick()
    await vi.runAllTimersAsync()
    await nextTick()

    for (const element of wrapper.findAll('[data-vuesortable-motion-key]')) {
      const htmlElement = element.element as HTMLElement
      expect(htmlElement.style.transform).toBe('')
      expect(htmlElement.style.transition).toBe('')
    }
    expect(wrapper.find('[data-vuesortable-overlay]').exists()).toBe(false)
  })

  it('animates displaced items through the FLIP transition phase', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRectSequences(wrapper, {
      one: [
        { top: 104, height: 40 },
        { top: 104, height: 40 },
      ],
      two: [
        { top: 148, height: 40 },
        { top: 148, height: 40 },
        { top: 104, height: 40 },
      ],
      three: [
        { top: 192, height: 40 },
        { top: 192, height: 40 },
        { top: 148, height: 40 },
      ],
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 220 }))
    await nextTick()

    const displaced = wrapper.get('[data-vuesortable-item-key="two"]').element as HTMLElement
    expect(displaced.style.transform).toBe('translate3d(0px, 44px, 0)')
    expect(displaced.style.transition).toBe('none')

    await vi.advanceTimersByTimeAsync(16)
    await nextTick()

    expect(displaced.style.transform).toBe('translate3d(0px, 44px, 0)')
    expect(displaced.style.transition).toBe('none')

    await vi.advanceTimersByTimeAsync(16)
    await nextTick()

    expect(displaced.style.transform).toBe('')
    expect(displaced.style.transition).toContain('transform 150ms cubic-bezier(0.22, 1, 0.36, 1)')
  })

  it('does not apply list or drop animations when motion is false', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
        { id: 'three', label: 'Three' },
      ],
      {
        props: {
          motion: false,
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 220 }))
    await nextTick()

    for (const element of wrapper.findAll('[data-vuesortable-motion-key]')) {
      const htmlElement = element.element as HTMLElement
      expect(htmlElement.style.transform).toBe('')
      expect(htmlElement.style.transition).toBe('')
    }

    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 220 }))
    await nextTick()

    expect(wrapper.find('[data-vuesortable-overlay]').exists()).toBe(false)
  })

  it('lets canMove block a pointer reorder and a keyboard reorder', async () => {
    vi.useFakeTimers()
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        props: {
          canMove: () => false,
        },
      },
    )

    await wrapper.get('[data-test-handle]').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
    expect(wrapper.get('[data-vuesortable-live-region]').text()).toBe('Could not move one.')

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 88 })
    mockItemRects(wrapper, {
      one: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 170 }))
    document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 170 }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
    expect(wrapper.emitted('drag-cancel')).toHaveLength(1)

    await vi.runAllTimersAsync()
    await nextTick()
  })

  it('keeps placeholder width and height equal to the active item', async () => {
    const wrapper = mountSortable(
      [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' },
      ],
      {
        props: {
          orientation: 'horizontal',
        },
      },
    )

    mockRootRect(wrapper, { top: 100, left: 40, width: 132, height: 48 })
    mockItemRects(wrapper, {
      one: { top: 104, left: 44, width: 56, height: 32 },
      two: { top: 104, left: 104, width: 40, height: 40 },
    })

    await pointerDown(wrapper.get('[data-vuesortable-item-key="one"]'), {
      button: 0,
      clientX: 60,
      clientY: 120,
    })
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 120, clientY: 120 }))
    await nextTick()

    const placeholder = wrapper.get('[data-vuesortable-placeholder="one"]').element as HTMLElement
    expect(placeholder.style.height).toBe('32px')
    expect(placeholder.style.width).toBe('56px')
  })

  it('supports item keys that are unsafe in CSS selectors', async () => {
    vi.useFakeTimers()
    const unsafeKey = 'one"] [data-bad="true'
    const wrapper = mountSortable([
      { id: unsafeKey, label: 'Unsafe selector key' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ])

    mockRootRect(wrapper, { top: 100, left: 40, width: 320, height: 132 })
    mockItemRects(wrapper, {
      [unsafeKey]: { top: 104, height: 40 },
      two: { top: 148, height: 40 },
      three: { top: 192, height: 40 },
    })

    getSortableItemElement(wrapper, unsafeKey).dispatchEvent(pointerEvent('pointerdown', {
      button: 0,
      clientX: 60,
      clientY: 120,
    }))
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 220 }))
    await nextTick()

    expect(wrapper.find('[data-vuesortable-placeholder]').exists()).toBe(true)
    expect(() => {
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 220 }))
    }).not.toThrow()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
      { id: unsafeKey, label: 'Unsafe selector key' },
    ])

    await vi.runAllTimersAsync()
    await nextTick()
  })

  it('does not leak a group registration when the group changes and the component unmounts in the same tick', async () => {
    const wrapper = mountSortable(
      [{ id: 'one', label: 'One' }],
      { props: { group: 'alpha' } },
    )
    await nextTick()
    expect(getGroupedSortableEntries('alpha')).toHaveLength(1)

    // Rename the group and unmount in the SAME tick, before the pre-flush
    // watch(groupName) job re-keys the registry: the scope stop cancels the
    // pending job, so onBeforeUnmount must still clear the stale 'alpha' key.
    wrapper.setProps({ group: 'beta' })
    wrapper.unmount()
    await nextTick()

    expect(getGroupedSortableEntries('alpha')).toHaveLength(0)
    expect(getGroupedSortableEntries('beta')).toHaveLength(0)
  })
})
