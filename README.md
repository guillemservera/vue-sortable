# VueSortable

Headless-first sortable primitives for Vue 3.

VueSortable is not a SortableJS wrapper. It is a Vue-native primitive for axis-first reordering where you own the markup, layout, styles, and visual treatment.

## Status

VueSortable is currently in an early `0.x` release. The stable paths are axis reordering (single-list vertical/horizontal lists and grouped axis lists) and wrapped `flow` rows (chip bars and tag lists that wrap across lines). Free movement between lists of any orientation and layout, drag sources that are not list items, and removal on a drop outside are newer and opt-in. Flow is still not a SortableJS-style freeform/grid replacement.

Nuxt 4 SSR compatibility is validated with a dedicated fixture under `examples/nuxt-basic`.

## Why VueSortable?

VueSortable exists for teams that want sortable behavior without adopting a styled component, a DOM-cloning drag library, or SortableJS-specific contracts.

The primitive handles sorting state, geometry, pointer events, placeholder placement, local overlay positioning, reorder decisions, keyboard handle behavior, live-region announcements, and optional geometric motion. You render the list and items through the default slot.

## Features

- Vue 3.5+ component API.
- Dependency-free runtime, with `vue` as the only peer dependency.
- Single-list and grouped axis reorder with controlled `v-model`.
- Vertical and horizontal orientation.
- Opt-in free movement between lists side by side, along different axes, or wrapped and unwrapped.
- Drag sources that are not list items (`SortableSource`), turned into an item by the list that receives them.
- Drop verdicts with a reason while dragging, and removal on a drop outside every list.
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
export { default as SortableSource } from './components/SortableSource.vue'
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
| `movement` | `'axis' \| 'free'` | `'axis'` |
| `removeOnDropOutside` | `boolean` | `false` |
| `overlap` | `number` | `0.5` |
| `activation` | `{ threshold?: number, delay?: number, delayOnTouchOnly?: boolean }` | `{ threshold: 4 }` |
| `handle` | `string` | `undefined` |
| `ignore` | `string` | `button,input,textarea,select,a,[contenteditable="true"],[data-sortable-ignore]` |
| `motion` | `false \| SortableMotion` | FLIP list and snap drop motion |
| `canMove` | `(payload: SortableCanMovePayload<T>) => boolean` | `undefined` |
| `canDrop` | `(payload: SortableCanMovePayload<T>) => boolean \| string` | `undefined` |
| `canReceive` | `(payload: SortableReceivePayload<T>) => boolean \| string` | `undefined` |

`canDrop` and `canReceive` refuse a drop with `false`, or with a string that says why. That holds on every list, whatever its `movement`: in 0.2.0 `canDrop` was typed `boolean` and tested for truthiness, so an untyped hook that returned a non-empty string let the drop through, and now refuses it. See [Drop verdicts](#drop-verdicts).

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

| `remove` | the `drag-end` payload, with `outside: true` |
| `receive` | `{ data: unknown, to: number, toList: string, group: string, items: T[] }` |

The drag payloads carry two more keys, each present only when it applies:

- `outside: true`, with free movement only: in every drag event emitted while the pointer is over no list of the item's group, and in `remove`. A disabled list of the group under the pointer is not outside.
- `reason`, the string a list refused the drop with. With free movement, where the list under the pointer is asked while dragging, it is in the `drag-move` events emitted over that list and in the `drag-cancel` and `drag-end` of a release there. With axis movement, where `canDrop` is asked on release only, it is in that release's `drag-cancel` and `drag-end`.

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

Use `layout="flow"` for wrapped rows (chip bars, tag lists). Flow layout uses the same DOM order, item attrs, placeholder, and overlay contracts, but measures visual rows. The overlay follows the pointer along the row and stays on the row that holds the placeholder. Rows are selected by the cursor's position (so off-centre grabs still aim the row you point at) with hysteresis: the target row only changes once the cursor is more than half a row height past the current row's band, so vertical drift while dragging along a row never retargets. Then the overlay moves onto the new row with the placeholder. In-line placement uses the overlay body with the same direction-aware `overlap` thresholds as axis layouts — a flow row feels identical to a rail, including mid-drag direction reversals. The placeholder's live rect participates in the row mapping (it is a stable dead zone, and rows it occupies alone still count), and the index only retargets while the pointer is inside a row band, so wrap reflows cannot oscillate. Static inline siblings sharing the wrap (labels, add buttons) are tolerated: they affect wrapping but never receive insertions. It does not model dense grids, variable-span dashboards, or SortableJS `direction="auto"` semantics.

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

Set the same `group` on multiple sortables to allow moving items between those lists. With the default `movement="axis"`, grouped lists must use the same item type, orientation, and layout mode, and axis lists are told apart along their axis only, so they sit one after another on it; see [Free movement](#free-movement) for lists side by side or of different orientations. Pass a stable `listId` for each grouped list when you need durable payloads or tests. Each list still owns its own `v-model`; when an item moves across lists, VueSortable emits `update:modelValue` on the source and target lists, then emits the source list's drag/reorder events with `fromList`, `toList`, and `group` populated.

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

### Free movement

`movement="axis"` is the default: the overlay stays on the list's axis and inside the grouped lists, which must share orientation and layout.

Set `movement="free"` on a list to let its items go anywhere. The overlay follows the pointer on both axes with `position: fixed`, and the target is the grouped list whose root is under the pointer, whatever its orientation or layout: columns side by side, a wrapped row above a vertical stack. In its own list an item is placed as with axis movement, except that the overlay of a `flow` list is no longer held on the placeholder's row. In another list the pointer is compared with the centers of that list's items, because the dragged item may be of another size.

```vue
<Sortable v-model="todo" item-key="id" group="board" list-id="todo" movement="free" />
<Sortable v-model="done" item-key="id" group="board" list-id="done" movement="free" />
```

What follows from that:

- The movement is the dragged item's list's. Set it on every list of the group that items can leave.
- The root element is what a list is dropped on. Give it the size of the drop area (a column's whole height, say), and an empty list a size at all.
- The placeholder and the overlay keep the size the item had where it was picked up. Override the placeholder's `width` or `height` when a list lays its items out differently.
- A `position: fixed` element is offset by an ancestor with a `transform`, `filter`, or `contain`. Render the overlay in a `<Teleport to="body">` when that applies.
- Over no list of its group, the placeholder returns to where the item was and a release cancels the drag (`drag-cancel`, then `drag-end`, both with `outside: true`). The overlay state has `outside` too, and the overlay element of a free drag `data-vuesortable-outside`.
- A disabled list of the group takes nothing, and the pointer over it is not outside: the placeholder returns to where the item was, `overlay.allowed` is `false`, and a release cancels the drag. The same holds over the item's own list if it is disabled while the drag is under way.
- Only the pointer that began a drag moves or ends it; a second finger does neither. A free drag whose pointer is found released without a `pointerup` (a mouse move with no button held, or the pointer capture lost) is cancelled where it is, with `drag-cancel`, and nothing is dropped.
- Lists clipped by a scroll container are still hit over their hidden part, and nothing scrolls automatically while dragging.

Lists of one group that hold items of different shapes work, but not through `v-model`: bind `:model-value`, and apply the move yourself in `@reorder`, where `fromList`, `toList`, and `to` say what happened.

### Drop verdicts

`canDrop` (and `canReceive`, for a [source](#sortablesource)) refuses a drop by returning `false`, or a string that says why. Any string refuses, on any list; return `true` to accept.

With axis movement the hook runs once, on release. With free movement it also runs while dragging, each time the list or the index under the pointer changes, so the refusal can be shown before the drop. Keep it free of side effects.

```vue
<Sortable
  v-model="doing"
  item-key="id"
  group="board"
  movement="free"
  :can-drop="({ items }) => items.length < 3 || 'Doing takes 3 cards at most'"
  v-slot="{ entries, listAttrs, getItemAttrs, getPlaceholderAttrs, dropTarget }"
>
  <div v-bind="listAttrs">
    <template v-for="entry in entries" :key="entry.key">
      <div
        v-if="entry.type === 'placeholder'"
        v-show="dropTarget?.allowed !== false"
        v-bind="getPlaceholderAttrs(entry).attrs"
        :style="getPlaceholderAttrs(entry).style"
      />
      <div v-else v-bind="getItemAttrs(entry).attrs">{{ entry.element.label }}</div>
    </template>
  </div>
  <p v-if="dropTarget?.reason">{{ dropTarget.reason }}</p>
</Sortable>
```

While a free drag is under way, every enabled list of its group, the item's own included, has:

- the `dropTarget` slot prop, `{ over, allowed, reason? }`, and `null` at any other time;
- `data-vuesortable-drop-target` on its root: `idle`, `over`, or `refused`.

The dragging side gets the same verdict: `overlay.allowed` and `overlay.reason`, and `reason` in the `drag-move`, `drag-cancel`, and `drag-end` payloads. A refused list still has the placeholder in its `entries`; hide it if a refusal should open no gap, as above.

### Dropping outside

`remove-on-drop-outside` removes an item released over no list of its group. It implies free movement. While the pointer is outside, the item's gap closes; on release the list emits `update:modelValue` without the item, then `remove`, then `drag-end`.

```vue
<Sortable v-model="tags" item-key="id" remove-on-drop-outside @remove="onRemove" />
```

Only that release removes:

- A disabled list of the group under the pointer is not outside. A release over it cancels the drag and removes nothing, and so does a release over the item's own list if it was disabled while the drag was under way. A list that is disabled by the time of the release removes nothing wherever the pointer is.
- A drag that ends any other way is cancelled and removes nothing: `pointercancel`, a pointer found released without a `pointerup`, a lost pointer capture. Another pointer's events are ignored.
- `canMove` is asked first, with `outside: true` in its payload, and can keep the item.

Everything that is not the root of a list of the group is outside, though: a column's title rendered beside the root, the gap between two columns, the page around them. A near miss should not delete, so guard the removal:

- make the root the whole drop area, its header included;
- let `canMove` allow a removal only where it is meant: once the pointer has left the board, or over a marked remove area. `canMove` is not given the pointer; keep the last one from `drag-move`.

```vue
<script setup lang="ts">
const board = ref<HTMLElement | null>(null)
const leaving = ref(false)

function onDragMove({ outside, pointer }) {
  const box = board.value!.getBoundingClientRect()
  leaving.value = outside === true
    && (pointer.x < box.left || pointer.x > box.right || pointer.y < box.top || pointer.y > box.bottom)
}
</script>

<template>
  <div ref="board">
    <Sortable
      v-model="cards"
      item-key="id"
      remove-on-drop-outside
      :can-move="({ outside }) => !outside || leaving"
      @drag-move="onDragMove"
      @remove="onRemove"
    />
  </div>
</template>
```

Say what a release will do from that same state (`leaving` here) rather than from `overlay.outside` alone, which is also true over the parts of the board that are not a list. `examples/kanban.vue` is this pattern in full.

### SortableSource

`SortableSource` makes any element a drag source for something that is not an item of a list: a block in a palette, a field in a sidebar. It renders nothing of its own.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Sortable, SortableSource } from '@guillemservera/vue-sortable'
import type { SortableReceivePayload } from '@guillemservera/vue-sortable'

type Block = { kind: string, label: string }
type Placed = Block & { id: string }

const palette: Block[] = [{ kind: 'text', label: 'Text' }, { kind: 'image', label: 'Image' }]
const page = ref<Placed[]>([])

function place({ data, items, to }: SortableReceivePayload<Placed>) {
  const next = [...items]
  next.splice(to, 0, { ...(data as Block), id: crypto.randomUUID() })
  page.value = next
}
</script>

<template>
  <SortableSource
    v-for="block in palette"
    :key="block.kind"
    :data="block"
    group="builder"
    v-slot="{ sourceAttrs, overlay }"
  >
    <div v-bind="sourceAttrs">{{ block.label }}</div>
    <Teleport to="body">
      <div v-if="overlay" v-bind="overlay.attrs" :style="overlay.style">{{ overlay.element.label }}</div>
    </Teleport>
  </SortableSource>

  <Sortable v-model="page" item-key="id" group="builder" @receive="place">
    <!-- the list, as in the Quick Start -->
  </Sortable>
</template>
```

| Prop | Type | Default |
| --- | --- | --- |
| `data` | `D` | required |
| `group` | `string \| { name: string }` | required |
| `disabled` | `boolean` | `false` |
| `activation` | `{ threshold?: number, delay?: number, delayOnTouchOnly?: boolean }` | `{ threshold: 4 }` |
| `motion` | `false \| SortableMotion` | snap drop motion |

- The source always moves freely, is never a target, and stays where it is. The lists of its `group` take it whatever their own `movement`.
- The list under the pointer shows a placeholder, and on drop emits `receive`. No model is changed for you: the list makes an item of `data` and inserts it at `to`.
- `canReceive` on the list refuses a source as `canDrop` refuses an item. Released over no list of its group, over a disabled one, or refused, the drag is cancelled and the overlay returns to the source.
- The slot gives `sourceAttrs` for the element that is pressed (the pointer handler, `data-vuesortable-source`, `data-vuesortable-dragging`, and `touch-action: none`), `dragging`, and `overlay`, as a list's.
- It emits `drag-start`, `drag-move`, `drag-end`, and `drag-cancel` with a list's payloads, where `item` is `data`. `toList` and `to` are the list under the pointer, unless `outside` is set.
- A press that does not become a drag is still a click; the click that would end a drag is swallowed.

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
| `overlay` | Overlay render state, or `null`. With free movement it also says `outside`, `allowed`, and `reason`. |
| `dropTarget` | `{ over, allowed, reason? }` while a free drag could be dropped on this list, else `null`. |

The old `item`, `overlay`, and `placeholder` named slots are not part of the `0.1.0` contract.

## Accessibility

VueSortable returns accessibility attrs as part of the headless contract:

- `listAttrs` includes list semantics.
- `getItemAttrs(entry).attrs` includes item semantics, position metadata, disabled state, and pointer handlers.
- `getHandleAttrs(entry)` includes handle semantics, keyboard shortcuts, disabled state, focusability, and keyboard reorder handlers.
- A hidden live region announces keyboard moves and blocked keyboard moves.

Keyboard reordering works inside one list. Moving an item to another list, dragging a `SortableSource`, and removing by a drop outside are pointer-only: where "the next list" is has no general answer for lists laid out freely, and a source has no position to move from. Dragging must not be the only way to do any of them (WCAG 2.5.7): offer a button or a menu for the same change, and apply it to your models with `moveItem` or plain array code.

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
- No keyboard path between lists, for sources, or for removal: provide your own control.
- No scrolling while dragging near an edge.
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

Copyable examples are available in `examples/`, among them a kanban board with free movement, a column limit, and removal on a drop outside (`kanban.vue`), and a palette of blocks dragged onto a toolbar and a page (`palette.vue`).

## License

MIT © 2026 Guillem Servera
