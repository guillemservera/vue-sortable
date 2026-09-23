import type { SortableCollision, SortableItemEntry, SortableLayout, SortableOrientation } from '../types'
import { FLOW_ROW_THRESHOLD } from '../constants'
import { getLayoutRect } from './dom'

export type RootGeometry = {
  height: number
  left: number
  top: number
  width: number
}

export type OverlayPosition = {
  left: number
  y: number
}

export type MeasuredEntry<T = unknown> = SortableItemEntry<T> & {
  centerX: number
  centerY: number
  height: number
  left: number
  top: number
  width: number
}

export type LayoutSnapshot<T = unknown> = {
  items: MeasuredEntry<T>[]
  rootHeight: number
  rootWidth: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getRootGeometry(root: HTMLElement, rootRect = root.getBoundingClientRect()): RootGeometry {
  return {
    height: root.clientHeight || rootRect.height,
    left: rootRect.left + root.clientLeft,
    top: rootRect.top + root.clientTop,
    width: root.clientWidth || rootRect.width,
  }
}

export function measureSortableLayout<T>(
  root: HTMLElement,
  rootRect: DOMRect,
  entries: SortableItemEntry<T>[],
  itemSelector: string,
) {
  const rootGeometry = getRootGeometry(root, rootRect)

  const items = Array.from(root.querySelectorAll<HTMLElement>(itemSelector))
    .map((element): MeasuredEntry<T> | null => {
      const key = element.dataset.vuesortableItemKey
      const entry = key ? entries.find(candidate => candidate.key === key) : undefined
      if (!key || !entry) return null

      // Layout rect (transform translation removed): items may be mid-FLIP.
      const rect = getLayoutRect(element)
      const left = rect.left - rootGeometry.left
      const top = rect.top - rootGeometry.top

      return {
        ...entry,
        centerX: left + rect.width / 2,
        centerY: top + rect.height / 2,
        height: rect.height,
        left,
        top,
        width: rect.width,
      }
    })
    .filter((item): item is MeasuredEntry<T> => item !== null)

  return {
    items,
    rootHeight: rootGeometry.height,
    rootWidth: rootGeometry.width,
  } satisfies LayoutSnapshot<T>
}

export type FlowPlaceholderRect = {
  height: number
  index: number
  left: number
  top: number
  width: number
}

export function findPreviewIndex<T>(
  position: OverlayPosition,
  state: {
    direction: -1 | 0 | 1
    height: number
    key: string
    layout: LayoutSnapshot<T>
    width: number
  },
  orientation: SortableOrientation,
  collision: SortableCollision,
  overlap: number,
  layout: SortableLayout = 'axis',
  placeholder?: FlowPlaceholderRect,
  pointer?: OverlayPosition,
) {
  if (layout === 'flow') return findFlowPreviewIndex(position, state, orientation, collision, overlap, placeholder, pointer)

  const collisionPoint = orientation === 'horizontal'
    ? position.left + state.width / 2
    : position.y + state.height / 2
  const measuredItems = state.layout.items.filter(item => item.key !== state.key)

  let previewIndex = 0
  for (const item of measuredItems) {
    const itemCenter = getMeasuredItemCenter(item, orientation)
    const itemSize = orientation === 'horizontal' ? item.width : item.height
    const activeSize = orientation === 'horizontal' ? state.width : state.height
    // Convert neighbor overlap into the equivalent overlay-center threshold.
    const overlapDistance = collision === 'overlap' && state.direction !== 0
      ? (activeSize / 2) + itemSize * (0.5 - overlap)
      : 0
    const threshold = itemCenter - state.direction * overlapDistance

    if (collisionPoint >= threshold) previewIndex += 1
  }

  return previewIndex
}

type FlowLine<T> = {
  crossEnd: number
  crossStart: number
  items: MeasuredEntry<T>[]
  placeholder?: { mainEnd: number, mainStart: number }
}

function findFlowPreviewIndex<T>(
  position: OverlayPosition,
  state: {
    direction: -1 | 0 | 1
    height: number
    key: string
    layout: LayoutSnapshot<T>
    width: number
  },
  orientation: SortableOrientation,
  collision: SortableCollision,
  overlap: number,
  placeholder?: FlowPlaceholderRect,
  pointer?: OverlayPosition,
) {
  // Main axis: the OVERLAY drives placement, exactly like axis layouts — the
  // flip happens where the dragged item's body stands, with the same
  // direction-aware overlap thresholds, so a flow row feels identical to a
  // rail. (Stability holds for any size mix: the active-size/2 term in the
  // overlap distance cancels the placeholder-sized shift on relocation, so
  // the flip and flip-back boundaries always stay ~overlap·itemSize apart.)
  const collisionPoint = orientation === 'horizontal'
    ? position.left + state.width / 2
    : position.y + state.height / 2
  // Cross axis: the user aims the ROW with the cursor — with an off-centre
  // grab the overlay centre diverges from the cursor by up to half the item
  // size, which is a full row of error. Select lines from the pointer
  // whenever it is available (overlay centre is only the fallback).
  const pointerCross = pointer
    ? (orientation === 'horizontal' ? pointer.y : pointer.left)
    : (orientation === 'horizontal'
        ? position.y + state.height / 2
        : position.left + state.width / 2)
  const measuredItems = state.layout.items.filter(item => item.key !== state.key)
  const lines = groupFlowLines(measuredItems, orientation, placeholder)
  // Once a placeholder exists, only retarget when the pointer is clearly
  // INSIDE a line band. Falling back to the nearest line while hovering the
  // gaps between rows (or non-sortable siblings sharing the wrap) makes the
  // index oscillate with sub-pixel pointer moves as the wrap reflows.
  // Row hysteresis: the placeholder's row keeps the target until the pointer
  // leaves its band by FLOW_ROW_THRESHOLD of the row height, so changing rows
  // is deliberate and vertical drift inside a row never retargets.
  const placeholderLine = lines.find(line => line.placeholder)
  const holdMargin = placeholderLine
    ? (placeholderLine.crossEnd - placeholderLine.crossStart) * FLOW_ROW_THRESHOLD
    : 0
  const targetLine = placeholderLine
    && pointerCross >= placeholderLine.crossStart - holdMargin
    && pointerCross <= placeholderLine.crossEnd + holdMargin
    ? placeholderLine
    : findTargetFlowLine(lines, pointerCross, Boolean(placeholder))
  if (!targetLine) return placeholder?.index ?? 0

  // The placeholder is a stable dead zone: while the overlay stays over the
  // slot the placeholder currently occupies, keep the current index. Without
  // this, moving the placeholder can rewrap the lines under the pointer and
  // the recomputed index oscillates forever between two arrangements.
  if (
    placeholder
    && targetLine.placeholder
    && collisionPoint >= targetLine.placeholder.mainStart
    && collisionPoint <= targetLine.placeholder.mainEnd
  ) {
    return placeholder.index
  }

  // Entering a DIFFERENT line the main-axis direction is stale noise (it
  // reflects horizontal motion from the previous row), so the first
  // resolution there is unbiased midpoint crossing; once the placeholder
  // lives in the row, the axis-style direction thresholds take over.
  const enteringNewLine = Boolean(placeholder) && !targetLine.placeholder
  const mainDirection = enteringNewLine ? 0 : state.direction
  let previewIndex = lines
    .slice(0, lines.indexOf(targetLine))
    .reduce((total, line) => total + line.items.length, 0)

  for (const item of targetLine.items) {
    const itemCenter = getMeasuredItemCenter(item, orientation)
    const itemSize = orientation === 'horizontal' ? item.width : item.height
    const activeSize = orientation === 'horizontal' ? state.width : state.height
    // Same conversion as the axis path: neighbor overlap expressed as an
    // overlay-centre threshold.
    const overlapDistance = collision === 'overlap' && mainDirection !== 0
      ? (activeSize / 2) + itemSize * (0.5 - overlap)
      : 0
    const threshold = itemCenter - mainDirection * overlapDistance

    if (collisionPoint >= threshold) previewIndex += 1
  }

  return previewIndex
}

function groupFlowLines<T>(
  items: MeasuredEntry<T>[],
  orientation: SortableOrientation,
  placeholder?: FlowPlaceholderRect,
) {
  const sorted = [...items].sort((a, b) => {
    const crossDelta = orientation === 'horizontal'
      ? a.top - b.top
      : a.left - b.left
    if (Math.abs(crossDelta) > 1) return crossDelta
    return orientation === 'horizontal'
      ? a.left - b.left
      : a.top - b.top
  })
  const lines: Array<FlowLine<T>> = []

  for (const item of sorted) {
    const crossStart = orientation === 'horizontal' ? item.top : item.left
    const crossEnd = orientation === 'horizontal' ? item.top + item.height : item.left + item.width
    const crossCenter = crossStart + (crossEnd - crossStart) / 2
    const line = lines.find(candidate =>
      crossCenter >= candidate.crossStart - 1
      && crossCenter <= candidate.crossEnd + 1,
    )

    if (line) {
      line.crossStart = Math.min(line.crossStart, crossStart)
      line.crossEnd = Math.max(line.crossEnd, crossEnd)
      line.items.push(item)
    }
    else {
      lines.push({
        crossEnd,
        crossStart,
        items: [item],
      })
    }
  }

  // The placeholder occupies real space in the wrap but is not a measured
  // item. Register it on the line it sits on — creating that line if the
  // placeholder wraps onto a row of its own — so the cross-axis mapping sees
  // every visual row and the in-line pass can treat its span as a dead zone.
  if (placeholder) {
    const crossStart = orientation === 'horizontal' ? placeholder.top : placeholder.left
    const crossEnd = orientation === 'horizontal'
      ? placeholder.top + placeholder.height
      : placeholder.left + placeholder.width
    const crossCenter = crossStart + (crossEnd - crossStart) / 2
    const mainStart = orientation === 'horizontal' ? placeholder.left : placeholder.top
    const mainEnd = orientation === 'horizontal'
      ? placeholder.left + placeholder.width
      : placeholder.top + placeholder.height
    const line = lines.find(candidate =>
      crossCenter >= candidate.crossStart - 1
      && crossCenter <= candidate.crossEnd + 1,
    )

    if (line) {
      line.crossStart = Math.min(line.crossStart, crossStart)
      line.crossEnd = Math.max(line.crossEnd, crossEnd)
      line.placeholder = { mainEnd, mainStart }
    }
    else {
      lines.push({
        crossEnd,
        crossStart,
        items: [],
        placeholder: { mainEnd, mainStart },
      })
    }
  }

  return lines
    .sort((a, b) => a.crossStart - b.crossStart)
    .map(line => ({
      ...line,
      items: line.items.sort((a, b) => orientation === 'horizontal'
        ? a.left - b.left
        : a.top - b.top),
    }))
}

function findTargetFlowLine<T>(lines: Array<FlowLine<T>>, crossPoint: number, containedOnly = false) {
  if (lines.length === 0) return null

  for (const line of lines) {
    if (crossPoint >= line.crossStart && crossPoint <= line.crossEnd) return line
  }

  if (containedOnly) return null

  return lines
    .map(line => ({
      distance: crossPoint < line.crossStart ? line.crossStart - crossPoint : crossPoint - line.crossEnd,
      line,
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.line ?? null
}

export function getMeasuredItemCenter(item: MeasuredEntry, orientation: SortableOrientation) {
  return orientation === 'horizontal' ? item.centerX : item.centerY
}

export function estimateItemGap(items: MeasuredEntry[], orientation: SortableOrientation) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]
    const current = items[index]
    if (!previous || !current) continue

    const gap = orientation === 'horizontal'
      ? current.left - (previous.left + previous.width)
      : current.top - (previous.top + previous.height)

    if (gap > 0) return gap
  }

  return 0
}
