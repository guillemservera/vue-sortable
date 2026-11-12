<script setup lang="ts">
import { ref } from 'vue'
import { Sortable, SortableSource } from '@guillemservera/vue-sortable'
import type { SortableReceivePayload } from '@guillemservera/vue-sortable'

type Block = {
  kind: string
  label: string
}

type Placed = Block & {
  id: string
}

const palette: Block[] = [
  { kind: 'heading', label: 'Heading' },
  { kind: 'text', label: 'Text' },
  { kind: 'image', label: 'Image' },
  { kind: 'button', label: 'Button' },
]

const toolbar = ref<Placed[]>([
  { id: 'button-1', kind: 'button', label: 'Button' },
])
const page = ref<Placed[]>([
  { id: 'heading-1', kind: 'heading', label: 'Heading' },
  { id: 'text-1', kind: 'text', label: 'Text' },
])

let placed = 0

// The palette keeps its block: the list makes an item of its own from what it receives.
function place(payload: SortableReceivePayload<Placed>) {
  const block = payload.data as Block
  const next = [...payload.items]
  next.splice(payload.to, 0, { ...block, id: `${block.kind}-new-${++placed}` })
  return next
}

function toolbarTakes(payload: SortableReceivePayload<Placed>) {
  return (payload.data as Block).kind === 'image' ? 'The toolbar takes no images' : true
}

// Dragging is never the only way: every block can be added and removed with a button.
function add(block: Block) {
  page.value = [...page.value, { ...block, id: `${block.kind}-new-${++placed}` }]
}

function remove(list: 'toolbar' | 'page', id: string) {
  if (list === 'toolbar') toolbar.value = toolbar.value.filter(item => item.id !== id)
  else page.value = page.value.filter(item => item.id !== id)
}
</script>

<template>
  <div class="builder">
    <ul
      class="palette"
      aria-label="Blocks"
    >
      <li
        v-for="block in palette"
        :key="block.kind"
      >
        <SortableSource
          :data="block"
          group="builder"
          v-slot="{ sourceAttrs, overlay }"
        >
          <div
            v-bind="sourceAttrs"
            class="block source"
          >
            {{ block.label }}
          </div>

          <!-- Fixed to the viewport, so it is rendered where no ancestor can clip or offset it. -->
          <Teleport to="body">
            <div
              v-if="overlay"
              v-bind="overlay.attrs"
              :style="overlay.style"
              class="block lifted"
              :data-allowed="overlay.allowed"
            >
              {{ overlay.element.label }}
            </div>
          </Teleport>
        </SortableSource>

        <button
          type="button"
          class="add"
          :aria-label="`Add ${block.label} to the page`"
          @click="add(block)"
        >
          +
        </button>
      </li>
    </ul>

    <div class="board">
      <Sortable
        v-model="toolbar"
        item-key="id"
        group="builder"
        list-id="toolbar"
        layout="flow"
        orientation="horizontal"
        movement="free"
        :can-receive="toolbarTakes"
        class="zone"
        @receive="toolbar = place($event)"
        v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs, overlay, dropTarget }"
      >
        <h3>Toolbar</h3>

        <div
          v-bind="listAttrs"
          class="row"
        >
          <template
            v-for="entry in entries"
            :key="entry.key"
          >
            <!-- The gap is as large as what is dragged, and a block of the page is as wide as the page: size it here. -->
            <div
              v-if="entry.type === 'placeholder'"
              v-show="dropTarget?.allowed !== false"
              v-bind="getPlaceholderAttrs(entry).attrs"
              :style="[getPlaceholderAttrs(entry).style, { width: '96px' }]"
              class="gap"
            />

            <div
              v-else
              v-bind="getItemAttrs(entry).attrs"
              class="block chip"
            >
              {{ entry.element.label }}
              <button
                type="button"
                :aria-label="`Remove ${entry.element.label}`"
                @click="remove('toolbar', entry.element.id)"
              >
                ×
              </button>
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
          class="block lifted"
        >
          {{ overlay.element.label }}
        </div>
      </Sortable>

      <Sortable
        v-model="page"
        item-key="id"
        group="builder"
        list-id="page"
        movement="free"
        class="zone"
        @receive="page = place($event)"
        v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs, overlay }"
      >
        <h3>Page</h3>

        <div
          v-bind="listAttrs"
          class="stack"
        >
          <template
            v-for="entry in entries"
            :key="entry.key"
          >
            <div
              v-if="entry.type === 'placeholder'"
              v-bind="getPlaceholderAttrs(entry).attrs"
              :style="[getPlaceholderAttrs(entry).style, { width: 'auto' }]"
              class="gap"
            />

            <div
              v-else
              v-bind="getItemAttrs(entry).attrs"
              class="block"
            >
              {{ entry.element.label }}
              <button
                type="button"
                :aria-label="`Remove ${entry.element.label}`"
                @click="remove('page', entry.element.id)"
              >
                ×
              </button>
            </div>
          </template>
        </div>

        <div
          v-if="overlay"
          v-bind="overlay.attrs"
          :style="overlay.style"
          class="block lifted"
        >
          {{ overlay.element.label }}
        </div>
      </Sortable>
    </div>
  </div>
</template>

<style scoped>
.builder {
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: 180px minmax(0, 1fr);
}

.palette {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.palette li {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr auto;
}

.board {
  display: grid;
  gap: 12px;
}

.zone {
  border: 1px dashed transparent;
  border-radius: 10px;
  padding: 10px;
}

.zone[data-vuesortable-drop-target] {
  border-color: #c3cbd9;
}

.zone[data-vuesortable-drop-target="over"] {
  background: #e8f0fe;
  border-color: #3b6fd4;
  border-style: solid;
}

.zone[data-vuesortable-drop-target="refused"] {
  background: #fdecec;
  border-color: #c9413f;
}

.zone h3 {
  color: #526077;
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 42px;
}

.stack {
  display: grid;
  gap: 8px;
  min-height: 120px;
}

.block {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d7dde8;
  border-radius: 8px;
  color: #182033;
  cursor: grab;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 42px;
  padding: 8px 12px;
}

.chip {
  flex: 0 0 auto;
}

.block button,
.add {
  background: transparent;
  border: 1px solid #d7dde8;
  border-radius: 6px;
  color: #526077;
  font: inherit;
  line-height: 1;
  padding: 4px 8px;
}

.gap {
  background: #dbe3ef;
  border-radius: 8px;
}

.lifted {
  box-shadow: 0 10px 24px rgb(24 32 51 / 18%);
  z-index: 10;
}

.lifted[data-allowed="false"] {
  border-color: #c9413f;
  color: #8f2422;
}

.reason {
  color: #8f2422;
  font-size: 13px;
  margin: 8px 0 0;
}

@media (max-width: 640px) {
  .builder {
    grid-template-columns: 1fr;
  }
}
</style>
