import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WarningCard from '../../src/components/WarningCard.vue'
import type { Warning } from '../../src/types'

const yellowWarning: Warning = { id: 1, at: 60, color: 'yellow', sound: 'chime' }
const orangeWarning: Warning = { id: 2, at: 30, color: 'orange', sound: 'bell' }
const redWarning: Warning = { id: 3, at: 10, color: 'red', sound: 'gong' }

describe('WarningCard – 6-column grid structure', () => {
  it('4.1: renders grip, seconds input, color select, sound select, preview button, delete button', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })

    // Grip
    expect(wrapper.find('.grip').exists()).toBe(true)
    expect(wrapper.find('.grip svg').exists()).toBe(true)

    // Seconds input (number)
    const input = wrapper.find('input[type="number"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('60')

    // Two selects (color + sound)
    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(2)

    // Preview button
    expect(wrapper.find('button.preview-btn').exists()).toBe(true)

    // Delete button (aria-label="刪除")
    expect(wrapper.find('button[aria-label="刪除"]').exists()).toBe(true)
  })

  it('4.1: grid container has 6-column template', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    const card = wrapper.find('.warn-card')
    expect(card.exists()).toBe(true)
    const style = (card.element as HTMLElement).style.gridTemplateColumns
    expect(style).toBe('22px 64px 1fr 1fr 34px 30px')
  })
})

describe('WarningCard – tinted color select class', () => {
  it('4.3: color select has class color-yellow when warning.color === "yellow"', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    const colorSelect = wrapper.findAll('select')[0]
    expect(colorSelect.classes()).toContain('color-yellow')
    expect(colorSelect.classes()).not.toContain('color-orange')
    expect(colorSelect.classes()).not.toContain('color-red')
  })

  it('4.3: color select has class color-orange when warning.color === "orange"', () => {
    const wrapper = mount(WarningCard, { props: { warning: orangeWarning } })
    const colorSelect = wrapper.findAll('select')[0]
    expect(colorSelect.classes()).toContain('color-orange')
    expect(colorSelect.classes()).not.toContain('color-yellow')
    expect(colorSelect.classes()).not.toContain('color-red')
  })

  it('4.3: color select has class color-red when warning.color === "red"', () => {
    const wrapper = mount(WarningCard, { props: { warning: redWarning } })
    const colorSelect = wrapper.findAll('select')[0]
    expect(colorSelect.classes()).toContain('color-red')
    expect(colorSelect.classes()).not.toContain('color-yellow')
    expect(colorSelect.classes()).not.toContain('color-orange')
  })
})

describe('WarningCard – preview button', () => {
  it('4.5/4.6: clicking preview button emits "preview" event with the warning object', async () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    await wrapper.find('button.preview-btn').trigger('click')
    const emitted = wrapper.emitted('preview') as Warning[][]
    expect(emitted).toBeTruthy()
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual(yellowWarning)
  })

  it('4.5: preview button shows play icon (▶ svg path) when isPlaying is false', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isPlaying: false } })
    const btn = wrapper.find('button.preview-btn')
    expect(btn.classes()).not.toContain('playing')
    // Play triangle path
    expect(btn.find('path[d="M3 1 L10 6 L3 11 Z"]').exists()).toBe(true)
  })

  it('4.5: preview button shows pause icon (⏸ svg rects) when isPlaying is true', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isPlaying: true } })
    const btn = wrapper.find('button.preview-btn')
    expect(btn.classes()).toContain('playing')
    // Pause bars
    expect(btn.findAll('rect')).toHaveLength(2)
  })

  it('4.5: preview button does not have class "playing" by default (isPlaying omitted)', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    expect(wrapper.find('button.preview-btn').classes()).not.toContain('playing')
  })
})

describe('WarningCard – drag-and-drop', () => {
  it('5.1: card has draggable="true" attribute', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    const card = wrapper.find('.warn-card')
    expect(card.attributes('draggable')).toBe('true')
  })

  it('5.1: dragstart from an input element is prevented (no emit from WarningCard)', async () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    const input = wrapper.find('input[type="number"]')
    // Create a dragstart event where target is the input element
    const event = new DragEvent('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: input.element, configurable: true })
    input.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    // dragstart should not have been emitted from WarningCard
    expect(wrapper.emitted('dragstart')).toBeFalsy()
  })

  it('5.2: isDragging=true gives card the .dragging class', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isDragging: true } })
    expect(wrapper.find('.warn-card').classes()).toContain('dragging')
  })

  it('5.2: isDragging=false does not add .dragging class', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isDragging: false } })
    expect(wrapper.find('.warn-card').classes()).not.toContain('dragging')
  })

  it('5.3: isDropTarget=true gives card the .drag-placeholder class', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isDropTarget: true } })
    expect(wrapper.find('.warn-card').classes()).toContain('drag-placeholder')
  })

  it('5.3: isDropTarget=false does not add .drag-placeholder class', () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning, isDropTarget: false } })
    expect(wrapper.find('.warn-card').classes()).not.toContain('drag-placeholder')
  })
})

describe('WarningCard – existing update/delete events', () => {
  it('emits update:warning when seconds input changes to a valid value', async () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    const input = wrapper.find('input[type="number"]')
    await input.setValue('90')
    await input.trigger('input')
    const emitted = wrapper.emitted('update:warning') as Warning[][]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0].at).toBe(90)
  })

  it('emits delete event with the warning id when delete button is clicked', async () => {
    const wrapper = mount(WarningCard, { props: { warning: yellowWarning } })
    await wrapper.find('button[aria-label="刪除"]').trigger('click')
    const emitted = wrapper.emitted('delete') as number[][]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toBe(1)
  })
})
