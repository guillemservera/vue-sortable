# Changelog

## Unreleased

- `movement="free"`: the overlay follows the pointer on both axes, fixed to the viewport, and the target is the grouped list under the pointer whatever its orientation or layout, so lists side by side, a row and a column, or a wrapped row and a stack can exchange items. Over no list the placeholder returns to where the item was and a release cancels; payloads and the overlay state say `outside`. The default, `movement="axis"`, is unchanged.
- `SortableSource`: a renderless component that makes any element a drag source for something that is not a list item. The grouped list it is dropped on emits `receive` with the source's `data` and the index, and makes an item of it; `canReceive` refuses it.
- `removeOnDropOutside`: an item released over no list is removed (`update:modelValue`, then the new `remove` event). `canMove` is asked first, with `outside: true`.
- `canDrop` may return a string to refuse a drop with a reason; `drag-cancel` carries it as `reason`. With free movement `canDrop` and `canReceive` are also asked while dragging, and every list of the group gets a `dropTarget` slot prop and a `data-vuesortable-drop-target` attribute (`idle`, `over`, `refused`). With axis movement `canDrop` is asked on release only, as before.
- The overlay state gains `outside`, `allowed`, and `reason`, and the overlay attributes `data-vuesortable-outside`.
- Bundle: 39.00 kB to 44.23 kB raw, 10.67 kB to 12.04 kB gzip; the size budget is now 46 kB raw and 12.5 kB gzip.

## 0.2.0

- `layout="flow"`: the lifted overlay now stays on the row that holds the placeholder and only follows the pointer along the row, instead of floating freely on both axes. Changing rows now requires the cursor to be more than half a row height past the current row's band (hysteresis), so small vertical drift while dragging along a row no longer retargets another row. When the row changes, the overlay moves onto the new row with the placeholder. Axis layouts are unchanged.

## 0.1.1

- Resolve the drag layout's entries by key instead of scanning the list per element, so refreshing it during a drag stops being quadratic. Measured on Chromium with layout invalidated each pass: 1000 rows 19ms to 4.5ms, 300 rows 2.7ms to 1.2ms, unchanged for short lists. No behavior change.

## 0.1.0

- Initial VueSortable package contract.
- Added the headless-first `Sortable` component and `reorderItems` / `moveItem` utilities.
- Supports Vue-controlled single-list reordering with pointer gestures, handles, ignore selectors, horizontal and vertical orientation, FLIP list motion, snap drop motion, default-slot overlay and placeholder rendering, and `canMove` guards.
- Supports keyboard reordering through `getHandleAttrs(entry)`, live region announcements, and focus restoration.
- Validates SSR rendering and Nuxt 4 prerendering with dedicated tests and a Nuxt fixture.
