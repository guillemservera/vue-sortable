# Changelog

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
