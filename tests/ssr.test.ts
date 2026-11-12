// @vitest-environment node

import { renderToString } from '@vue/server-renderer'
import { createSSRApp, h, ref } from 'vue'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'
import { Sortable } from '../src'
import { SortableSource } from '../src'

type Item = {
  id: string
  label: string
}

describe('SSR compatibility', () => {
  it('imports the public API without browser globals', async () => {
    expect('window' in globalThis).toBe(false)
    expect('document' in globalThis).toBe(false)

    const publicApi = await import('../src')

    expect(publicApi.Sortable).toBeDefined()
    expect('useSortableList' in publicApi).toBe(false)
    expect(publicApi.reorderItems).toBeTypeOf('function')
    expect(publicApi.moveItem).toBeTypeOf('function')
  })

  it('renders Sortable on the server without accessing DOM APIs', async () => {
    const app = createSSRApp({
      setup() {
        const items = ref<Item[]>([
          { id: 'drafts', label: 'Drafts' },
          { id: 'issues', label: 'Issues' },
          { id: 'inbox', label: 'Inbox' },
        ])

        return () =>
          h(
            Sortable as Component,
            {
              modelValue: items.value,
              itemKey: 'id',
            },
            {
              default: ({
                entries,
                getItemAttrs,
                getPlaceholderAttrs,
                listAttrs,
                overlay,
              }: any) => [
                h(
                  'div',
                  listAttrs,
                  entries.map((entry: any) => {
                    if (entry.type === 'placeholder') {
                      const placeholder = getPlaceholderAttrs(entry)
                      return h('div', { ...placeholder.attrs, style: placeholder.style })
                    }

                    return h('article', getItemAttrs(entry).attrs, entry.element.label)
                  }),
                ),
                overlay ? h('div', { ...overlay.attrs, style: overlay.style }, overlay.element.label) : null,
              ],
            },
          )
      },
    })

    const html = await renderToString(app)

    expect(html).toContain('Drafts')
    expect(html).toContain('Issues')
    expect(html).toContain('Inbox')
    expect(html).toContain('data-vuesortable-root')
  })
})

describe('SSR compatibility of the drag source', () => {
  it('renders SortableSource on the server as its slot alone', async () => {
    const app = createSSRApp({
      setup() {
        return () =>
          h(
            SortableSource as Component,
            { data: { kind: 'text' }, group: 'board' },
            {
              default: ({ overlay, sourceAttrs }: any) => [
                h('button', { ...sourceAttrs, type: 'button' }, 'Text'),
                overlay ? h('div', { ...overlay.attrs, style: overlay.style }, 'Text') : null,
              ],
            },
          )
      },
    })

    const html = await renderToString(app)

    expect(html).toContain('data-vuesortable-source')
    expect(html).toContain('data-vuesortable-dragging="false"')
    expect(html).not.toContain('data-vuesortable-overlay')
    expect(html).not.toContain('data-vuesortable-root')
  })
})
