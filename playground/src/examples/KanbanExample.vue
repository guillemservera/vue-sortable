<script setup lang="ts">
import { ref } from 'vue'
import { Sortable } from '@guillemservera/vue-sortable'
import type { SortableCanMovePayload, SortableDragPayload, SortableMovePayload } from '@guillemservera/vue-sortable'

type Card = {
  id: string
  label: string
}

type Column = {
  id: string
  title: string
  limit?: number
  cards: Card[]
}

const columns = ref<Column[]>([
  {
    id: 'todo',
    title: 'To do',
    cards: [
      { id: 'brief', label: 'Write the brief' },
      { id: 'sketch', label: 'Sketch the flow' },
      { id: 'copy', label: 'Draft the copy' },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    limit: 2,
    cards: [
      { id: 'review', label: 'Review the plan' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    cards: [],
  },
])
const message = ref('Drag a card to another column, or off the board to delete it.')
const board = ref<HTMLElement | null>(null)
// True while a release would delete the card: it is over no column, and the pointer has left the board.
const leaving = ref(false)

function onDragMove(payload: SortableMovePayload<Card>) {
  const box = board.value?.getBoundingClientRect()
  const { x, y } = payload.pointer
  leaving.value = payload.outside === true
    && box !== undefined
    && (x < box.left || x > box.right || y < box.top || y > box.bottom)
}

// The gap between two columns is outside every list too, and a near miss must not delete: a card goes only
// once it has left the board. `canMove` is asked with `outside: true` before anything is removed.
function canMove(payload: SortableCanMovePayload<Card>) {
  return !payload.outside || leaving.value
}

// Asked while the card hovers: keep it free of side effects.
function canDropInto(column: Column) {
  return (payload: SortableCanMovePayload<Card>) =>
    column.limit !== undefined && payload.items.length >= column.limit
      ? `${column.title} takes ${column.limit} cards at most`
      : true
}

function onRemove(payload: SortableDragPayload<Card>) {
  message.value = `Deleted "${payload.item.label}".`
}
</script>

<template>
  <div class="example">
    <div
      ref="board"
      class="board"
    >
      <!-- The root is the whole column, title included: a card dropped on the title is dropped on the list. -->
      <Sortable
        v-for="column in columns"
        :key="column.id"
        v-model="column.cards"
        as="section"
        item-key="id"
        group="kanban"
        :list-id="column.id"
        movement="free"
        remove-on-drop-outside
        :can-move="canMove"
        :can-drop="canDropInto(column)"
        class="column"
        @drag-move="onDragMove"
        @drag-end="leaving = false"
        @remove="onRemove"
        v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs, overlay, dropTarget }"
      >
        <h3>{{ column.title }}</h3>

        <div
          v-bind="listAttrs"
          class="cards"
        >
          <template
            v-for="entry in entries"
            :key="entry.key"
          >
            <!-- A refused drop opens no gap: the column says why instead. -->
            <div
              v-if="entry.type === 'placeholder'"
              v-show="dropTarget?.allowed !== false"
              v-bind="getPlaceholderAttrs(entry).attrs"
              :style="getPlaceholderAttrs(entry).style"
              class="gap"
            />

            <div
              v-else
              v-bind="getItemAttrs(entry).attrs"
              class="card"
            >
              {{ entry.element.label }}
            </div>
          </template>
        </div>

        <p
          v-if="dropTarget?.reason"
          class="reason"
        >
          {{ dropTarget.reason }}
        </p>

        <!-- Said from `leaving`, not from `overlay.outside`: it is what a release will really do. -->
        <div
          v-if="overlay"
          v-bind="overlay.attrs"
          :style="overlay.style"
          class="card lifted"
          :class="{ leaving }"
        >
          {{ leaving ? `Delete "${overlay.element.label}"` : overlay.element.label }}
        </div>
      </Sortable>
    </div>

    <p class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.example {
  display: grid;
  gap: 14px;
}

/* The board has an edge to be seen: a card is deleted past it, and nowhere inside it. */
.board {
  align-items: stretch;
  background: #f4f6fa;
  border: 1px solid #d7dde8;
  border-radius: 12px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 12px;
}

/* The root is what a card is dropped on: the whole column, so its title and an empty one take a drop too. */
.column {
  align-content: start;
  border: 1px dashed transparent;
  border-radius: 10px;
  display: grid;
  gap: 8px;
  min-height: 200px;
  padding: 8px;
}

.column h3 {
  color: #526077;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.column[data-vuesortable-drop-target] {
  border-color: #c3cbd9;
}

.column[data-vuesortable-drop-target="over"] {
  background: #e8f0fe;
  border-color: #3b6fd4;
  border-style: solid;
}

.column[data-vuesortable-drop-target="refused"] {
  background: #fdecec;
  border-color: #c9413f;
}

.cards {
  display: grid;
  gap: 8px;
}

.card {
  background: #ffffff;
  border: 1px solid #d7dde8;
  border-radius: 8px;
  color: #182033;
  cursor: grab;
  padding: 10px 12px;
}

.gap {
  background: #dbe3ef;
  border-radius: 8px;
}

.lifted {
  box-shadow: 0 10px 24px rgb(24 32 51 / 18%);
  z-index: 10;
}

.lifted.leaving {
  background: #fdecec;
  border-color: #c9413f;
  color: #8f2422;
}

.reason {
  color: #8f2422;
  font-size: 13px;
  margin: 0;
}

.message {
  color: #526077;
  margin: 0;
}
</style>
