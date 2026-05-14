import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from '../../src/components/SettingsPanel.vue'

const baseProps = {
  open: true,
  duration: 300,
  repeat: false,
  warnings: [],
  finalSound: 'gong' as const,
}

const mountOptions = {
  global: { stubs: { DurationHmsInput: true } },
}

describe('SettingsPanel – preset duration chips', () => {
  it('3.A: renders 6 chips with correct labels', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const chips = wrapper.findAll('button.chip')
    expect(chips).toHaveLength(6)
    const labels = chips.map((c) => c.text())
    expect(labels).toEqual(['1 分', '5 分', '10 分', '15 分', '30 分', '1 時'])
  })

  it('3.B: clicking the "5 分" chip emits update:duration with 300', async () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const chips = wrapper.findAll('button.chip')
    const fiveMin = chips.find((c) => c.text() === '5 分')
    expect(fiveMin).toBeTruthy()
    await fiveMin!.trigger('click')
    const emitted = wrapper.emitted('update:duration') as number[][]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toBe(300)
  })

  it('3.C: when duration === 300, chip "5 分" has class active and others do not', () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, duration: 300 },
      ...mountOptions,
    })
    const chips = wrapper.findAll('button.chip')
    chips.forEach((chip) => {
      if (chip.text() === '5 分') {
        expect(chip.classes()).toContain('active')
      } else {
        expect(chip.classes()).not.toContain('active')
      }
    })
  })

  it('3.D: when duration !== any preset, no chip has class active', () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, duration: 42 },
      ...mountOptions,
    })
    const activeChips = wrapper.findAll('button.chip.active')
    expect(activeChips).toHaveLength(0)
  })

  it('3.E: clicking "1 時" chip emits update:duration with 3600', async () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const chips = wrapper.findAll('button.chip')
    const oneHour = chips.find((c) => c.text() === '1 時')
    expect(oneHour).toBeTruthy()
    await oneHour!.trigger('click')
    const emitted = wrapper.emitted('update:duration') as number[][]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toBe(3600)
  })
})
