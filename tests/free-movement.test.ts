import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { ListGeometry } from './helpers'
import { dragTo, installLayout, itemOf, items, mountList, orderOf, overlayStyle, press, release } from './helpers'

// Two columns side by side, one row below them, and room between them all.
const columnA: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 0, top: 0, width: 200 }, size: { height: 40, width: 200 } }
const columnB: ListGeometry = { direction: 'column', gap: 10, root: { height: 300, left: 300, top: 0, width: 200 }, size: { height: 40, width: 200 } }
const row: ListGeometry = { direction: 'row', gap: 10, root: { height: 40, left: 0, top: 400, width: 600 }, size: { height: 40, width: 100 } }

const free = { group: 'board', movement: 'free' } as const

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

describe('free movement', () => {
  it('follows the pointer on both axes with a fixed overlay inside a single list', async () => {
    const list = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { movement: 'free' } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(60, 110)

    expect(orderOf(list)).toEqual(['a2', 'a3', '(a1)'])
    expect(overlayStyle(list)).toContain('position: fixed')
    expect(overlayStyle(list)).toContain('translate3d(40px, 100px, 0)')

    await release(60, 110)

    expect(list.props('modelValue')).toEqual(items('a2', 'a3', 'a1'))
    expect(list.emitted('reorder')?.[0]?.[0]).toMatchObject({ from: 0, key: 'a1', to: 2 })
  })

  it('moves an item between lists that sit side by side', async () => {
    const a = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountList(items('b1', 'b2'), { geometry: columnB, props: { ...free, listId: 'b' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(320, 60)

    expect(orderOf(a)).toEqual(['a2', 'a3'])
    expect(orderOf(b)).toEqual(['b1', '(a1)', 'b2'])
    expect(overlayStyle(a)).toContain('translate3d(300px, 50px, 0)')

    // The placeholder took a slot: the same pointer still resolves to it.
    await dragTo(321, 60)
    expect(orderOf(b)).toEqual(['b1', '(a1)', 'b2'])

    await release(321, 60)

    expect(a.props('modelValue')).toEqual(items('a2', 'a3'))
    expect(b.props('modelValue')).toEqual(items('b1', 'a1', 'b2'))
    expect(a.emitted('reorder')?.[0]?.[0]).toMatchObject({ from: 0, fromList: 'a', group: 'board', key: 'a1', to: 1, toList: 'b' })
    expect(a.emitted('drag-cancel')).toBeUndefined()
  })

  it('resolves the index along the axis of the list under the pointer', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const r = mountList(items('r1', 'r2'), { geometry: row, props: { ...free, listId: 'r', orientation: 'horizontal' } })

    await press(itemOf(a, 'a1'), 20, 10)

    await dragTo(120, 420)
    expect(orderOf(r)).toEqual(['r1', '(a1)', 'r2'])

    await dragTo(10, 420)
    expect(orderOf(r)).toEqual(['(a1)', 'r1', 'r2'])

    await dragTo(400, 420)
    expect(orderOf(r)).toEqual(['r1', 'r2', '(a1)'])

    await release(400, 420)
    expect(r.props('modelValue')).toEqual(items('r1', 'r2', 'a1'))
  })

  it('moves an item from a horizontal list into a vertical one', async () => {
    const r = mountList(items('r1', 'r2'), { geometry: row, props: { ...free, listId: 'r', orientation: 'horizontal' } })
    const b = mountList(items('b1', 'b2'), { geometry: columnB, props: { ...free, listId: 'b' } })

    await press(itemOf(r, 'r2'), 150, 410)
    await dragTo(400, 10)

    expect(orderOf(r)).toEqual(['r1'])
    expect(orderOf(b)).toEqual(['(r2)', 'b1', 'b2'])

    await release(400, 10)
    expect(b.props('modelValue')).toEqual(items('r2', 'b1', 'b2'))
  })

  it('targets the row under the pointer of a wrapped flow list', async () => {
    const a = mountList(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const flow = mountList(items('f1', 'f2', 'f3', 'f4'), {
      geometry: { ...row, columns: 3, root: { height: 90, left: 0, top: 500, width: 330 } },
      props: { ...free, layout: 'flow', listId: 'flow', orientation: 'horizontal' },
    })

    await press(itemOf(a, 'a1'), 20, 10)

    await dragTo(150, 560)
    expect(orderOf(flow)).toEqual(['f1', 'f2', 'f3', 'f4', '(a1)'])

    await dragTo(20, 560)
    expect(orderOf(flow)).toEqual(['f1', 'f2', 'f3', '(a1)', 'f4'])

    await dragTo(150, 520)
    expect(orderOf(flow)).toEqual(['f1', '(a1)', 'f2', 'f3', 'f4'])
  })

  it('drops into an empty list', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const empty = mountList([], { geometry: columnB, props: { ...free, listId: 'empty' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(350, 150)
    expect(orderOf(empty)).toEqual(['(a1)'])

    await release(350, 150)
    expect(empty.props('modelValue')).toEqual(items('a1'))
    expect(a.props('modelValue')).toEqual(items('a2'))
  })

  it('takes the innermost list when their boxes overlap', async () => {
    const a = mountList(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const outer = mountList([], { geometry: { ...columnB, root: { height: 300, left: 300, top: 0, width: 300 } }, props: { ...free, listId: 'outer' } })
    const inner = mountList([], { geometry: { ...columnB, root: { height: 100, left: 400, top: 100, width: 100 } }, props: { ...free, listId: 'inner' } })

    await press(itemOf(a, 'a1'), 20, 10)

    await dragTo(450, 150)
    expect(orderOf(inner)).toEqual(['(a1)'])
    expect(orderOf(outer)).toEqual([])

    await dragTo(320, 20)
    expect(orderOf(inner)).toEqual([])
    expect(orderOf(outer)).toEqual(['(a1)'])
  })

  it('returns the placeholder to where the item was while the pointer is over no list', async () => {
    const a = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountList(items('b1'), { geometry: columnB, props: { ...free, listId: 'b' } })

    await press(itemOf(a, 'a2'), 20, 60)
    await dragTo(320, 10)
    expect(orderOf(a)).toEqual(['a1', 'a3'])
    expect(orderOf(b)).toEqual(['(a2)', 'b1'])

    await dragTo(250, 60)

    expect(orderOf(a)).toEqual(['a1', '(a2)', 'a3'])
    expect(orderOf(b)).toEqual(['b1'])
    expect(a.get('[data-vuesortable-overlay]').attributes('data-vuesortable-outside')).toBe('true')
    expect(overlayStyle(a)).toContain('translate3d(230px, 50px, 0)')
    expect(a.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ from: 1, outside: true, to: 1 })

    await release(250, 60)

    expect(a.props('modelValue')).toEqual(items('a1', 'a2', 'a3'))
    expect(b.props('modelValue')).toEqual(items('b1'))
    expect(a.emitted('reorder')).toBeUndefined()
    expect(a.emitted('drag-cancel')?.[0]?.[0]).toMatchObject({ key: 'a2', outside: true })
    expect(a.emitted('drag-end')).toHaveLength(1)
  })

  it('treats a disabled list as no list', async () => {
    const a = mountList(items('a1'), { geometry: columnA, props: { ...free, listId: 'a' } })
    const b = mountList(items('b1'), { geometry: columnB, props: { ...free, disabled: true, listId: 'b' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(320, 10)

    expect(orderOf(b)).toEqual(['b1'])
    expect(a.emitted('drag-move')?.at(-1)?.[0]).toMatchObject({ outside: true })
  })

  it('lands the overlay on the placeholder of the other list, in viewport coordinates', async () => {
    vi.useFakeTimers()
    const motion = { list: false } as const
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { ...free, listId: 'a', motion } })
    const b = mountList(items('b1', 'b2'), { geometry: columnB, props: { ...free, listId: 'b', motion } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(350, 75)
    expect(orderOf(b)).toEqual(['b1', 'b2', '(a1)'])
    expect(overlayStyle(a)).toContain('translate3d(330px, 65px, 0)')

    await release(350, 75)
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    await nextTick()

    expect(overlayStyle(a)).toContain('position: fixed')
    expect(overlayStyle(a)).toContain('translate3d(300px, 100px, 0)')

    await vi.runAllTimersAsync()
    await nextTick()
    expect(a.find('[data-vuesortable-overlay]').exists()).toBe(false)
  })

  it('keeps the overlay under the pointer between renders', async () => {
    const list = mountList(items('a1', 'a2', 'a3'), { geometry: columnA, props: { movement: 'free' } })

    await press(itemOf(list, 'a1'), 20, 10)
    await dragTo(30, 20)
    // Position-only moves write the transform without a render.
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 22 }))

    expect((list.get('[data-vuesortable-overlay]').element as HTMLElement).style.transform).toBe('translate3d(70px, 12px, 0)')
  })
})

describe('axis movement stays as it was', () => {
  it('ignores a grouped list of another orientation', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { group: 'board', listId: 'a' } })
    const r = mountList(items('r1'), { geometry: row, props: { group: 'board', listId: 'r', orientation: 'horizontal' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(120, 420)

    expect(orderOf(r)).toEqual(['r1'])
    expect(overlayStyle(a)).toContain('position: absolute')
    expect(a.get('[data-vuesortable-overlay]').attributes('data-vuesortable-outside')).toBe('false')

    await release(120, 420)
    expect(r.props('modelValue')).toEqual(items('r1'))
    expect(a.emitted('drag-end')?.[0]?.[0]).not.toHaveProperty('outside')
  })

  it('drops into an empty list stacked along the axis', async () => {
    const a = mountList(items('a1', 'a2'), { geometry: columnA, props: { group: 'board', listId: 'a' } })
    const empty = mountList([], { geometry: { ...columnA, root: { height: 60, left: 0, top: 400, width: 200 } }, props: { group: 'board', listId: 'empty' } })

    await press(itemOf(a, 'a1'), 20, 10)
    await dragTo(20, 420)
    expect(orderOf(empty)).toEqual(['(a1)'])

    await release(20, 420)
    expect(empty.props('modelValue')).toEqual(items('a1'))
    expect(a.props('modelValue')).toEqual(items('a2'))
  })
})
