import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { SortableCanMovePayload } from '../src/types'
import type { Item, ListGeometry } from './helpers'
import { dragTo, installLayout, itemOf, items, mountList, orderOf, overlayStyle, press, release } from './helpers'

const columnA: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 0, top: 0, width: 200 }, size: { height: 40, width: 200 } }
const columnB: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 300, top: 0, width: 200 }, size: { height: 40, width: 200 } }

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

describe('removeOnDropOutside', () => {
  it('closes the gap outside the list and removes the item on release', async () => {
    // Drop motion on: a removed item has nowhere to land, so no overlay may linger.
    const list = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { motion: { list: false }, removeOnDropOutside: true } })

    await press(itemOf(list, 'a2'), 20, 60)
    await dragTo(30, 70)
    expect(orderOf(list)).toEqual(['a1', '(a2)', 'a3'])
    expect(overlayStyle(list)).toContain('position: fixed')

    await dragTo(250, 60)
    expect(orderOf(list)).toEqual(['a1', 'a3'])
    expect(list.get('[data-vuesortable-overlay]').attributes('data-vuesortable-outside')).toBe('true')
    expect(list.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ key: 'a2', outside: true })

    await release(250, 60)

    expect(list.props('modelValue')).toEqual(items('a1', 'a3'))
    expect(list.emitted('update:modelValue')).toHaveLength(1)
    expect(list.emitted('remove')).toEqual([[expect.objectContaining({ from: 1, item: { id: 'a2', label: 'a2' }, key: 'a2', outside: true })]])
    expect(list.emitted('drag-end')).toHaveLength(1)
    expect(list.emitted('drag-cancel')).toBeUndefined()
    expect(list.emitted('reorder')).toBeUndefined()
    expect(list.find('[data-vuesortable-overlay]').exists()).toBe(false)
  })

  it('reorders as usual when the pointer comes back before the release', async () => {
    const list = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    expect(orderOf(list)).toEqual(['a2', 'a3'])

    await dragTo(20, 120)
    expect(orderOf(list)).toEqual(['a2', 'a3', '(a1)'])

    await release(20, 120)
    expect(list.props('modelValue')).toEqual(items('a2', 'a3', 'a1'))
    expect(list.emitted('remove')).toBeUndefined()
  })

  it('moves the item, not removes it, when released over another list of the group', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { group: 'board', listId: 'a', removeOnDropOutside: true } })
    const b = mountList(items('b1'), { geometry: columnB, props: { group: 'board', listId: 'b', removeOnDropOutside: true } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(320, 10)
    await release(320, 10)

    expect(a.props('modelValue')).toEqual(items('a2'))
    expect(b.props('modelValue')).toEqual(items('a1', 'b1'))
    expect(a.emitted('remove')).toBeUndefined()
  })

  it('lets canMove keep an item that is dropped outside', async () => {
    const canMove = vi.fn((payload: SortableCanMovePayload<Item>) => !payload.outside)
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { canMove, removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    await release(250, 10)

    expect(canMove).toHaveBeenCalledWith(expect.objectContaining({ key: 'a1', outside: true }))
    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('remove')).toBeUndefined()
    expect(list.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ key: 'a1', outside: true })
  })

  it('cancels, and removes nothing, when released over a disabled list of the group', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { group: 'board', listId: 'a', removeOnDropOutside: true } })
    const b = mountList(items('b1'), { geometry: columnB, props: { disabled: true, group: 'board', listId: 'b' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(320, 10)

    // Not outside: the gap stays open where the item was, and the overlay does not announce a removal.
    expect(orderOf(a)).toEqual(['(a1)', 'a2'])
    expect(a.get('[data-vuesortable-overlay]').attributes('data-vuesortable-outside')).toBe('false')

    await release(320, 10)

    expect(a.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(b.props('modelValue')).toEqual(items('b1'))
    expect(a.emitted('update:modelValue')).toBeUndefined()
    expect(a.emitted('remove')).toBeUndefined()
    expect(a.emitted('drag-cancel')).toHaveLength(1)
  })

  it('cancels, and removes nothing, when its own list is disabled mid-drag and the release is over it', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(20, 120)
    await list.setProps({ disabled: true })
    await release(20, 120)

    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('update:modelValue')).toBeUndefined()
    expect(list.emitted('remove')).toBeUndefined()
    expect(list.emitted('reorder')).toBeUndefined()
    expect(list.emitted('drag-cancel')).toHaveLength(1)
  })

  it('keeps the item when its own list is disabled mid-drag and the release is outside', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    await list.setProps({ disabled: true })
    await release(250, 10)

    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('remove')).toBeUndefined()
  })

  it('is neither ended nor removed by the release of another pointer', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10, { pointerId: 1 })
    await dragTo(30, 20, { pointerId: 1 })

    // A second finger taps away from the list while the first still holds the item over it.
    await dragTo(250, 10, { pointerId: 2 })
    await release(250, 10, { pointerId: 2 })
    document.dispatchEvent(Object.assign(new MouseEvent('pointercancel', { bubbles: true }), { pointerId: 2 }))
    await nextTick()

    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('remove')).toBeUndefined()
    expect(list.emitted('drag-end')).toBeUndefined()
    expect(list.emitted('drag-cancel')).toBeUndefined()
    expect(orderOf(list)).toEqual(['(a1)', 'a2'])

    await release(30, 20, { pointerId: 1 })
    expect(list.emitted('drag-end')).toHaveLength(1)
    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
  })

  it('cancels, and removes nothing, when the pointer is found released without a pointerup', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    // The mouse button went up out of the window: the next move comes with none held.
    await dragTo(260, 10, { buttons: 0, pointerType: 'mouse' })

    expect(list.emitted('drag-cancel')).toHaveLength(1)
    expect(orderOf(list)).toEqual(['a1', 'a2'])

    await release(260, 10)
    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('remove')).toBeUndefined()
  })

  it('cancels, and removes nothing, when the list loses the pointer capture', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    list.get('[data-vuesortable-root]').element.dispatchEvent(new Event('lostpointercapture', { bubbles: true }))
    await nextTick()

    expect(list.emitted('drag-cancel')).toHaveLength(1)

    await release(250, 10)
    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(list.emitted('remove')).toBeUndefined()
  })

  it('removes nothing when the drag is cancelled outside', async () => {
    const list = mountList(items('a1', 'a2'), { geometry: columnA, props: { removeOnDropOutside: true } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(250, 10)
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
    await nextTick()

    expect(list.props('modelValue')).toEqual(items('a1', 'a2'))
    expect(orderOf(list)).toEqual(['a1', 'a2'])
    expect(list.emitted('remove')).toBeUndefined()
  })
})
