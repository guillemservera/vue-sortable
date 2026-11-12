import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { SortableCanMovePayload, SortableDefaultSlotProps } from '../src/types'
import type { Item, ListGeometry, MountedSortable } from './helpers'
import { dragTo, installLayout, itemOf, items, mountList, orderOf, press, release } from './helpers'

const columnA: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 0, top: 0, width: 200 }, size: { height: 40, width: 200 } }
const columnB: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 300, top: 0, width: 200 }, size: { height: 40, width: 200 } }

const free = { group: 'board', movement: 'free' } as const

function dropTargetAttr(wrapper: MountedSortable) {
  return wrapper.get('[data-vuesortable-root]').attributes('data-vuesortable-drop-target')
}

/** Mounts a list and keeps the slot props of its last render. */
function mountWatched(model: Item[], options: Parameters<typeof mountList>[1]) {
  const seen: { slot: SortableDefaultSlotProps<Item> | null } = { slot: null }
  const wrapper = mountList(model, { ...options, onSlot: slot => (seen.slot = slot) })
  return { seen, wrapper }
}

// A drag left under way by one test must not hear the pointer of the next.
enableAutoUnmount(afterEach)

beforeEach(() => {
  installLayout()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('style')
  document.body.removeAttribute('style')
  document.body.innerHTML = ''
})

describe('drop verdicts of a free drag', () => {
  it('marks every list of the group while the drag is under way', async () => {
    const a = mountWatched(items('a1', 'a2'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountWatched(items('b1'), { geometry: columnB, props: { ...free, listId: 'b' } })

    expect(dropTargetAttr(a.wrapper)).toBeUndefined()
    expect(a.seen.slot?.dropTarget).toBeNull()

    await press(itemOf(a.wrapper, 'a1'), 20, 10)
    await dragTo(30, 20)

    expect(dropTargetAttr(a.wrapper)).toBe('over')
    expect(dropTargetAttr(b.wrapper)).toBe('idle')
    expect(b.seen.slot?.dropTarget).toEqual({ allowed: true, over: false })

    await dragTo(320, 10)

    expect(dropTargetAttr(a.wrapper)).toBe('idle')
    expect(dropTargetAttr(b.wrapper)).toBe('over')
    expect(b.seen.slot?.dropTarget).toEqual({ allowed: true, over: true })

    await dragTo(250, 10)

    expect(dropTargetAttr(a.wrapper)).toBe('idle')
    expect(dropTargetAttr(b.wrapper)).toBe('idle')

    await release(250, 10)

    expect(dropTargetAttr(a.wrapper)).toBeUndefined()
    expect(dropTargetAttr(b.wrapper)).toBeUndefined()
    expect(a.seen.slot?.dropTarget).toBeNull()
    expect(b.seen.slot?.dropTarget).toBeNull()
  })

  it('asks the list under the pointer and reports the reason it gives', async () => {
    const canDrop = vi.fn((_payload: SortableCanMovePayload<Item>): boolean | string => 'Column B is full')
    const a = mountWatched(items('a1', 'a2'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountWatched(items('b1'), { geometry: columnB, props: { ...free, canDrop, listId: 'b' } })

    await press(itemOf(a.wrapper, 'a1'), 20, 10)
    await dragTo(320, 60)

    expect(canDrop).toHaveBeenCalledTimes(1)
    expect(canDrop).toHaveBeenCalledWith(expect.objectContaining({
      from: 0,
      fromList: 'a',
      items: items('b1'),
      key: 'a1',
      to: 1,
      toList: 'b',
    }))
    expect(dropTargetAttr(b.wrapper)).toBe('refused')
    expect(b.seen.slot?.dropTarget).toEqual({ allowed: false, over: true, reason: 'Column B is full' })
    expect(a.seen.slot?.overlay).toMatchObject({ allowed: false, reason: 'Column B is full' })
    expect(a.wrapper.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ reason: 'Column B is full', toList: 'b' })
    // The placeholder stays in the entries: hiding it is the consumer's choice.
    expect(orderOf(b.wrapper)).toEqual(['b1', '(a1)'])

    await release(320, 60)

    expect(a.wrapper.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(b.wrapper.props('modelValue')).toEqual(items('b1'))
    expect(a.wrapper.emitted('reorder')).toBeUndefined()
    expect(a.wrapper.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ key: 'a1', reason: 'Column B is full', toList: 'b' })
    expect(a.wrapper.emitted('drag-end')).toHaveLength(1)
  })

  it('refuses without a reason when the hook returns false', async () => {
    const a = mountWatched(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountWatched(items('b1'), { geometry: columnB, props: { ...free, canDrop: () => false, listId: 'b' } })

    await press(itemOf(a.wrapper, 'a1'), 20, 10)
    await dragTo(320, 60)

    expect(b.seen.slot?.dropTarget).toEqual({ allowed: false, over: true })
    expect(a.seen.slot?.overlay?.allowed).toBe(false)
    expect(a.wrapper.emitted('drag-move')?.at(-1)?.[0]).not.toHaveProperty('reason')

    await release(320, 60)
    expect(b.wrapper.props('modelValue')).toEqual(items('b1'))
  })

  it('asks again when the index changes and forgets the reason once accepted', async () => {
    const canDrop = (payload: SortableCanMovePayload<Item>) => payload.to === 0 ? 'Not first' : true
    const a = mountWatched(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountWatched(items('b1', 'b2'), { geometry: columnB, props: { ...free, canDrop, listId: 'b' } })

    await press(itemOf(a.wrapper, 'a1'), 20, 10)

    await dragTo(320, 10)
    expect(dropTargetAttr(b.wrapper)).toBe('refused')

    await dragTo(320, 120)
    expect(dropTargetAttr(b.wrapper)).toBe('over')
    expect(a.seen.slot?.overlay).toMatchObject({ allowed: true })
    expect(a.seen.slot?.overlay?.reason).toBeUndefined()
    expect(a.wrapper.emitted('drag-move')?.at(-1)?.[0]).not.toHaveProperty('reason')

    await release(320, 120)
    expect(b.wrapper.props('modelValue')).toEqual(items('b1', 'b2', 'a1'))
  })

  it('clears the marks when the drag is cancelled', async () => {
    const a = mountWatched(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountWatched(items('b1'), { geometry: columnB, props: { ...free, listId: 'b' } })

    await press(itemOf(a.wrapper, 'a1'), 20, 10)
    await dragTo(320, 10)
    expect(dropTargetAttr(b.wrapper)).toBe('over')

    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
    await nextTick()

    expect(dropTargetAttr(a.wrapper)).toBeUndefined()
    expect(dropTargetAttr(b.wrapper)).toBeUndefined()
    expect(orderOf(b.wrapper)).toEqual(['b1'])
  })
})

describe('drop verdicts of an axis drag stay as they were', () => {
  // Two lists stacked along their axis, as axis movement needs.
  const below: ListGeometry = { ...columnA, root: { height: 100, left: 0, top: 400, width: 200 } }

  it('asks canDrop on release only and marks no list', async () => {
    const canDrop = vi.fn((_payload: SortableCanMovePayload<Item>): boolean | string => 'Locked')
    const a = mountWatched(items('a1', 'a2'), { geometry: columnA, props: { group: 'board', listId: 'a' } })
    const b = mountWatched(items('b1'), { geometry: below, props: { canDrop, group: 'board', listId: 'b' } })

    await press(itemOf(a.wrapper, 'a1'), 20, 10)
    await dragTo(20, 450)

    expect(orderOf(b.wrapper)).toEqual(['b1', '(a1)'])
    expect(canDrop).not.toHaveBeenCalled()
    expect(dropTargetAttr(a.wrapper)).toBeUndefined()
    expect(dropTargetAttr(b.wrapper)).toBeUndefined()
    expect(b.seen.slot?.dropTarget).toBeNull()
    expect(a.seen.slot?.overlay).toMatchObject({ allowed: true, outside: false })

    await release(20, 450)

    expect(canDrop).toHaveBeenCalledTimes(1)
    expect(b.wrapper.props('modelValue')).toEqual(items('b1'))
    expect(a.wrapper.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ reason: 'Locked', toList: 'b' })
  })
})
