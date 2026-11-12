import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Sortable,
  moveItem,
  reorderItems,
} from '../src'
import type {
  SortableCanMovePayload,
  SortableDefaultSlotProps,
  SortableDragPayload,
  SortableItemAttrsResult,
  SortableOverlayRenderState,
  SortableMotion,
  SortableProps,
} from '../src'
import { SortableSource } from '../src'
import type {
  SortableDropTarget,
  SortableMovePayload,
  SortableReceivePayload,
  SortableSourceProps,
  SortableSourceSlotProps,
} from '../src'

type Item = {
  id: string
  label: string
}

describe('public API contract', () => {
  it('exports the documented runtime API', () => {
    expect(Sortable).toBeDefined()
    expect(reorderItems).toBeTypeOf('function')
    expect(moveItem).toBeTypeOf('function')
  })

  it('does not export internal composables', async () => {
    const publicApi = await import('../src')

    expect('useSortableList' in publicApi).toBe(false)
  })

  it('keeps the documented generic types available', () => {
    expectTypeOf<SortableProps<Item>>().toMatchTypeOf<{
      modelValue: Item[]
      itemKey: keyof Item | ((item: Item) => string | number)
      canMove?: (payload: SortableCanMovePayload<Item>) => boolean
      group?: string | { name: string }
      layout?: 'axis' | 'flow'
      overlap?: number
      motion?: SortableMotion
    }>()
    expectTypeOf<SortableDragPayload<Item>>().toHaveProperty('fromList').toEqualTypeOf<string | undefined>()
    expectTypeOf<SortableDragPayload<Item>>().toHaveProperty('toList').toEqualTypeOf<string | undefined>()
    expectTypeOf<SortableDragPayload<Item>>().toHaveProperty('group').toEqualTypeOf<string | undefined>()
    expectTypeOf<SortableDragPayload<Item>>().toHaveProperty('to').toEqualTypeOf<number>()
    expectTypeOf<SortableProps<Item>>().not.toHaveProperty('class')
    expectTypeOf<SortableProps<Item>>().not.toHaveProperty('listClass')
    expectTypeOf<SortableProps<Item>>().not.toHaveProperty('keyboard')
    expectTypeOf<SortableProps<Item>>().not.toHaveProperty('getItemLabel')
    expectTypeOf<SortableDefaultSlotProps<Item>['getItemAttrs']>().toBeFunction()
    expectTypeOf<ReturnType<SortableDefaultSlotProps<Item>['getItemAttrs']>>().toEqualTypeOf<SortableItemAttrsResult>()
    expectTypeOf<SortableOverlayRenderState<Item>['style']>().toBeObject()
  })
})

describe('public API contract for free movement and sources', () => {
  it('exports the drag source', () => {
    expect(SortableSource).toBeDefined()
  })

  it('keeps the new props optional and a 0.2 guard assignable', () => {
    expectTypeOf<SortableProps<Item>>().toMatchTypeOf<{
      movement?: 'axis' | 'free'
      removeOnDropOutside?: boolean
      canDrop?: (payload: SortableCanMovePayload<Item>) => boolean | string
      canReceive?: (payload: SortableReceivePayload<Item>) => boolean | string
    }>()
    expectTypeOf<{ modelValue: Item[], itemKey: 'id' }>().toMatchTypeOf<SortableProps<Item>>()
    expectTypeOf<(payload: SortableCanMovePayload<Item>) => boolean>()
      .toMatchTypeOf<NonNullable<SortableProps<Item>['canDrop']>>()
  })

  it('types what a free drag reports', () => {
    expectTypeOf<SortableDragPayload<Item>>().toHaveProperty('outside').toEqualTypeOf<boolean | undefined>()
    expectTypeOf<SortableMovePayload<Item>>().toHaveProperty('reason').toEqualTypeOf<string | undefined>()
    expectTypeOf<SortableCanMovePayload<Item>>().toHaveProperty('outside').toEqualTypeOf<boolean | undefined>()
    expectTypeOf<SortableDefaultSlotProps<Item>['dropTarget']>().toEqualTypeOf<SortableDropTarget | null>()
    expectTypeOf<SortableOverlayRenderState<Item>>().toMatchTypeOf<{ allowed: boolean, outside: boolean, reason?: string }>()
  })

  it('types a source and what a list receives from it', () => {
    expectTypeOf<SortableSourceProps<Item>>().toMatchTypeOf<{ data: Item, group: string | { name: string } }>()
    expectTypeOf<SortableSourceSlotProps<Item>['overlay']>().toEqualTypeOf<SortableOverlayRenderState<Item> | null>()
    expectTypeOf<SortableReceivePayload<Item>>().toEqualTypeOf<{
      data: unknown
      to: number
      toList: string
      group: string
      items: Item[]
    }>()
  })
})
