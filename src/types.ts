import type { CSSProperties } from 'vue'

export type SortableOrientation = 'vertical' | 'horizontal'

export type SortableBehavior = 'insert'

export type SortableCollision = 'overlap' | 'center'

export type SortableLayout = 'axis' | 'flow'

export type SortableMovement = 'axis' | 'free'

export type SortableGroup = string | { name: string }

export type SortableActivation = {
  threshold?: number
  delay?: number
  delayOnTouchOnly?: boolean
}

export type SortableMotion =
  | false
  | {
      list?: false | {
        type?: 'flip'
        duration?: number
        easing?: string
      }
      drop?: false | {
        type?: 'snap'
        duration?: number
        easing?: string
      }
    }

export type SortableItemKey<T = unknown> = ((item: T) => string | number) | keyof T

export type SortableCanMovePayload<T = unknown> = {
  item: T
  key: string
  from: number
  to: number
  items: T[]
  fromList?: string
  toList?: string
  group?: string
  /** `canMove` is asked whether the item may be removed by a drop outside every list. */
  outside?: boolean
}

export type SortableProps<T = unknown> = {
  modelValue: T[]
  itemKey: SortableItemKey<T>
  listId?: string
  as?: string
  disabled?: boolean
  orientation?: SortableOrientation
  layout?: SortableLayout
  behavior?: SortableBehavior
  collision?: SortableCollision
  group?: SortableGroup
  movement?: SortableMovement
  /** Removes an item released over no list. Implies `movement="free"`. */
  removeOnDropOutside?: boolean
  overlap?: number
  activation?: SortableActivation
  handle?: string
  ignore?: string
  motion?: SortableMotion
  canMove?: (payload: SortableCanMovePayload<T>) => boolean
  /** Return `false` or a string, the reason, to refuse an item coming from another list. */
  canDrop?: (payload: SortableCanMovePayload<T>) => boolean | string
  /** Return `false` or a string, the reason, to refuse what a `SortableSource` holds. */
  canReceive?: (payload: SortableReceivePayload<T>) => boolean | string
}

/** A `SortableSource` over, or dropped on, a list. */
export type SortableReceivePayload<T = unknown> = {
  /** The source's `data`. */
  data: unknown
  /** Where in the list it was dropped. */
  to: number
  toList: string
  group: string
  /** The receiving list's current model. */
  items: T[]
}

export type SortableSourceProps<D = unknown> = {
  /** What the source holds. A list it is dropped on gets it in `receive`. */
  data: D
  group: SortableGroup
  disabled?: boolean
  activation?: SortableActivation
  motion?: SortableMotion
}

export type SortableDragPayload<T = unknown> = {
  item: T
  key: string
  from: number
  to: number
  fromList?: string
  toList?: string
  group?: string
  /** A free drag whose pointer is over no list that could take the item. */
  outside?: boolean
  /** The string `canDrop` returned to refuse the drop. */
  reason?: string
}

export type SortableMovePayload<T = unknown> = SortableDragPayload<T> & {
  activeIndex: number
  pointer: { x: number, y: number }
}

export type SortableItemEntry<T = unknown> = {
  element: T
  index: number
  key: string
  type: 'item'
}

export type SortablePlaceholderEntry = {
  activeKey: string
  height: number
  key: string
  type: 'placeholder'
  width: number
}

export type SortableRenderEntry<T = unknown> = SortableItemEntry<T> | SortablePlaceholderEntry

export type SortableListAttrs = Record<string, unknown>

export type SortableItemAttrsResult = {
  attrs: Record<string, unknown>
}

export type SortablePlaceholderAttrsResult = {
  attrs: Record<string, unknown>
  style: CSSProperties
}

export type SortableOverlayRenderState<T = unknown> = {
  element: T
  index: number
  key: string
  dragging: boolean
  /** A free drag whose pointer is over no list that could take the item. */
  outside: boolean
  /** `false` while a free drag is over a list that refuses it. */
  allowed: boolean
  /** The string that list returned to refuse it. */
  reason?: string
  attrs: Record<string, unknown>
  style: CSSProperties
}

/** What a free drag in progress means for a list it could be dropped on. */
export type SortableDropTarget = {
  /** The pointer is over this list. */
  over: boolean
  /** `false` when this list refuses the drop under the pointer. */
  allowed: boolean
  /** The string this list returned to refuse it. */
  reason?: string
}

export type SortableDefaultSlotProps<T = unknown> = {
  entries: SortableRenderEntry<T>[]
  dragging: boolean
  dropping: boolean
  /** Set on every list a free drag in progress could be dropped on, its own included. */
  dropTarget: SortableDropTarget | null
  listAttrs: SortableListAttrs
  getItemAttrs: (entry: SortableItemEntry<T>) => SortableItemAttrsResult
  getHandleAttrs: (entry: SortableItemEntry<T>) => Record<string, unknown>
  getPlaceholderAttrs: (entry: SortablePlaceholderEntry) => SortablePlaceholderAttrsResult
  overlay: SortableOverlayRenderState<T> | null
}

export type SortableSourceSlotProps<D = unknown> = {
  /** Attributes for the element that is pressed to drag. */
  sourceAttrs: Record<string, unknown>
  dragging: boolean
  overlay: SortableOverlayRenderState<D> | null
}
