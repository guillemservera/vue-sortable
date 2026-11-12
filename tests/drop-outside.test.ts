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
