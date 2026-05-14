import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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

describe('SettingsPanel – drag-to-reorder warnings', () => {
  const w0: Warning = { id: 1, at: 60, color: 'yellow', sound: 'chime' }
  const w1: Warning = { id: 2, at: 30, color: 'orange', sound: 'bell' }
  const w2: Warning = { id: 3, at: 10, color: 'red', sound: 'gong' }
  const threeWarnings = [w0, w1, w2]

  it('5.4: dragging card 0 and dropping on card 2 emits update:warnings with [w1, w2, w0]', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: threeWarnings },
      ...mountOptions,
    })
    const cards = wrapper.findAllComponents({ name: 'WarningCard' })
    expect(cards).toHaveLength(3)

    // Simulate dragstart on card 0
    await cards[0].vm.$emit('dragstart', new DragEvent('dragstart'), w0.id)
    await nextTick()

    // Simulate drop on card 2
    await cards[2].vm.$emit('drop', new DragEvent('drop'), w2.id)
    await nextTick()

    const emitted = wrapper.emitted('update:warnings') as Warning[][][]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([w1, w2, w0])
  })

  it('5.5: dragging card 2 and dropping on card 0 emits update:warnings with [w2, w0, w1]', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: threeWarnings },
      ...mountOptions,
    })
    const cards = wrapper.findAllComponents({ name: 'WarningCard' })
    expect(cards).toHaveLength(3)

    // Simulate dragstart on card 2
    await cards[2].vm.$emit('dragstart', new DragEvent('dragstart'), w2.id)
    await nextTick()

    // Simulate drop on card 0
    await cards[0].vm.$emit('drop', new DragEvent('drop'), w0.id)
    await nextTick()

    const emitted = wrapper.emitted('update:warnings') as Warning[][][]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual([w2, w0, w1])
  })

  it('5.6: dropping on the same card emits no update:warnings', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: threeWarnings },
      ...mountOptions,
    })
    const cards = wrapper.findAllComponents({ name: 'WarningCard' })

    // Dragstart on card 1, then drop on the same card 1
    await cards[1].vm.$emit('dragstart', new DragEvent('dragstart'), w1.id)
    await nextTick()
    await cards[1].vm.$emit('drop', new DragEvent('drop'), w1.id)
    await nextTick()

    expect(wrapper.emitted('update:warnings')).toBeFalsy()
  })

  it('5.7: after drop, draggingId and dropTargetId are cleared (all cards report isDragging=false, isDropTarget=false)', async () => {
    const wrapper = mount(SettingsPanel, {
      props: { ...baseProps, warnings: threeWarnings },
      ...mountOptions,
    })
    const cards = wrapper.findAllComponents({ name: 'WarningCard' })

    // Dragstart on card 0
    await cards[0].vm.$emit('dragstart', new DragEvent('dragstart'), w0.id)
    await nextTick()
    // Card 0 should be dragging
    expect(cards[0].props('isDragging')).toBe(true)

    // Dragover card 2 sets drop target
    await cards[2].vm.$emit('dragover', new DragEvent('dragover'), w2.id)
    await nextTick()
    expect(cards[2].props('isDropTarget')).toBe(true)

    // Drop completes reorder
    await cards[2].vm.$emit('drop', new DragEvent('drop'), w2.id)
    await nextTick()

    // After drop, all cards should have isDragging=false and isDropTarget=false
    for (const card of cards) {
      expect(card.props('isDragging')).toBe(false)
      expect(card.props('isDropTarget')).toBe(false)
    }
  })
})

describe('SettingsPanel – CTA button soft-orange styling (Group 6)', () => {
  it('6.1a: CTA button has class cta-done', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const cta = wrapper.find('button.cta-done')
    expect(cta.exists()).toBe(true)
  })

  it('6.1b: CTA button text is "✓ 設定完成"', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const cta = wrapper.find('button.cta-done')
    expect(cta.text()).toContain('設定完成')
  })

  it('6.1c: CTA button does NOT have bg-orange class (no solid orange)', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const cta = wrapper.find('button.cta-done')
    expect(cta.classes()).not.toContain('bg-orange')
  })

  it('6.1d: CTA button does NOT have shadow-orange class (no box-shadow)', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    const cta = wrapper.find('button.cta-done')
    expect(cta.classes()).not.toContain('shadow-orange')
  })
})

describe('SettingsPanel – no hint texts (Group 6)', () => {
  it('6.2: panel text does not contain HMS hint about 設定 30 秒可快速測試', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    expect(wrapper.text()).not.toContain('設定 30 秒可快速測試')
  })

  it('6.3: panel text does not contain 拖曳左側 warning milestones hint', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    expect(wrapper.text()).not.toContain('拖曳左側')
  })

  it('6.4: panel text does not contain URL footer hint (所有設定都會即時寫進網址)', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    expect(wrapper.text()).not.toContain('所有設定都會即時寫進網址')
  })

  it('6.4b: panel text does not contain the URL footer variant (設定會自動寫進網址列)', () => {
    const wrapper = mount(SettingsPanel, { props: baseProps, ...mountOptions })
    expect(wrapper.text()).not.toContain('設定會自動寫進網址列')
  })
})
