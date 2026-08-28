import { describe, expect, it } from 'vitest'
import { getLayoutRect } from '../src/utils/dom'

function elementWithRect(rect: { top: number, left: number, width: number, height: number }) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  element.getBoundingClientRect = () => ({
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect)
  return element
}

describe('getLayoutRect', () => {
  it('passes the rect through when no transform is applied', () => {
    const element = elementWithRect({ top: 10, left: 20, width: 100, height: 40 })
    const rect = getLayoutRect(element)
    expect(rect.left).toBe(20)
    expect(rect.top).toBe(10)
  })

  it('removes an in-flight translate3d from the rect', () => {
    const element = elementWithRect({ top: 10, left: 20, width: 100, height: 40 })
    element.style.transform = 'translate3d(44px, -88px, 0)'
    const rect = getLayoutRect(element)
    expect(rect.left).toBe(20 - 44)
    expect(rect.top).toBe(10 + 88)
    expect(rect.width).toBe(100)
    expect(rect.height).toBe(40)
  })

  it('removes a computed matrix translation from the rect', () => {
    const element = elementWithRect({ top: 0, left: 0, width: 50, height: 50 })
    element.style.transform = 'matrix(1, 0, 0, 1, 30, -12)'
    const rect = getLayoutRect(element)
    expect(rect.left).toBe(-30)
    expect(rect.top).toBe(12)
  })
})
