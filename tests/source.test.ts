import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import type { DefineComponent } from 'vue'
import SortableSource from '../src/components/SortableSource.vue'
import { getGroupedSortableEntries } from '../src/composables/useSortableList'
import type { SortableDefaultSlotProps, SortableReceivePayload, SortableSourceProps, SortableSourceSlotProps } from '../src/types'
import type { Box, Item, ListGeometry } from './helpers'
import { dragTo, installLayout, itemOf, items, mountList, orderOf, overlayStyle, placeBox, press, release } from './helpers'

type Block = {
  kind: string
}

const SourceForBlocks = SortableSource as unknown as DefineComponent<SortableSourceProps<Block>>

// A palette block on the left, a column and a row to drop it on.
const paletteBox: Box = { height: 30, left: 0, top: 0, width: 120 }
const column: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 300, top: 0, width: 200 }, size: { height: 40, width: 200 } }
const row: ListGeometry = { direction: 'row', gap: 10, root: { height: 40, left: 0, top: 400, width: 600 }, size: { height: 40, width: 100 } }

const text: Block = { kind: 'text' }

function mountSource(options: { props?: Partial<SortableSourceProps<Block>>, onClick?: () => void } = {}) {
  const seen: { slot: SortableSourceSlotProps<Block> | null } = { slot: null }
  const wrapper = mount(SourceForBlocks, {
    attachTo: document.body,
    props: { data: text, group: 'board', motion: false, ...options.props },
    slots: {
      default: (slot: SortableSourceSlotProps<Block>) => {
        seen.slot = slot

        return [
          h('button', { ...slot.sourceAttrs, class: 'block', onClick: options.onClick, type: 'button' }, slot.overlay?.element.kind ?? 'Text'),
          slot.overlay ? h('div', { ...slot.overlay.attrs, style: slot.overlay.style }, slot.overlay.element.kind) : null,
        ]
      },
    },
  })
  const block = wrapper.get('.block').element as HTMLElement
  placeBox(block, paletteBox)

  return { block, seen, wrapper }
}

function mountBoard(model: Item[], options: Parameters<typeof mountList>[1] = {}) {
  const seen: { slot: SortableDefaultSlotProps<Item> | null } = { slot: null }
  const wrapper = mountList(model, {
    geometry: column,
    ...options,
    onSlot: slot => (seen.slot = slot),
    props: { group: 'board', listId: 'board', ...options.props },
  })
  return { seen, wrapper }
}

// A drag left under way by one test must not hear the pointer of the next.
enableAutoUnmount(afterEach)

beforeEach(() => {
  installLayout()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.documentElement.removeAttribute('style')
  document.body.removeAttribute('style')
  document.body.innerHTML = ''
})

describe('SortableSource', () => {
  it('renders only its slot and is not a list of its group', () => {
    const board = mountBoard(items('b1'))
    const source = mountSource()

    expect(source.block.parentElement).toBe(document.body.lastElementChild)
    expect(source.block.hasAttribute('data-vuesortable-source')).toBe(true)
    expect(source.block.getAttribute('data-vuesortable-dragging')).toBe('false')
    expect(source.block.style.touchAction).toBe('none')
    expect(source.block.hasAttribute('role')).toBe(false)
    expect(source.seen.slot).toMatchObject({ dragging: false, overlay: null })
    expect(getGroupedSortableEntries('board').map(entry => entry.id)).toEqual(['board'])

    source.wrapper.unmount()
    board.wrapper.unmount()
  })

  it('shows where it would go in the list under the pointer and stays where it is', async () => {
    const board = mountBoard(items('b1', 'b2'))
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 60)

    expect(orderOf(board.wrapper)).toEqual(['b1', expect.stringMatching(/^\(vuesortable-source-\d+\)$/), 'b2'])
    expect(board.seen.slot?.dropTarget).toEqual({ allowed: true, over: true })
    expect(board.wrapper.get('[data-vuesortable-root]').attributes('data-vuesortable-drop-target')).toBe('over')

    expect(document.body.contains(source.block)).toBe(true)
    expect(source.block.getAttribute('data-vuesortable-dragging')).toBe('true')
    expect(source.seen.slot).toMatchObject({ dragging: true, overlay: { allowed: true, element: text, outside: false } })
    expect(overlayStyle(source.wrapper)).toContain('position: fixed')
    expect(overlayStyle(source.wrapper)).toContain('translate3d(300px, 50px, 0)')
    expect(overlayStyle(source.wrapper)).toContain('width: 120px')
    expect(source.wrapper.emitted('drag-start')?.[0]?.[0]).toMatchObject({ group: 'board', item: text, to: 1, toList: 'board' })
  })

  it('tells the list what was dropped and where, and changes no model itself', async () => {
    const board = mountBoard(items('b1', 'b2'))
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 60)
    await release(320, 60)

    expect(board.wrapper.emitted('receive')).toEqual([[{ data: text, group: 'board', items: items('b1', 'b2'), to: 1, toList: 'board' }]])
    expect(board.wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(orderOf(board.wrapper)).toEqual(['b1', 'b2'])
    expect(board.seen.slot?.dropTarget).toBeNull()

    expect(source.wrapper.emitted('drag-end')?.[0]?.[0]).toMatchObject({ item: text, to: 1, toList: 'board' })
    expect(source.wrapper.emitted('drag-cancel')).toBeUndefined()
    expect(source.seen.slot).toMatchObject({ dragging: false, overlay: null })
  })

  it('lets the list make an item of what it receives', async () => {
    const board = mountBoard(items('b1'), {
      listeners: {
        onReceive: (payload: SortableReceivePayload<Item>) => {
          const block = payload.data as Block
          const next = [...payload.items]
          next.splice(payload.to, 0, { id: `${block.kind}-1`, label: block.kind })
          void board.wrapper.setProps({ modelValue: next })
        },
      },
    })
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 10)
    await release(320, 10)
    await nextTick()

    expect(board.wrapper.props('modelValue')).toEqual([{ id: 'text-1', label: 'text' }, { id: 'b1', label: 'b1' }])
    expect(orderOf(board.wrapper)).toEqual(['text-1', 'b1'])
  })

  it('resolves the index along the axis of a horizontal list', async () => {
    const board = mountBoard(items('r1', 'r2'), { geometry: row, props: { orientation: 'horizontal' } })
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(400, 420)
    await release(400, 420)

    expect(board.wrapper.emitted('receive')?.[0]?.[0]).toMatchObject({ to: 2 })
  })

  it('asks canReceive while it hovers and gives up the drop it refuses', async () => {
    const canReceive = vi.fn((_payload: SortableReceivePayload<Item>): boolean | string => 'No room for text')
    const canDrop = vi.fn(() => true)
    const board = mountBoard(items('b1'), { props: { canDrop, canReceive } })
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 60)

    expect(canReceive).toHaveBeenCalledWith({ data: text, group: 'board', items: items('b1'), to: 1, toList: 'board' })
    expect(board.seen.slot?.dropTarget).toEqual({ allowed: false, over: true, reason: 'No room for text' })
    expect(source.seen.slot?.overlay).toMatchObject({ allowed: false, reason: 'No room for text' })
    expect(source.wrapper.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ reason: 'No room for text' })

    await release(320, 60)

    expect(board.wrapper.emitted('receive')).toBeUndefined()
    expect(source.wrapper.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ item: text, reason: 'No room for text' })
    expect(source.wrapper.emitted('drag-end')).toHaveLength(1)
    // canDrop is for items of other lists.
    expect(canDrop).not.toHaveBeenCalled()
  })

  it('cancels when it is released over no list', async () => {
    const board = mountBoard(items('b1'))
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 10)
    expect(orderOf(board.wrapper)).toHaveLength(2)

    await dragTo(150, 200)
    expect(orderOf(board.wrapper)).toEqual(['b1'])
    expect(board.seen.slot?.dropTarget).toEqual({ allowed: true, over: false })
    expect(source.seen.slot?.overlay).toMatchObject({ outside: true })
    expect(source.wrapper.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ outside: true })

    await release(150, 200)

    expect(board.wrapper.emitted('receive')).toBeUndefined()
    expect(source.wrapper.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ item: text, outside: true })
    expect(board.seen.slot?.dropTarget).toBeNull()
  })

  it('returns the overlay to the source when the drop is cancelled', async () => {
    vi.useFakeTimers()
    mountBoard(items('b1'))
    const source = mountSource({ props: { motion: { list: false } } })

    await press(source.block, 20, 10)
    await dragTo(150, 200)
    expect(overlayStyle(source.wrapper)).toContain('translate3d(130px, 190px, 0)')

    await release(150, 200)
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(overlayStyle(source.wrapper)).toContain('translate3d(0px, 0px, 0)')

    await vi.runAllTimersAsync()
    await nextTick()
    expect(source.seen.slot?.overlay).toBeNull()
  })

  it('leaves a press without a drag as a click and swallows the click that ends a drag', async () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    mountBoard(items('b1'))
    const source = mountSource({ onClick })

    await press(source.block, 20, 10)
    await dragTo(21, 11)
    await release(21, 11)
    source.block.click()

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(source.wrapper.emitted('drag-start')).toBeUndefined()

    await press(source.block, 20, 10)
    await dragTo(320, 10)
    await release(320, 10)
    source.block.click()

    expect(onClick).toHaveBeenCalledTimes(1)

    await vi.runAllTimersAsync()
    source.block.click()
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('does not drag while disabled', async () => {
    const board = mountBoard(items('b1'))
    const source = mountSource({ props: { disabled: true } })

    expect(source.block.style.touchAction).toBe('')

    await press(source.block, 20, 10)
    await dragTo(320, 10)

    expect(orderOf(board.wrapper)).toEqual(['b1'])
    expect(source.wrapper.emitted('drag-start')).toBeUndefined()
  })

  it('leaves nothing behind when it is unmounted in the middle of a drag', async () => {
    const board = mountBoard(items('b1'))
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 10)
    expect(orderOf(board.wrapper)).toHaveLength(2)

    source.wrapper.unmount()
    await nextTick()

    expect(orderOf(board.wrapper)).toEqual(['b1'])
    expect(board.seen.slot?.dropTarget).toBeNull()
    expect(document.documentElement.style.cursor).toBe('')

    await dragTo(320, 60)
    await release(320, 60)
    expect(board.wrapper.emitted('receive')).toBeUndefined()
  })

  it('drops on a list that moves along its axis only', async () => {
    const board = mountBoard(items('b1'))
    const source = mountSource()

    await press(source.block, 20, 10)
    await dragTo(320, 60)
    await release(320, 60)

    expect(board.wrapper.props('movement')).toBe('axis')
    expect(board.wrapper.emitted('receive')?.[0]?.[0]).toMatchObject({ to: 1 })

    // And the list still sorts its own items as before.
    await press(itemOf(board.wrapper, 'b1'), 320, 10)
    await dragTo(320, 20)
    expect(overlayStyle(board.wrapper)).toContain('position: absolute')
  })
})
