import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from '../../src/components/SettingsPanel.vue'
import type { Warning } from '../../src/types'

const mockPlaySound = vi.fn()

const baseProps = {
  open: true,
  duration: 300,
  repeat: false,
  warnings: [],
  finalSound: 'gong' as const,
  playSound: mockPlaySound,
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

describe('SettingsPanel – warning preview', () => {
  const sampleWarnings: Warning[] = [
    { id: 1, at: 60, color: 'yellow', sound: 'chime' },
    { id: 2, at: 30, color: 'orange', sound: 'bell' },
  ]

  beforeEach(() => {
    vi.useFakeTimers()
    mockPlaySound.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('4.7/4.8: receiving preview event from WarningCard calls playSound and sets isPlaying on that card', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: sampleWarnings },
      ...mountOptions,
    })

    // Find the first WarningCard and emit preview from it
    const cards = wrapper.findAllComponents({ name: 'WarningCard' })
    expect(cards).toHaveLength(2)

    await cards[0].vm.$emit('preview', sampleWarnings[0])
    await wrapper.vm.$nextTick()

    expect(mockPlaySound).toHaveBeenCalledWith('chime')

    // The first card should now show isPlaying = true
    expect(cards[0].props('isPlaying')).toBe(true)
    // The second card should not be playing
    expect(cards[1].props('isPlaying')).toBe(false)
  })

  it('4.8: only one card animates at a time — clicking second card stops first', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: sampleWarnings },
      ...mountOptions,
    })

    const cards = wrapper.findAllComponents({ name: 'WarningCard' })

    // Start preview on first card
    await cards[0].vm.$emit('preview', sampleWarnings[0])
    await wrapper.vm.$nextTick()
    expect(cards[0].props('isPlaying')).toBe(true)
    expect(cards[1].props('isPlaying')).toBe(false)

    // Start preview on second card — first should stop
    await cards[1].vm.$emit('preview', sampleWarnings[1])
    await wrapper.vm.$nextTick()
    expect(cards[0].props('isPlaying')).toBe(false)
    expect(cards[1].props('isPlaying')).toBe(true)
  })

  it('4.9: after 1200ms playingId clears and isPlaying returns to false', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: sampleWarnings },
      ...mountOptions,
    })

    const cards = wrapper.findAllComponents({ name: 'WarningCard' })

    await cards[0].vm.$emit('preview', sampleWarnings[0])
    await wrapper.vm.$nextTick()
    expect(cards[0].props('isPlaying')).toBe(true)

    // Advance time by 1200ms
    vi.advanceTimersByTime(1200)
    await wrapper.vm.$nextTick()

    expect(cards[0].props('isPlaying')).toBe(false)
  })
})
