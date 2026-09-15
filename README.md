# VueSortable

Headless-first sortable primitives for Vue 3.

VueSortable is not a SortableJS wrapper. It is a Vue-native primitive for axis-first reordering where you own the markup, layout, styles, and visual treatment.

## Status

VueSortable is currently in an early `0.x` release. The stable paths are axis reordering (single-list vertical/horizontal lists and grouped axis lists) and wrapped `flow` rows (chip bars and tag lists that wrap across lines). Flow is still not a SortableJS-style freeform/grid replacement.

Nuxt 4 SSR compatibility is validated with a dedicated fixture under `examples/nuxt-basic`.

## Why VueSortable?

VueSortable exists for teams that want sortable behavior without adopting a styled component, a DOM-cloning drag library, or SortableJS-specific contracts.

The primitive handles sorting state, geometry, pointer events, placeholder placement, local overlay positioning, reorder decisions, keyboard handle behavior, live-region announcements, and optional geometric motion. You render the list and items through the default slot.

## Features

- Vue 3.5+ component API.
- Dependency-free runtime, with `vue` as the only peer dependency.
- Single-list and grouped axis reorder with controlled `v-model`.
- Vertical and horizontal orientation.
- Handle and ignore selectors.
- Keyboard reordering through returned handle attrs.
- Local overlay state and normal-flow placeholder entries.
- Optional FLIP list motion and snap drop motion.
- Neutral `data-vuesortable-*` attributes for state and tests.
- No SortableJS, VueUse, Tailwind, CSS files, or visual classes.

## Installation

```bash
npm install @guillemservera/vue-sortable
```

```bash
pnpm add @guillemservera/vue-sortable
```

## Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Sortable } from '@guillemservera/vue-sortable'

const items = ref([
  { id: 'todo', label: 'Todo' },
  { id: 'doing', label: 'Doing' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
])
</script>

<template>
  <Sortable
    v-model="items"
    item-key="id"
    orientation="horizontal"
    v-slot="{
      entries,
      listAttrs,
      getItemAttrs,
      getHandleAttrs,
      getPlaceholderAttrs,
      overlay,
    }"
  >
    <div
      v-bind="listAttrs"
      class="lane"
    >
      <template
        v-for="entry in entries"
        :key="entry.key"
      >
        <div
          v-if="entry.type === 'placeholder'"
          v-bind="getPlaceholderAttrs(entry).attrs"
          :style="getPlaceholderAttrs(entry).style"
        />

        <div
          v-else
          v-bind="getItemAttrs(entry).attrs"
          class="pill"
        >
          <button
            v-bind="getHandleAttrs(entry)"
            type="button"
          >
            Grab
          </button>

          {{ entry.element.label }}
        </div>
      </template>
    </div>

    <div
      v-if="overlay"
      v-bind="overlay.attrs"
      :style="overlay.style"
      class="pill"
    >
      {{ overlay.element.label }}
    </div>
  </Sortable>
</template>

<style scoped>
.lane {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
}

.pill {
  align-items: center;
  display: inline-flex;
  flex: 0 0 120px;
  justify-content: center;
  min-height: 72px;
}
</style>
```

Scoped CSS works naturally because the list is rendered by your component, not by VueSortable. There is no `listClass` API.

## Nuxt and SSR

VueSortable is designed to work with Nuxt 4 and SSR.

No Nuxt plugin is required. You should not need `<ClientOnly>` for normal usage: the list can render on the server, and drag interactions activate in the browser after hydration.

Use `<ClientOnly>` only when your own item markup renders browser-only components or accesses browser-only APIs during render.

## Public API

`src/index.ts` exposes:

```ts
export { default as Sortable } from './components/Sortable.vue'
export { reorderItems, moveItem } from './utils/reorder'
export type * from './types'
```

`useSortableList` is internal and is not part of the public package contract.

### Props

| Prop | Type | Default |
| --- | --- | --- |
| `modelValue` | `T[]` | required |
| `itemKey` | `((item: T) => string \| number) \| keyof T` | required |
| `listId` | `string` | generated internal id |
| `as` | `string` | `'div'` |
| `disabled` | `boolean` | `false` |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` |
| `layout` | `'axis' \| 'flow'` | `'axis'` |
| `behavior` | `'insert'` | `'insert'` |
| `collision` | `'overlap' \| 'center'` | `'overlap'` |
| `group` | `string \| { name: string }` | `undefined` |
| `overlap` | `number` | `0.5` |
| `activation` | `{ threshold?: number, delay?: number, delayOnTouchOnly?: boolean }` | `{ threshold: 4 }` |
| `handle` | `string` | `undefined` |
| `ignore` | `string` | `button,input,textarea,select,a,[contenteditable="true"],[data-sortable-ignore]` |
| `motion` | `false \| SortableMotion` | FLIP list and snap drop motion |
| `canMove` | `(payload: SortableCanMovePayload<T>) => boolean` | `undefined` |
| `canDrop` | `(payload: SortableCanMovePayload<T>) => boolean` | `undefined` |

`class` and `style` are normal Vue attrs and are applied to the root element. They are not typed as props.

`as` controls the outer coordinate container, not the list element. Render your semantic list inside the default slot and bind `listAttrs` to it.

`behavior` is intentionally limited to `insert` in `0.1.0`. Swap behavior is reserved for a future release.

### Events

| Event | Payload |
| --- | --- |
| `update:modelValue` | `T[]` |
| `drag-start` | `{ item: T, key: string, from: number, to: number, fromList?: string, toList?: string, group?: string }` |
| `drag-move` | `{ item: T, key: string, from: number, to: number, activeIndex: number, pointer: { x: number, y: number }, fromList?: string, toList?: string, group?: string }` |
| `reorder` | `{ item: T, key: string, from: number, to: number, fromList?: string, toList?: string, group?: string }` |
| `drag-end` | `{ item: T, key: string, from: number, to: number, fromList?: string, toList?: string, group?: string }` |
| `drag-cancel` | `{ item: T, key: string, from: number, to: number, fromList?: string, toList?: string, group?: string }` |

`reorder` is emitted only when the model changes. `drag-end` is emitted after an active drag ends, even if the item returns to its original position.

### Collision

`collision="overlap"` is the default. It opens the placeholder when the dragged overlay overlaps the neighboring item by the `overlap` ratio of that neighbor's size. The default `overlap` is `0.5`, so equal-sized items reorder at half overlap. The threshold is calculated from the active overlay size and the neighboring item size, so mixed-size lists adapt automatically.

Increase `overlap` to require more overlap before the placeholder moves, for example `0.55` for a slightly later reorder. Values are clamped to the `0..1` range. Use `collision="center"` only when you explicitly want strict overlay-center to item-center crossing.

```vue
<Sortable
  v-model="items"
  item-key="id"
  collision="overlap"
  :overlap="0.55"
/>
```

### Layouts

`layout="axis"` is the default and treats the list as one vertical or horizontal line. Use it for columns, single-row rails, and horizontally scrollable strips.

Use `layout="flow"` for wrapped rows (chip bars, tag lists). Flow layout uses the same DOM order, item attrs, placeholder, and overlay contracts, but measures visual rows and lets the overlay move on both axes. Rows are selected by the cursor's position (so off-centre grabs still aim the row you point at), while in-line placement uses the overlay body with the same direction-aware `overlap` thresholds as axis layouts — a flow row feels identical to a rail, including mid-drag direction reversals. The placeholder's live rect participates in the row mapping (it is a stable dead zone, and rows it occupies alone still count), and the index only retargets while the pointer is inside a row band, so wrap reflows cannot oscillate. Static inline siblings sharing the wrap (labels, add buttons) are tolerated: they affect wrapping but never receive insertions. It does not model dense grids, variable-span dashboards, or SortableJS `direction="auto"` semantics.

```vue
<Sortable
  v-model="filters"
  item-key="id"
  orientation="horizontal"
  layout="flow"
  :overlap="0.55"
/>
```

### Groups

Set the same `group` on multiple sortables to allow moving items between those lists. Grouped lists must use the same item type, orientation, and layout mode. Pass a stable `listId` for each grouped list when you need durable payloads or tests. Each list still owns its own `v-model`; when an item moves across lists, VueSortable emits `update:modelValue` on the source and target lists, then emits the source list's drag/reorder events with `fromList`, `toList`, and `group` populated.

Use `canMove` to let the source list reject a move and `canDrop` to let a target grouped list reject an incoming item. Both hooks receive the same payload shape; `items` is the current model for the list whose hook is running.

```vue
<Sortable
  v-model="entryRules"
  item-key="id"
  list-id="entry-rules"
  group="strategy-rules"
/>

<Sortable
  v-model="exitRules"
  item-key="id"
  list-id="exit-rules"
  group="strategy-rules"
/>
```

### Default Slot

The default slot is the rendering contract. Bind the provided attrs to your list, item, handle, placeholder, and overlay elements.

| Property | Description |
| --- | --- |
| `entries` | Render entries including normal items and the active placeholder. |
| `dragging` | `true` while pointer dragging is active. |
| `dropping` | `true` while drop motion is active. |
| `listAttrs` | Attributes to bind to your list container. |
| `getItemAttrs(entry)` | Attributes for an item entry. |
| `getHandleAttrs(entry)` | Attributes for a drag handle. |
| `getPlaceholderAttrs(entry)` | Attributes and structural style for the placeholder. |
| `overlay` | Overlay render state, or `null`. |

The old `item`, `overlay`, and `placeholder` named slots are not part of the `0.1.0` contract.

## Accessibility

VueSortable returns accessibility attrs as part of the headless contract:

- `listAttrs` includes list semantics.
- `getItemAttrs(entry).attrs` includes item semantics, position metadata, disabled state, and pointer handlers.
- `getHandleAttrs(entry)` includes handle semantics, keyboard shortcuts, disabled state, focusability, and keyboard reorder handlers.
- A hidden live region announces keyboard moves and blocked keyboard moves.

You can override accessible names by binding `getHandleAttrs(entry)` first and then providing your own `aria-label` on the handle.

Keyboard shortcuts on the handle:

- `ArrowDown` / `ArrowRight`: move the item one position later.
- `ArrowUp` / `ArrowLeft`: move the item one position earlier.
- `Home`: move the item to the start.
- `End`: move the item to the end.

## Motion

Motion is behavior-only and does not include visual effects. VueSortable may write temporary inline `transform` and `transition` values for FLIP list motion and drop snapping, then cleans them up after the animation finishes.

```vue
<Sortable
  v-model="items"
  item-key="id"
  :motion="{
    list: { type: 'flip', duration: 150, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    drop: { type: 'snap', duration: 120, easing: 'ease-out' }
  }"
/>
```

Disable all motion with:

```vue
<Sortable v-model="items" item-key="id" :motion="false" />
```

## Styling

VueSortable does not ship CSS and does not impose visual classes. It only uses structural inline styles needed for geometry, interaction, overlay positioning, placeholder sizing, optional motion, and the hidden live region.

You own all visual styling:

```vue
<Sortable v-model="items" item-key="id" v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs }">
  <div v-bind="listAttrs" class="board-list">
    <template v-for="entry in entries" :key="entry.key">
      <div
        v-if="entry.type === 'placeholder'"
        v-bind="getPlaceholderAttrs(entry).attrs"
        :style="getPlaceholderAttrs(entry).style"
      />

      <article
        v-else
        v-bind="getItemAttrs(entry).attrs"
        class="task-card"
      >
        {{ entry.element.label }}
      </article>
    </template>
  </div>
</Sortable>
```

## Comparison with VueUse useSortable / Vue.Draggable

VueUse `useSortable` integrates SortableJS into Vue composables. Vue.Draggable is also built around SortableJS.

VueSortable takes a different approach: it is a Vue-native primitive with local overlay rendering, Vue-controlled state, and no runtime dependency beyond Vue itself. It is lower-level by design, so it can fit custom UI systems without bringing visual styles, global CSS, or SortableJS behavior contracts.

## Limitations

- No nested lists yet.
- No virtualized lists yet.
- No multi-select reorder yet.
- `flow` is not a SortableJS-style freeform/grid replacement.
- The API is `0.x` and may change before `1.0`.

## Roadmap

- Higher-level accessibility examples and guidance.
- Nested list guidance.
- Virtualized list integration notes.
- More collision strategies.
- Optional examples for common UI patterns.


## Local Development

```bash
pnpm install
pnpm dev
```

The playground lives in `playground/` and is not published to npm. It imports VueSortable with the public package name, `@guillemservera/vue-sortable`; the playground Vite config aliases that name to `src/index.ts` so local development works before `dist/` exists.

The Nuxt 4 SSR fixture lives in `examples/nuxt-basic/`. It consumes VueSortable through the workspace package entry and is validated with:

```bash
pnpm test:nuxt
```

## Examples

Copyable examples are available in `examples/`.

## License

MIT © 2026 Guillem Servera
