<script setup lang="ts">
import { ref } from 'vue'
import { Sortable } from '@guillemservera/vue-sortable'
import type { SortableCanMovePayload, SortableDragPayload } from '@guillemservera/vue-sortable'

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
    <div class="columns">
      <section
        v-for="column in columns"
        :key="column.id"
        class="column"
      >
        <h3>{{ column.title }}</h3>

        <Sortable
          v-model="column.cards"
          item-key="id"
          group="kanban"
          :list-id="column.id"
          movement="free"
          remove-on-drop-outside
          :can-drop="canDropInto(column)"
          class="lane"
          @remove="onRemove"
          v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs, overlay, dropTarget }"
        >
          <div
            v-bind="listAttrs"
            class="cards"
          >
            <template
              v-for="entry in entries"
              :key="entry.key"
            >
              <!-- A refused drop opens no gap: the lane says why instead. -->
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

          <div
            v-if="overlay"
            v-bind="overlay.attrs"
            :style="overlay.style"
            class="card lifted"
          >
            {{ overlay.outside ? `Delete "${overlay.element.label}"` : overlay.element.label }}
          </div>
        </Sortable>
      </section>
    </div>

    <p class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.columns {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* The root is what a card is dropped on: give it a height, so an empty lane takes a drop too. */
.lane {
  min-height: 180px;
  outline: 1px dashed transparent;
}

.lane[data-vuesortable-drop-target] {
  outline-color: currentColor;
}

.lane[data-vuesortable-drop-target="refused"] {
  outline-color: crimson;
}

.cards {
  display: grid;
  gap: 8px;
}

.card {
  background: Canvas;
  border: 1px solid;
  padding: 10px 12px;
}
</style>
