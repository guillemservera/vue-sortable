import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, shallowRef, watch } from 'vue'
import type { CSSProperties, Ref } from 'vue'
import {
  DATA_ATTRIBUTES,
  DEFAULT_ACTIVATION_THRESHOLD,
  DEFAULT_IGNORE_SELECTOR,
  DEFAULT_OVERLAP,
  SELECTORS,
} from '../constants'
import type {
  SortableCollision,
  SortableDefaultSlotProps,
  SortableDragPayload,
  SortableGroup,
  SortableItemAttrsResult,
  SortableItemEntry,
  SortableListAttrs,
  SortableLayout,
  SortableMovePayload,
  SortableOrientation,
  SortableOverlayRenderState,
  SortablePlaceholderAttrsResult,
  SortablePlaceholderEntry,
  SortableProps,
  SortableRenderEntry,
} from '../types'
import { canUseDOM, getLayoutRect, isHTMLElement, safeClosest } from '../utils/dom'
import {
  clamp,
  estimateItemGap,
  findPreviewIndex,
  getRootGeometry,
  measureSortableLayout,
} from '../utils/geometry'
import type { LayoutSnapshot, MeasuredEntry, OverlayPosition, RootGeometry } from '../utils/geometry'
import { normalizeMotion } from '../utils/motion'

type MotionRect = {
  left: number
  top: number
}

type ListMotionMove = {
  deltaX: number
  deltaY: number
  element: HTMLElement
  key: string | undefined
}

type OverlayState<T> = {
  element: T
  height: number
  index: number
  key: string
  left: number
  width: number
  y: number
}

type DragState<T> = OverlayState<T> & {
  delayPassed: boolean
  direction: -1 | 0 | 1
  from: number
  fromList: string
  group: string | null
  item: T
  lastClientX: number
  lastClientY: number
  lastCollisionPoint: number
  layout: LayoutSnapshot<T>
  pointerOffsetX: number
  pointerOffsetY: number
  previewIndex: number
  previewList: string
  startX: number
  startY: number
  started: boolean
}

type DropState<T> = OverlayState<T> & {
  dropping: boolean
  entries: SortableItemEntry<T>[]
  from: number
  item: T
  placeholder?: boolean
  to: number
}

type UseSortableListEmits<T> = {
  updateModelValue: (value: T[]) => void
  dragStart: (payload: SortableDragPayload<T>) => void
  dragMove: (payload: SortableMovePayload<T>) => void
  reorder: (payload: SortableDragPayload<T>) => void
  dragEnd: (payload: SortableDragPayload<T>) => void
  dragCancel: (payload: SortableDragPayload<T>) => void
}

export type UseSortableListOptions<T> = {
  props: Readonly<SortableProps<T>>
  rootRef: Ref<HTMLElement | null>
  emit: UseSortableListEmits<T>
}

type ExternalDragState<T> = {
  activeKey: string
  height: number
  previewIndex: number
  width: number
}

type SortableGroupEntry<T = unknown> = {
  id: string
  clearExternalDrag: () => void
  emit: UseSortableListEmits<T>
  entries: () => SortableItemEntry<T>[]
  group: () => string | null
  layout: () => SortableLayout
  measureLayout: () => LayoutSnapshot<T> | null
  orientation: () => SortableOrientation
  props: Readonly<SortableProps<T>>
  readPlaceholderPosition: (activeKey: string) => OverlayPosition | null
  requestListMotion: () => void
  root: () => HTMLElement | null
  setExternalDrag: (state: ExternalDragState<T> | null) => void
}

let sortableListId = 0
const groupedSortables = new Map<string, Set<SortableGroupEntry>>()

// Exported as a test seam so regression tests can assert the module-level
// registry has no leaked entries after unmount; not part of the public API.
export function getGroupedSortableEntries<T>(group: string): SortableGroupEntry<T>[] {
  return Array.from(groupedSortables.get(group) ?? []) as SortableGroupEntry<T>[]
}

const ROOT_STYLE: CSSProperties = {
  position: 'relative',
}

const INTERACTION_STYLE: CSSProperties = {
  touchAction: 'none',
}

const LIVE_REGION_STYLE: CSSProperties = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
}

export function useSortableList<T = unknown>(options: UseSortableListOptions<T>) {
  const { emit, props, rootRef } = options

  const internalListId = `vuesortable-list-${++sortableListId}`
  const listId = normalizeListId(props.listId) ?? internalListId
  const dragState = shallowRef<DragState<T> | null>(null)
  const dropState = shallowRef<DropState<T> | null>(null)
  const externalDragState = shallowRef<ExternalDragState<T> | null>(null)
  const announcement = shallowRef('')

  let activationDelayTimer: number | null = null
  let dropAnimationFrame: number | null = null
  let dropAnimationTimer: number | null = null
  let listMotionFrame: number | null = null
  let listMotionCleanupTimer: number | null = null
  let shouldRunListMotion = false
  let shouldRefreshLayout = false
  let restoreDocumentCursor: (() => void) | null = null
  let flowResizeObserver: ResizeObserver | null = null

  const listMotionRects = new Map<string, MotionRect>()
  const listMotionElements = new Set<HTMLElement>()
  const listMotionAnimations = new Map<HTMLElement, Animation>()

  const orientation = computed<SortableOrientation>(() => props.orientation ?? 'vertical')
  const layout = computed<SortableLayout>(() => props.layout ?? 'axis')
  const collision = computed<SortableCollision>(() => props.collision ?? 'overlap')
  const groupName = computed(() => normalizeGroupName(props.group))
  const overlap = computed(() => clamp(props.overlap ?? DEFAULT_OVERLAP, 0, 1))
  const motion = computed(() => normalizeMotion(props.motion))

  const entries = computed<SortableItemEntry<T>[]>(() =>
    props.modelValue.map((element, index) => ({
      element,
      index,
      key: resolveItemKey(element),
      type: 'item',
    })),
  )

  const layoutEntries = computed<SortableRenderEntry<T>[]>(() => {
    const state = dragState.value
    if (state?.started) {
      if (state.previewList === listId) {
        return buildLayoutEntries(entries.value, state.key, state.previewIndex, state.height, state.width)
      }

      return entries.value.filter(entry => entry.key !== state.key)
    }

    const dropping = dropState.value
    if (dropping) {
      if (dropping.placeholder === false) return dropping.entries
      return buildLayoutEntries(dropping.entries, dropping.key, dropping.to, dropping.height, dropping.width)
    }

    const externalDrag = externalDragState.value
    if (externalDrag) {
      return buildLayoutEntries(entries.value, externalDrag.activeKey, externalDrag.previewIndex, externalDrag.height, externalDrag.width)
    }

    return entries.value
  })

  const overlayState = computed(() => {
    if (dragState.value?.started) return dragState.value
    return dropState.value
  })

  const isDragging = computed(() => dragState.value?.started === true)
  const isDropping = computed(() => dropState.value !== null)
  const isSorting = computed(() => isDragging.value || isDropping.value)

  const overlayStyle = computed<CSSProperties | undefined>(() => {
    const overlay = overlayState.value
    if (!overlay) return undefined

    const dropMotion = motion.value.drop
    const style: CSSProperties = {
      height: `${overlay.height}px`,
      left: '0px',
      pointerEvents: 'none',
      position: 'absolute',
      top: '0px',
      transform: `translate3d(${overlay.left}px, ${overlay.y}px, 0)`,
      width: `${overlay.width}px`,
    }

    if (dropState.value?.dropping && dropMotion !== false) {
      style.transition = `transform ${dropMotion.duration}ms ${dropMotion.easing}`
    }

    return style
  })

  function resolveItemKey(item: T) {
    if (typeof props.itemKey === 'function') return String(props.itemKey(item))
    return String((item as Record<PropertyKey, unknown>)[props.itemKey as PropertyKey])
  }

  function getRootElement() {
    return isHTMLElement(rootRef.value) ? rootRef.value : null
  }

  const groupEntry: SortableGroupEntry<T> = {
    id: listId,
    clearExternalDrag: () => {
      externalDragState.value = null
    },
    emit,
    entries: () => entries.value,
    group: () => groupName.value,
    layout: () => layout.value,
    measureLayout: () => measureCurrentLayout(),
    orientation: () => orientation.value,
    props,
    readPlaceholderPosition: activeKey => readPlaceholderPosition(activeKey),
    requestListMotion: () => requestListMotion(),
    root: () => getRootElement(),
    setExternalDrag: (state) => {
      externalDragState.value = state as ExternalDragState<T> | null
    },
  }

  function getItemElement(key: string) {
    const root = getRootElement()
    if (!root) return null

    return Array
      .from(root.querySelectorAll<HTMLElement>(SELECTORS.item))
      .find(element => element.dataset.vuesortableItemKey === key) ?? null
  }

  function getItemHandleElement(key: string) {
    return getItemElement(key)?.querySelector<HTMLElement>(SELECTORS.handle) ?? null
  }

  function measureCurrentLayout() {
    const root = getRootElement()
    if (!root) return null

    const rootRect = root.getBoundingClientRect()
    return measureSortableLayout(root, rootRect, entries.value, SELECTORS.item)
  }

  function shouldIgnoreTarget(target: EventTarget | null) {
    if (props.handle) return safeClosest(target, props.handle) === null
    return Boolean(safeClosest(target, props.ignore ?? DEFAULT_IGNORE_SELECTOR))
  }

  function handlePointerDown(event: PointerEvent, entry: SortableItemEntry<T>, force = false) {
    if (props.disabled || dropState.value || dragState.value || !canUseDOM()) return
    if (typeof event.button === 'number' && event.button !== 0) return
    if (!force && shouldIgnoreTarget(event.target)) return

    const root = getRootElement()
    const itemElement = getItemElement(entry.key)
    if (!root || !itemElement) return

    const rootRect = root.getBoundingClientRect()
    const itemRect = itemElement.getBoundingClientRect()
    const layout = measureSortableLayout(root, rootRect, entries.value, SELECTORS.item)
    const rootGeometry = getRootGeometry(root, rootRect)
    const measuredItem = layout.items.find(item => item.key === entry.key)
    const height = measuredItem?.height ?? itemRect.height
    const width = measuredItem?.width ?? itemRect.width
    const initialLeft = measuredItem?.left ?? itemRect.left - rootGeometry.left
    const initialY = measuredItem?.top ?? itemRect.top - rootGeometry.top
    const left = orientation.value === 'horizontal'
      ? clamp(initialLeft, 0, Math.max(0, rootGeometry.width - width))
      : initialLeft
    const y = orientation.value === 'horizontal'
      ? initialY
      : clamp(initialY, 0, Math.max(0, rootGeometry.height - height))

    const initialCollisionPoint = orientation.value === 'horizontal'
      ? left + width / 2
      : y + height / 2

    dragState.value = {
      delayPassed: !shouldDelayActivation(event),
      direction: 0,
      element: entry.element,
      from: entry.index,
      fromList: listId,
      group: groupName.value,
      height,
      index: entry.index,
      item: entry.element,
      key: entry.key,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastCollisionPoint: initialCollisionPoint,
      layout,
      left,
      pointerOffsetX: event.clientX - itemRect.left,
      pointerOffsetY: event.clientY - itemRect.top,
      previewIndex: entry.index,
      previewList: listId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      width,
      y,
    }

    // Capture the pointer on the root so composited scroll on the parent
    // container does not drop pointermove events mid-drag. The active item
    // itself disappears from the DOM once the drag starts, so root is the
    // only stable capture target.
    if (typeof root.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        root.setPointerCapture(event.pointerId)
      }
      catch {
        // Pointer capture is best-effort; safe to ignore if the browser rejects it.
      }
    }

    lockDocumentDragCursor(event)
    startActivationDelay(event)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    event.preventDefault()
  }

  function shouldDelayActivation(event: PointerEvent) {
    const activation = props.activation
    const delay = activation?.delay ?? 0
    if (delay <= 0) return false
    if (!activation?.delayOnTouchOnly) return true

    return event.pointerType === 'touch'
  }

  function startActivationDelay(event: PointerEvent) {
    if (!canUseDOM() || !shouldDelayActivation(event)) return

    const delay = props.activation?.delay ?? 0
    activationDelayTimer = window.setTimeout(() => {
      activationDelayTimer = null
      const state = dragState.value
      if (!state) return
      dragState.value = { ...state, delayPassed: true }
    }, delay)
  }

  function handlePointerMove(event: PointerEvent) {
    const state = dragState.value
    if (!state) return

    if (!state.delayPassed) {
      event.preventDefault()
      return
    }

    const threshold = props.activation?.threshold ?? DEFAULT_ACTIVATION_THRESHOLD
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
    if (!state.started && distance < threshold) return

    const clientAxis = orientation.value === 'horizontal' ? event.clientX : event.clientY
    const previousClientAxis = orientation.value === 'horizontal' ? state.lastClientX : state.lastClientY
    const delta = clientAxis - previousClientAxis
    const direction: -1 | 0 | 1 = delta > 0 ? 1 : delta < 0 ? -1 : state.direction
    const target = resolveDragTarget(event, state, direction)
    const position = target.sourcePosition
    const previewIndex = target.previewIndex

    if (!state.started) {
      const nextState = {
        ...state,
        direction,
        index: previewIndex,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        lastCollisionPoint: target.collisionPoint,
        left: position.left,
        previewIndex,
        previewList: target.entry.id,
        started: true,
        y: position.y,
      }
      requestListMotion()
      updateGroupPreview(state, nextState, target.entry, previewIndex)
      dragState.value = nextState
      if (layout.value === 'flow') {
        void nextTick(pinFlowOverlayAfterRender)
        observeFlowResize(target.entry)
      }
      emit.dragStart(payloadFromState(nextState))
      emit.dragMove(movePayloadFromState(nextState, event))
      event.preventDefault()
      return
    }

    if (previewIndex !== state.previewIndex || target.entry.id !== state.previewList) {
      const nextState = {
        ...state,
        direction,
        index: previewIndex,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        lastCollisionPoint: target.collisionPoint,
        left: position.left,
        previewIndex,
        previewList: target.entry.id,
        y: position.y,
      }
      requestListMotion(
        target.entry.id === state.previewList
          ? { from: state.previewIndex, to: previewIndex }
          : undefined,
      )
      updateGroupPreview(state, nextState, target.entry, previewIndex)
      dragState.value = nextState
      if (layout.value === 'flow') {
        void nextTick(pinFlowOverlayAfterRender)
        if (target.entry.id !== state.previewList) observeFlowResize(target.entry)
      }
      emit.dragMove(movePayloadFromState(nextState, event))
    }
    else if (
      position.left !== state.left
      || position.y !== state.y
      || direction !== state.direction
    ) {
      // Fast path: position-only moves mutate the (shallowRef) state in place
      // and write the overlay transform straight to the element, so tracking
      // the pointer never re-renders the whole slot (entries + overlay) per
      // pointermove — the measured per-move cost on long lists. Semantic
      // updates (index/list changes above) still replace the ref with fresh
      // coordinates, so reactive consumers never observe stale positions.
      state.direction = direction
      state.lastClientX = event.clientX
      state.lastClientY = event.clientY
      state.lastCollisionPoint = target.collisionPoint
      state.left = position.left
      state.y = position.y
      applyOverlayTransform(position.left, position.y)
      emit.dragMove(movePayloadFromState(state, event))
    }

    event.preventDefault()
  }

  function applyOverlayTransform(left: number, y: number) {
    if (!canUseDOM()) return
    const root = getRootElement()
    const overlayEl = root?.parentElement?.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.overlay}]`)
      ?? document.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.overlay}]`)
    if (overlayEl) overlayEl.style.transform = `translate3d(${left}px, ${y}px, 0)`
  }

  function handlePointerUp(event: PointerEvent) {
    let state = dragState.value
    if (!state) return

    clearActivationDelay()

    if (!state.started) {
      cleanupDrag(false)
      return
    }

    state = resolveFinalDragState(event, state)
    const targetEntry = state.group
      ? getRegisteredGroupEntry(state.group, state.previewList) as SortableGroupEntry<T> | null
      : null
    if (targetEntry && targetEntry.id !== listId) {
      finishCrossListDrag(state, targetEntry)
      return
    }

    const payload = payloadFromState(state)
    const allowed = props.canMove?.({
      from: payload.from,
      fromList: payload.fromList,
      group: payload.group,
      item: payload.item,
      items: [...props.modelValue],
      key: payload.key,
      to: payload.to,
      toList: payload.toList,
    }) ?? true
    const moved = payload.from !== payload.to
    const finalEntries = allowed && moved ? buildFinalEntries(state) : entries.value
    const targetPosition = allowed
      ? readPlaceholderPosition(state.key) ?? estimateTargetPosition(state)
      : originalTargetPosition(state)

    if (allowed && moved) requestListMotion()

    if (allowed && moved) {
      emit.updateModelValue(finalEntries.map(entry => entry.element))
      emit.reorder(payload)
    }
    else if (!allowed) {
      emit.dragCancel(payload)
    }

    emit.dragEnd(payload)
    clearPointerListeners()
    restoreDocumentDragCursor()
    clearGroupPreview(state)
    dragState.value = null

    startDropAnimation({
      dropping: false,
      element: state.element,
      entries: finalEntries,
      from: state.from,
      height: state.height,
      index: allowed ? payload.to : state.from,
      item: state.item,
      key: state.key,
      left: state.left,
      to: allowed ? payload.to : state.from,
      width: state.width,
      y: state.y,
    }, targetPosition)
  }

  function resolveFinalDragState(event: PointerEvent, state: DragState<T>) {
    const target = resolveDragTarget(event, state, state.direction)
    if (target.previewIndex === state.previewIndex && target.entry.id === state.previewList) {
      return state
    }

    const nextState = {
      ...state,
      index: target.previewIndex,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastCollisionPoint: target.collisionPoint,
      left: target.sourcePosition.left,
      previewIndex: target.previewIndex,
      previewList: target.entry.id,
      y: target.sourcePosition.y,
    }
    updateGroupPreview(state, nextState, target.entry, target.previewIndex)
    dragState.value = nextState
    return nextState
  }

  function finishCrossListDrag(state: DragState<T>, targetEntry: SortableGroupEntry<T>) {
    const payload = payloadFromState(state)
    const sourceAllowed = props.canMove?.({
      from: payload.from,
      fromList: payload.fromList,
      group: payload.group,
      item: payload.item,
      items: [...props.modelValue],
      key: payload.key,
      to: payload.to,
      toList: payload.toList,
    }) ?? true
    const targetAllowed = targetEntry.props.canDrop?.({
      from: payload.from,
      fromList: payload.fromList,
      group: payload.group,
      item: payload.item,
      items: [...targetEntry.props.modelValue],
      key: payload.key,
      to: payload.to,
      toList: payload.toList,
    }) ?? true
    const allowed = sourceAllowed && targetAllowed

    const sourceEntries = entries.value
    const active = sourceEntries.find(entry => entry.key === state.key)
    const sourceFinalEntries = sourceEntries.filter(entry => entry.key !== state.key)
    const targetFinalEntries = allowed && active
      ? insertEntry(targetEntry.entries(), active, state.previewIndex)
      : targetEntry.entries()
    const targetPosition = allowed
      ? convertPositionFromEntry(
          targetEntry,
          targetEntry.readPlaceholderPosition(state.key) ?? estimateTargetPositionForEntry(targetEntry, state),
        )
      : originalTargetPosition(state)

    if (allowed && active) {
      requestListMotion()
      targetEntry.requestListMotion()
    }

    clearGroupPreview(state)

    if (allowed && active) {
      emit.updateModelValue(sourceFinalEntries.map(entry => entry.element))
      targetEntry.emit.updateModelValue(targetFinalEntries.map(entry => entry.element))
      emit.reorder(payload)
    }
    else {
      emit.dragCancel(payload)
    }

    emit.dragEnd(payload)
    clearPointerListeners()
    restoreDocumentDragCursor()
    dragState.value = null

    startDropAnimation({
      dropping: false,
      element: state.element,
      entries: sourceFinalEntries,
      from: state.from,
      height: state.height,
      index: allowed ? payload.to : state.from,
      item: state.item,
      key: state.key,
      left: state.left,
      placeholder: false,
      to: allowed ? payload.to : state.from,
      width: state.width,
      y: state.y,
    }, targetPosition)
  }

  function handlePointerCancel() {
    cleanupDrag(true)
  }

  function handleKeyboardMove(event: KeyboardEvent, entry: SortableItemEntry<T>) {
    if (props.disabled || event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const to = getKeyboardTargetIndex(event.key, entry.index)
    if (to === null) return

    event.preventDefault()
    reorderFromKeyboard(entry, to)
  }

  function getKeyboardTargetIndex(key: string, currentIndex: number) {
    switch (key) {
      case 'ArrowDown':
      case 'ArrowRight':
        return clamp(currentIndex + 1, 0, entries.value.length - 1)
      case 'ArrowUp':
      case 'ArrowLeft':
        return clamp(currentIndex - 1, 0, entries.value.length - 1)
      case 'Home':
        return 0
      case 'End':
        return entries.value.length - 1
      default:
        return null
    }
  }

  function reorderFromKeyboard(entry: SortableItemEntry<T>, targetIndex: number) {
    if (targetIndex === entry.index) return

    const payload: SortableDragPayload<T> = {
      from: entry.index,
      item: entry.element,
      key: entry.key,
      to: targetIndex,
    }
    if (groupName.value) {
      payload.fromList = listId
      payload.group = groupName.value
      payload.toList = listId
    }
    const allowed = props.canMove?.({
      from: payload.from,
      fromList: payload.fromList,
      group: payload.group,
      item: payload.item,
      items: [...props.modelValue],
      key: payload.key,
      to: payload.to,
      toList: payload.toList,
    }) ?? true

    if (!allowed) {
      announcement.value = `Could not move ${getAnnouncementLabel(entry)}.`
      return
    }

    const finalEntries = moveEntry(entries.value, entry.index, targetIndex)
    emit.updateModelValue(finalEntries.map(item => item.element))
    emit.reorder(payload)
    announcement.value = `Moved ${getAnnouncementLabel(entry)} from position ${entry.index + 1} to ${targetIndex + 1}.`
    focusHandleAfterUpdate(entry.key)
  }

  function getAnnouncementLabel(entry: SortableItemEntry<T>) {
    return entry.key.trim() || `item ${entry.index + 1}`
  }

  async function focusHandleAfterUpdate(key: string) {
    if (!canUseDOM()) return

    await nextTick()
    getItemHandleElement(key)?.focus()
  }

  function resolveDragTarget(event: PointerEvent, state: DragState<T>, direction: -1 | 0 | 1) {
    const rawSourcePosition = resolveOverlayPositionRaw(event, state)
    const targetEntry = getGroupedTargetEntry(event, state) ?? groupEntry
    const targetLayout = targetEntry.id === listId
      ? state.layout
      : targetEntry.measureLayout() ?? state.layout
    const targetPosition = resolveOverlayPositionForEntry(event, state, targetEntry)
    const stateForFind = {
      ...state,
      direction,
      layout: targetLayout as LayoutSnapshot<T>,
    }
    // In flow layouts the placeholder's live rect participates in the index
    // resolution: its row must exist as a line band (it may wrap onto a row of
    // its own) and its span is a stable dead zone. Only meaningful once the
    // placeholder is rendered inside the entry being targeted.
    const placeholderPosition = state.started && state.previewList === targetEntry.id && targetEntry.layout() === 'flow'
      ? targetEntry.readPlaceholderPosition(state.key)
      : null
    const placeholderRect = placeholderPosition
      ? {
          height: state.height,
          index: state.previewIndex,
          left: placeholderPosition.left,
          top: placeholderPosition.y,
          width: state.width,
        }
      : undefined
    const pinnedPlaceholder = placeholderPosition ? toSourceRootPosition(placeholderPosition, targetEntry) : null
    const freePosition = resolveOverlayPosition(event, state, targetEntry.id === listId ? null : targetEntry)
    const sourcePosition = pinnedPlaceholder ? pinFlowOverlay(freePosition, pinnedPlaceholder) : freePosition
    // Root-relative cursor position: flow layouts aim line selection with the
    // actual pointer instead of the overlay centre (off-centre grabs diverge).
    const targetRoot = targetEntry.layout() === 'flow' ? targetEntry.root() : null
    const pointerPosition = targetRoot
      ? (() => {
          const rootGeometry = getRootGeometry(targetRoot)
          return {
            left: event.clientX - rootGeometry.left,
            y: event.clientY - rootGeometry.top,
          }
        })()
      : undefined
    const previewIndex = findPreviewIndex(targetPosition, stateForFind, targetEntry.orientation(), collision.value, overlap.value, targetEntry.layout(), placeholderRect, pointerPosition)
    const collisionPoint = targetEntry.orientation() === 'horizontal'
      ? targetPosition.left + state.width / 2
      : targetPosition.y + state.height / 2

    return {
      collisionPoint,
      entry: targetEntry,
      previewIndex,
      sourcePosition,
    }
  }

  // Flow overlays ride the placeholder's row: the cross axis is pinned to the
  // placeholder and only the main axis follows the pointer.
  function pinFlowOverlay(position: OverlayPosition, placeholder: OverlayPosition): OverlayPosition {
    return orientation.value === 'horizontal'
      ? { left: position.left, y: placeholder.y }
      : { left: placeholder.left, y: position.y }
  }

  function toSourceRootPosition(position: OverlayPosition, entry: SortableGroupEntry<T>): OverlayPosition | null {
    if (entry.id === listId) return position

    const root = getRootElement()
    const targetRoot = entry.root()
    if (!root || !targetRoot) return null

    const source = getRootGeometry(root)
    const target = getRootGeometry(targetRoot)
    return {
      left: position.left + target.left - source.left,
      y: position.y + target.top - source.top,
    }
  }

  // After a retarget the placeholder may render on another row; move the
  // overlay there without waiting for the next pointer move.
  function pinFlowOverlayAfterRender() {
    const state = dragState.value
    if (!state?.started) return

    const entry = state.previewList === listId
      ? groupEntry
      : state.group ? getRegisteredGroupEntry(state.group, state.previewList) as SortableGroupEntry<T> | null : null
    const placeholder = entry?.readPlaceholderPosition(state.key)
    const pinnedPlaceholder = entry && placeholder ? toSourceRootPosition(placeholder, entry) : null
    if (!pinnedPlaceholder) return

    const position = pinFlowOverlay(state, pinnedPlaceholder)
    if (position.left === state.left && position.y === state.y) return

    state.left = position.left
    state.y = position.y
    applyOverlayTransform(position.left, position.y)
  }

  // A container resize can rewrap the placeholder onto another row without
  // any pointer move or index change; keep the overlay on its row. Watches
  // this root plus the grouped list currently holding the placeholder.
  function observeFlowResize(previewEntry: SortableGroupEntry<T>) {
    const root = getRootElement()
    if (!root || typeof ResizeObserver === 'undefined') return

    flowResizeObserver?.disconnect()
    flowResizeObserver = new ResizeObserver(pinFlowOverlayAfterRender)
    flowResizeObserver.observe(root)
    const previewRoot = previewEntry.root()
    if (previewRoot && previewRoot !== root) flowResizeObserver.observe(previewRoot)
  }

  function getGroupedTargetEntry(event: PointerEvent, state: DragState<T>): SortableGroupEntry<T> | null {
    const group = groupName.value
    if (!group) return null

    const candidates: Array<{ entry: SortableGroupEntry<T>, rect: DOMRect }> = []
    for (const entry of getGroupedSortableEntries<T>(group)) {
      const root = entry.root()
      if (entry.props.disabled) continue
      if (entry.orientation() !== orientation.value) continue
      if (entry.layout() !== layout.value) continue
      if (!root?.isConnected) continue
      candidates.push({
        entry,
        rect: root.getBoundingClientRect(),
      })
    }

    if (candidates.length === 0) return null

    if (layout.value === 'axis') {
      return findAxisGroupTarget(
        candidates,
        getOverlayCenterInViewport(event, state, orientation.value),
        orientation.value,
      )
    }

    return candidates
      .map(candidate => ({
        distance: distanceToRect(event.clientX, event.clientY, candidate.rect),
        entry: candidate.entry,
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.entry ?? null
  }

  function updateGroupPreview(previousState: DragState<T>, nextState: DragState<T>, targetEntry: SortableGroupEntry<T>, previewIndex: number) {
    if (!previousState.group) return

    const previousTarget = getRegisteredGroupEntry(previousState.group, previousState.previewList)
    if (previousTarget && previousTarget.id !== listId && previousTarget.id !== targetEntry.id) {
      previousTarget.requestListMotion()
      previousTarget.clearExternalDrag()
    }

    if (targetEntry.id === listId) {
      groupEntry.clearExternalDrag()
      return
    }

    targetEntry.requestListMotion()
    targetEntry.setExternalDrag({
      activeKey: nextState.key,
      height: nextState.height,
      previewIndex,
      width: nextState.width,
    } as ExternalDragState<T>)
  }

  function getOverlayBounds(
    rootGeometry: RootGeometry,
    state: Pick<DragState<T>, 'height' | 'width'>,
    overflowEntry: SortableGroupEntry<T> | null,
  ) {
    let minLeft = 0
    let minY = 0
    let maxLeft = Math.max(0, rootGeometry.width - state.width)
    let maxY = Math.max(0, rootGeometry.height - state.height)

    const targetRoot = overflowEntry?.root()
    if (!targetRoot) {
      return { maxLeft, maxY, minLeft, minY }
    }

    const targetGeometry = getRootGeometry(targetRoot)
    const targetLeft = targetGeometry.left - rootGeometry.left
    const targetTop = targetGeometry.top - rootGeometry.top

    minLeft = Math.min(minLeft, targetLeft)
    minY = Math.min(minY, targetTop)
    maxLeft = Math.max(maxLeft, targetLeft + Math.max(0, targetGeometry.width - state.width))
    maxY = Math.max(maxY, targetTop + Math.max(0, targetGeometry.height - state.height))

    return { maxLeft, maxY, minLeft, minY }
  }

  function resolveOverlayPositionRaw(event: PointerEvent, state: DragState<T>): OverlayPosition {
    const root = getRootElement()
    if (!root) return { left: state.left, y: state.y }

    const rootGeometry = getRootGeometry(root)
    return {
      left: event.clientX - rootGeometry.left - state.pointerOffsetX,
      y: event.clientY - rootGeometry.top - state.pointerOffsetY,
    }
  }

  function resolveOverlayPosition(event: PointerEvent, state: DragState<T>, overflowEntry: SortableGroupEntry<T> | null = null): OverlayPosition {
    const root = getRootElement()
    if (!root) return { left: state.left, y: state.y }

    const rootGeometry = getRootGeometry(root)
    const bounds = getOverlayBounds(rootGeometry, state, overflowEntry)
    const raw = resolveOverlayPositionRaw(event, state)

    if (layout.value === 'flow') {
      return {
        left: clamp(raw.left, bounds.minLeft, bounds.maxLeft),
        y: clamp(raw.y, bounds.minY, bounds.maxY),
      }
    }

    if (orientation.value === 'horizontal') {
      return {
        left: clamp(raw.left, bounds.minLeft, bounds.maxLeft),
        y: state.y,
      }
    }

    return {
      left: state.left,
      y: clamp(raw.y, bounds.minY, bounds.maxY),
    }
  }

  function resolveOverlayPositionForEntry(event: PointerEvent, state: DragState<T>, entry: SortableGroupEntry<T>): OverlayPosition {
    const root = entry.root()
    if (!root) return resolveOverlayPosition(event, state)

    const rootGeometry = getRootGeometry(root)
    if (entry.layout() === 'flow') {
      return {
        left: event.clientX - rootGeometry.left - state.pointerOffsetX,
        y: event.clientY - rootGeometry.top - state.pointerOffsetY,
      }
    }

    if (entry.orientation() === 'horizontal') {
      return {
        left: event.clientX - rootGeometry.left - state.pointerOffsetX,
        y: state.y,
      }
    }

    return {
      left: state.left,
      y: event.clientY - rootGeometry.top - state.pointerOffsetY,
    }
  }

  function buildFinalEntries(state: DragState<T>) {
    const active = entries.value.find(entry => entry.key === state.key)
    if (!active) return entries.value

    const withoutActive = entries.value.filter(entry => entry.key !== state.key)
    const finalIndex = clamp(state.previewIndex, 0, withoutActive.length)
    const next = [...withoutActive]
    next.splice(finalIndex, 0, active)
    return next
  }

  function clearGroupPreview(state: DragState<T>) {
    if (!state.group) return

    for (const entry of groupedSortables.get(state.group) ?? []) {
      if (entry.id === listId) continue
      entry.clearExternalDrag()
    }
  }

  function readPlaceholderPosition(activeKey: string): OverlayPosition | null {
    const root = getRootElement()
    if (!root) return null

    const placeholder = Array
      .from(root.querySelectorAll<HTMLElement>(SELECTORS.placeholder))
      .find(element => element.dataset.vuesortablePlaceholder === activeKey)

    if (!placeholder) return null

    const rootGeometry = getRootGeometry(root)
    // Layout rect: the placeholder itself FLIP-animates on relocation, and a
    // mid-flight rect would misplace the dead zone and the line bands.
    const rect = getLayoutRect(placeholder)
    return {
      left: rect.left - rootGeometry.left,
      y: rect.top - rootGeometry.top,
    }
  }

  function estimateTargetPosition(state: DragState<T>): OverlayPosition {
    const measuredItems = state.layout.items.filter(item => item.key !== state.key)
    const finalIndex = clamp(state.previewIndex, 0, measuredItems.length)

    if (finalIndex < measuredItems.length) {
      const targetItem = measuredItems[finalIndex]
      return {
        left: targetItem?.left ?? state.left,
        y: targetItem?.top ?? state.y,
      }
    }

    const previousItem = measuredItems[measuredItems.length - 1]
    if (!previousItem) return { left: 0, y: 0 }

    if (orientation.value === 'horizontal') {
      return {
        left: previousItem.left + previousItem.width + estimateItemGap(measuredItems, orientation.value),
        y: previousItem.top,
      }
    }

    return {
      left: previousItem.left,
      y: previousItem.top + previousItem.height + estimateItemGap(measuredItems, orientation.value),
    }
  }

  function estimateTargetPositionForEntry(entry: SortableGroupEntry<T>, state: DragState<T>): OverlayPosition {
    const layout = entry.measureLayout()
    if (!layout) return { left: 0, y: 0 }

    const measuredItems = layout.items.filter(item => item.key !== state.key)
    const finalIndex = clamp(state.previewIndex, 0, measuredItems.length)

    if (finalIndex < measuredItems.length) {
      const targetItem = measuredItems[finalIndex]
      return {
        left: targetItem?.left ?? 0,
        y: targetItem?.top ?? 0,
      }
    }

    const previousItem = measuredItems[measuredItems.length - 1]
    if (!previousItem) return { left: 0, y: 0 }

    if (entry.orientation() === 'horizontal') {
      return {
        left: previousItem.left + previousItem.width + estimateItemGap(measuredItems, entry.orientation()),
        y: previousItem.top,
      }
    }

    return {
      left: previousItem.left,
      y: previousItem.top + previousItem.height + estimateItemGap(measuredItems, entry.orientation()),
    }
  }

  function convertPositionFromEntry(entry: SortableGroupEntry<T>, position: OverlayPosition): OverlayPosition {
    const sourceRoot = getRootElement()
    const targetRoot = entry.root()
    if (!sourceRoot || !targetRoot) return position

    const sourceRect = sourceRoot.getBoundingClientRect()
    const targetRect = targetRoot.getBoundingClientRect()
    return {
      left: targetRect.left - sourceRect.left + position.left,
      y: targetRect.top - sourceRect.top + position.y,
    }
  }

  function originalTargetPosition(state: DragState<T>) {
    const original = state.layout.items.find(item => item.key === state.key)
    if (!original) return { left: state.left, y: state.y }

    return {
      left: original.left,
      y: original.top,
    }
  }

  /** Index band a same-list crossing can displace (placeholder from → to). */
  type ListMotionRange = { from: number, to: number }

  function requestListMotion(range?: ListMotionRange) {
    shouldRunListMotion = motion.value.list !== false
    shouldRefreshLayout = true

    if (shouldRunListMotion) captureListMotionRects(range)
  }

  function getListMotionElements() {
    const root = getRootElement()
    if (!root) return []

    return Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.motion))
  }

  function captureListMotionRects(range?: ListMotionRange) {
    listMotionRects.clear()
    if (!shouldRunListMotion || motion.value.list === false) return

    let elements = getListMotionElements()
    if (range) {
      // Same-list crossings only displace the rows between the placeholder's
      // previous and next slots; capturing just that band (±1 for the
      // placeholder offset) avoids full-list rect reads per crossed row, and
      // runListMotion only re-reads elements with a captured rect, so the
      // post-render pass shrinks with it.
      const lower = Math.max(0, Math.min(range.from, range.to) - 1)
      const upper = Math.max(range.from, range.to) + 1
      elements = elements.slice(lower, upper + 1)
    }

    for (const element of elements) {
      const key = element.dataset.vuesortableMotionKey
      if (!key) continue

      const rect = element.getBoundingClientRect()
      listMotionRects.set(key, {
        left: rect.left,
        top: rect.top,
      })
    }
  }

  function refreshDragLayout() {
    if (!shouldRefreshLayout) return
    shouldRefreshLayout = false

    const state = dragState.value
    if (!state?.started || !canUseDOM()) return
    const root = getRootElement()
    if (!root) return

    const rootRect = root.getBoundingClientRect()
    const rootGeometry = getRootGeometry(root, rootRect)
    // Keyed once: a scan per element made this pass quadratic, which dominated the rect reads on long lists
    // (1000 rows: 19ms a pass, 4.5ms keyed).
    const entriesByKey = new Map(entries.value.map(entry => [entry.key, entry]))
    const items: MeasuredEntry<T>[] = []

    for (const element of root.querySelectorAll<HTMLElement>(SELECTORS.item)) {
      const itemKey = element.dataset.vuesortableItemKey
      if (!itemKey) continue
      const entry = entriesByKey.get(itemKey)
      if (!entry) continue

      // Layout rect: relocations under 150ms apart re-measure while the
      // previous FLIP flights are still running.
      const rect = getLayoutRect(element)
      const left = rect.left - rootGeometry.left
      const top = rect.top - rootGeometry.top
      items.push({
        ...entry,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
        height: rect.height,
        left,
        top,
        width: rect.width,
      })
    }

    if (items.length === 0) return

    state.layout = {
      items,
      rootHeight: rootGeometry.height,
      rootWidth: rootGeometry.width,
    }
  }

  function animateListMotion() {
    if (!shouldRunListMotion) {
      return
    }
    shouldRunListMotion = false

    const listMotion = motion.value.list
    if (!canUseDOM() || listMotion === false || !isSorting.value || listMotionRects.size === 0) {
      return
    }

    const moves = getListMotionElements()
      .map((element) => {
        const key = element.dataset.vuesortableMotionKey
        const previous = key ? listMotionRects.get(key) : undefined
        if (!previous) return null

        const rect = element.getBoundingClientRect()
        const deltaX = previous.left - rect.left
        const deltaY = previous.top - rect.top
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return null

        return { deltaX, deltaY, element, key }
      })
      .filter((move): move is ListMotionMove => move !== null)

    if (moves.length === 0) return

    cancelListMotionFrame()
    // CSS-transition path only for now; WAAPI was producing invisible motion
    // in Chromium during real drags despite the unit-test fallback path
    // working. Re-enable WAAPI behind an explicit motion option once it has
    // proper browser coverage.
    const transitionMoves = moves

    for (const { deltaX, deltaY, element } of transitionMoves) {
      listMotionElements.add(element)
      element.style.transition = 'none'
      element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
      element.style.willChange = 'transform'
    }

    for (const { element } of transitionMoves) {
      forceLayoutRead(element)
    }

    listMotionFrame = window.requestAnimationFrame(() => {
      listMotionFrame = window.requestAnimationFrame(() => {
        listMotionFrame = null

        for (const { element } of transitionMoves) {
          element.style.transition = `transform ${listMotion.duration}ms ${listMotion.easing}`
          element.style.transform = ''
        }

        listMotionCleanupTimer = window.setTimeout(() => {
          listMotionCleanupTimer = null

          for (const { element } of transitionMoves) {
            element.style.transition = ''
            element.style.willChange = ''
            listMotionElements.delete(element)
          }
        }, listMotion.duration)
      })
    })
  }

  function clearListMotionStyles() {
    for (const animation of listMotionAnimations.values()) {
      animation.cancel()
    }
    listMotionAnimations.clear()

    for (const element of listMotionElements) {
      element.style.transition = ''
      element.style.transform = ''
      element.style.willChange = ''
    }
    listMotionElements.clear()
  }

  function cancelListMotionFrame() {
    if (canUseDOM() && listMotionFrame !== null) {
      window.cancelAnimationFrame(listMotionFrame)
      listMotionFrame = null
    }

    if (canUseDOM() && listMotionCleanupTimer !== null) {
      window.clearTimeout(listMotionCleanupTimer)
      listMotionCleanupTimer = null
    }

    clearListMotionStyles()
  }

  function startDropAnimation(nextDropState: DropState<T>, targetPosition: OverlayPosition) {
    dropState.value = nextDropState

    const dropMotion = motion.value.drop
    if (!canUseDOM() || dropMotion === false || dropMotion.duration <= 0) {
      finishDropAnimation()
      return
    }

    // Two-step update so the browser registers the transition property before
    // the transform changes, otherwise Vue's batched render applies both at
    // once and Chromium frequently skips the transition.
    dropAnimationFrame = window.requestAnimationFrame(() => {
      const currentDropState = dropState.value
      if (!currentDropState) return

      // Step 1: flip dropping=true so overlayStyle gains the transition prop
      // while transform is still at the drag-end position.
      dropState.value = {
        ...currentDropState,
        dropping: true,
      }

      dropAnimationFrame = window.requestAnimationFrame(() => {
        const stateBeforeMove = dropState.value
        if (!stateBeforeMove) return

        // Step 2: update the transform target; transition is already live so
        // the browser animates from the previous transform to this one.
        dropState.value = {
          ...stateBeforeMove,
          left: targetPosition.left,
          y: targetPosition.y,
        }

        dropAnimationTimer = window.setTimeout(finishDropAnimation, dropMotion.duration)
      })
    })
  }

  function finishDropAnimation() {
    if (canUseDOM() && dropAnimationFrame !== null) {
      window.cancelAnimationFrame(dropAnimationFrame)
      dropAnimationFrame = null
    }
    if (canUseDOM() && dropAnimationTimer !== null) {
      window.clearTimeout(dropAnimationTimer)
      dropAnimationTimer = null
    }

    dropState.value = null
  }

  function clearActivationDelay() {
    if (canUseDOM() && activationDelayTimer !== null) {
      window.clearTimeout(activationDelayTimer)
    }
    activationDelayTimer = null
  }

  function clearPointerListeners() {
    flowResizeObserver?.disconnect()
    flowResizeObserver = null
    if (!canUseDOM()) return

    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)
    document.removeEventListener('pointercancel', handlePointerCancel)
  }

  function cleanupDrag(emitCancel: boolean) {
    const state = dragState.value
    clearActivationDelay()
    clearPointerListeners()
    restoreDocumentDragCursor()
    cancelListMotionFrame()
    if (state) clearGroupPreview(state)
    dragState.value = null

    if (emitCancel && state?.started) {
      emit.dragCancel(payloadFromState(state))
    }
  }

  function payloadFromState(state: DragState<T>): SortableDragPayload<T> {
    const payload: SortableDragPayload<T> = {
      from: state.from,
      item: state.item,
      key: state.key,
      to: state.previewIndex,
    }
    if (state.group) {
      payload.fromList = state.fromList
      payload.group = state.group
      payload.toList = state.previewList
    }
    return payload
  }

  function movePayloadFromState(state: DragState<T>, event: PointerEvent): SortableMovePayload<T> {
    return {
      ...payloadFromState(state),
      activeIndex: state.previewIndex,
      pointer: {
        x: event.clientX,
        y: event.clientY,
      },
    }
  }

  function lockDocumentDragCursor(event: PointerEvent) {
    if (!canUseDOM() || restoreDocumentCursor !== null) return
    if (event.pointerType === 'touch') return

    const html = document.documentElement
    const body = document.body
    const previousHtmlCursor = html.style.cursor
    const previousBodyCursor = body.style.cursor

    html.style.cursor = 'grabbing'
    body.style.cursor = 'grabbing'

    restoreDocumentCursor = () => {
      html.style.cursor = previousHtmlCursor
      body.style.cursor = previousBodyCursor
    }
  }

  function restoreDocumentDragCursor() {
    restoreDocumentCursor?.()
    restoreDocumentCursor = null
  }

  function getListAttrs(): SortableListAttrs {
    return {
      [DATA_ATTRIBUTES.list]: '',
      role: 'list',
    }
  }

  function getItemAttrs(entry: SortableItemEntry<T>): SortableItemAttrsResult {
    const active = overlayState.value?.key === entry.key
    const attrs: Record<string, unknown> = {
      [DATA_ATTRIBUTES.item]: '',
      [DATA_ATTRIBUTES.itemKey]: entry.key,
      [DATA_ATTRIBUTES.motionKey]: entry.key,
      'aria-disabled': props.disabled ? 'true' : 'false',
      'aria-posinset': entry.index + 1,
      'aria-setsize': entries.value.length,
      'data-vuesortable-active': active ? 'true' : 'false',
      'data-vuesortable-dragging': isSorting.value ? 'true' : 'false',
      'data-vuesortable-disabled': props.disabled ? 'true' : 'false',
      onPointerdown: (event: PointerEvent) => handlePointerDown(event, entry),
      role: 'listitem',
    }

    if (!props.disabled) attrs.style = INTERACTION_STYLE

    return { attrs }
  }

  function getHandleAttrs(entry: SortableItemEntry<T>): Record<string, unknown> {
    const attrs: Record<string, unknown> = {
      [DATA_ATTRIBUTES.handle]: '',
      'aria-disabled': props.disabled ? 'true' : 'false',
      'aria-keyshortcuts': 'ArrowUp ArrowDown ArrowLeft ArrowRight Home End',
      'aria-label': `Reorder ${getAnnouncementLabel(entry)}`,
      'aria-roledescription': 'sortable handle',
      onPointerdown: (event: PointerEvent) => handlePointerDown(event, entry, true),
      onKeydown: (event: KeyboardEvent) => handleKeyboardMove(event, entry),
      role: 'button',
      tabindex: props.disabled ? -1 : 0,
    }

    if (!props.disabled) attrs.style = INTERACTION_STYLE

    return attrs
  }

  function getPlaceholderAttrs(entry: SortablePlaceholderEntry): SortablePlaceholderAttrsResult {
    return {
      attrs: {
        [DATA_ATTRIBUTES.placeholder]: entry.activeKey,
        [DATA_ATTRIBUTES.motionKey]: entry.key,
        'aria-hidden': 'true',
        role: 'presentation',
      },
      style: placeholderStyle(entry),
    }
  }

  function placeholderStyle(entry: SortablePlaceholderEntry): CSSProperties {
    return {
      flexShrink: '0',
      height: `${entry.height}px`,
      pointerEvents: 'none',
      width: `${entry.width}px`,
    }
  }

  function getOverlayRenderState(): SortableOverlayRenderState<T> | null {
    const overlay = overlayState.value
    if (!overlay) return null

    return {
      attrs: {
        [DATA_ATTRIBUTES.overlay]: '',
        [DATA_ATTRIBUTES.overlayKey]: overlay.key,
        'aria-hidden': 'true',
        'data-vuesortable-dragging': isSorting.value ? 'true' : 'false',
        'data-vuesortable-dropping': dropState.value?.dropping ? 'true' : 'false',
      },
      dragging: isDragging.value,
      element: overlay.element,
      index: overlay.index,
      key: overlay.key,
      style: overlayStyle.value ?? {},
    }
  }

  function getDefaultSlotProps(): SortableDefaultSlotProps<T> {
    return {
      dragging: isDragging.value,
      dropping: isDropping.value,
      entries: layoutEntries.value,
      getHandleAttrs,
      getItemAttrs,
      getPlaceholderAttrs,
      listAttrs: getListAttrs(),
      overlay: getOverlayRenderState(),
    }
  }

  // Track the key this entry was actually registered under: the pre-flush
  // watch(groupName) re-keys on rename, but if the component unmounts in the
  // same tick before that watcher job flushes, the scope stop cancels the
  // pending re-key. Unregistering by the live computed would then miss the
  // stale key and leak the entry (its root() closure retains a DOM subtree).
  let lastRegisteredGroup: string | null = null

  function registerCurrentGroup(group: string | null) {
    if (!group) return
    const entriesForGroup = groupedSortables.get(group) ?? new Set<SortableGroupEntry>()
    entriesForGroup.add(groupEntry as SortableGroupEntry)
    groupedSortables.set(group, entriesForGroup)
    lastRegisteredGroup = group
  }

  function unregisterCurrentGroup(group: string | null) {
    if (!group) return
    const entriesForGroup = groupedSortables.get(group)
    if (!entriesForGroup) return

    entriesForGroup.delete(groupEntry as SortableGroupEntry)
    if (entriesForGroup.size === 0) groupedSortables.delete(group)
    if (group === lastRegisteredGroup) lastRegisteredGroup = null
  }

  // Belt-and-suspenders: remove this entry from every group set so no stale
  // key can retain it, regardless of which key it was last registered under.
  function purgeGroupEntry() {
    for (const [group, entriesForGroup] of groupedSortables) {
      if (!entriesForGroup.delete(groupEntry as SortableGroupEntry)) continue
      if (entriesForGroup.size === 0) groupedSortables.delete(group)
    }
    lastRegisteredGroup = null
  }

  onMounted(() => {
    registerCurrentGroup(groupName.value)
  })

  watch(groupName, (nextGroup, previousGroup) => {
    unregisterCurrentGroup(previousGroup)
    registerCurrentGroup(nextGroup)
  })

  onUpdated(() => {
    if (shouldRefreshLayout) refreshDragLayout()
    if (shouldRunListMotion) animateListMotion()
  })

  onBeforeUnmount(() => {
    cleanupDrag(false)
    finishDropAnimation()
    // Prefer the key we actually registered under (survives a cancelled
    // same-tick rename), then sweep any residual set membership.
    unregisterCurrentGroup(lastRegisteredGroup)
    purgeGroupEntry()
  })

  return {
    announcement,
    entries,
    getDefaultSlotProps,
    getHandleAttrs,
    getItemAttrs,
    getListAttrs,
    getOverlayRenderState,
    getPlaceholderAttrs,
    isDragging,
    isDropping,
    isSorting,
    layoutEntries,
    liveRegionStyle: LIVE_REGION_STYLE,
    overlayState,
    overlayStyle,
    rootStyle: ROOT_STYLE,
  }
}

function forceLayoutRead(element: HTMLElement) {
  return element.offsetHeight
}

function normalizeGroupName(group: SortableGroup | undefined) {
  if (typeof group === 'string') return group.trim() || null
  if (group && typeof group.name === 'string') return group.name.trim() || null
  return null
}

function normalizeListId(id: string | undefined) {
  return typeof id === 'string' ? id.trim() || null : null
}

function getRegisteredGroupEntry(group: string, id: string) {
  return Array
    .from(groupedSortables.get(group) ?? [])
    .find((entry) => {
      if (entry.id !== id) return false
      const root = entry.root()
      return root !== null && root.isConnected
    }) ?? null
}

function distanceToRect(x: number, y: number, rect: DOMRect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

function getOverlayCenterInViewport(
  event: PointerEvent,
  state: Pick<DragState<unknown>, 'height' | 'pointerOffsetX' | 'pointerOffsetY' | 'width'>,
  orientation: SortableOrientation,
) {
  return orientation === 'horizontal'
    ? event.clientX - state.pointerOffsetX + state.width / 2
    : event.clientY - state.pointerOffsetY + state.height / 2
}

function findAxisGroupTarget<T>(
  candidates: Array<{ entry: SortableGroupEntry<T>, rect: DOMRect }>,
  mainPoint: number,
  orientation: SortableOrientation,
) {
  const mainStart = (rect: DOMRect) => orientation === 'horizontal' ? rect.left : rect.top
  const mainEnd = (rect: DOMRect) => orientation === 'horizontal' ? rect.right : rect.bottom
  const mainCenter = (rect: DOMRect) => (mainStart(rect) + mainEnd(rect)) / 2
  const sorted = [...candidates].sort((a, b) => mainCenter(a.rect) - mainCenter(b.rect))

  for (let index = 0; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    const next = sorted[index + 1]
    if (!current) continue

    const zoneStart = previous
      ? (mainCenter(previous.rect) + mainCenter(current.rect)) / 2
      : -Infinity
    const zoneEnd = next
      ? (mainCenter(current.rect) + mainCenter(next.rect)) / 2
      : Infinity

    if (mainPoint >= zoneStart && mainPoint < zoneEnd) return current.entry
  }

  return sorted[0]?.entry ?? null
}

function buildLayoutEntries<T>(
  sourceEntries: SortableItemEntry<T>[],
  activeKey: string,
  previewIndex: number,
  activeHeight: number,
  activeWidth: number,
) {
  const withoutActive = sourceEntries.filter(entry => entry.key !== activeKey)
  const insertionIndex = clamp(previewIndex, 0, withoutActive.length)
  const next: SortableRenderEntry<T>[] = [...withoutActive]

  next.splice(insertionIndex, 0, {
    activeKey,
    height: activeHeight,
    key: `vuesortable-placeholder:${activeKey}`,
    type: 'placeholder',
    width: activeWidth,
  })

  return next
}

function insertEntry<T>(sourceEntries: SortableItemEntry<T>[], entry: SortableItemEntry<T>, to: number) {
  const next = sourceEntries.filter(candidate => candidate.key !== entry.key)
  next.splice(clamp(to, 0, next.length), 0, entry)
  return next.map((item, index) => ({ ...item, index }))
}

function moveEntry<T>(sourceEntries: SortableItemEntry<T>[], from: number, to: number) {
  const next = [...sourceEntries]
  const [entry] = next.splice(from, 1)
  if (!entry) return sourceEntries

  next.splice(clamp(to, 0, next.length), 0, entry)
  return next.map((item, index) => ({ ...item, index }))
}
