<script lang="ts">
let sourceId = 0
</script>

<script setup lang="ts" generic="D = unknown">
import { computed, shallowRef } from 'vue'
import { useSortableList } from '../composables/useSortableList'
import type {
  SortableDragPayload,
  SortableMovePayload,
  SortableProps,
  SortableSourceProps,
  SortableSourceSlotProps,
} from '../types'

defineOptions({
  name: 'SortableSource',
  inheritAttrs: false,
})

const props = defineProps<SortableSourceProps<D>>()

const emit = defineEmits<{
  'drag-start': [payload: SortableDragPayload<D>]
  'drag-move': [payload: SortableMovePayload<D>]
  'drag-end': [payload: SortableDragPayload<D>]
  'drag-cancel': [payload: SortableDragPayload<D>]
}>()

defineSlots<{
  default(props: SortableSourceSlotProps<D>): unknown
}>()

// Unlike any item's key: the list under the pointer names its placeholder after it.
const key = `vuesortable-source-${++sourceId}`
const rootRef = shallowRef<HTMLElement | null>(null)

// The drag is a list's: the source is one of a single item, which is the element that was pressed.
const listProps: SortableProps<D> = {
  itemKey: () => key,
  get activation() { return props.activation },
  get disabled() { return props.disabled },
  get group() { return props.group },
  get modelValue() { return [props.data] },
  get motion() { return props.motion },
}

const sortable = useSortableList<D>({
  emit: {
    dragCancel: payload => emit('drag-cancel', payload),
    dragEnd: payload => emit('drag-end', payload),
    dragMove: payload => emit('drag-move', payload),
    dragStart: payload => emit('drag-start', payload),
    receive: () => {},
    remove: () => {},
    reorder: () => {},
    updateModelValue: () => {},
  },
  external: true,
  props: listProps,
  rootRef,
})

const slotProps = computed<SortableSourceSlotProps<D>>(() => ({
  dragging: sortable.isDragging.value,
  overlay: sortable.getOverlayRenderState(),
  sourceAttrs: {
    'data-vuesortable-dragging': sortable.isDragging.value ? 'true' : 'false',
    'data-vuesortable-source': '',
    'onPointerdown': (event: PointerEvent) => {
      const entry = sortable.entries.value[0]
      if (!entry) return

      rootRef.value = event.currentTarget as HTMLElement
      sortable.handlePointerDown(event, entry, true)
    },
    ...(props.disabled ? {} : { style: { touchAction: 'none' } }),
  },
}))

defineExpose({
  isDragging: sortable.isDragging,
})
</script>

<template>
  <slot v-bind="slotProps" />
</template>
