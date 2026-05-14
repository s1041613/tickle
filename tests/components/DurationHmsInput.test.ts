import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DurationHmsInput from '../../src/components/DurationHmsInput.vue'

describe('DurationHmsInput', () => {
  it('2.A: renders three inputs with correct values for modelValue=3661 (h=1, m=1, s=1)', () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 3661 },
    })
    const inputs = wrapper.findAll('input[type="number"]')
    expect(inputs).toHaveLength(3)
    expect(Number((inputs[0].element as HTMLInputElement).value)).toBe(1)
    expect(Number((inputs[1].element as HTMLInputElement).value)).toBe(1)
    expect(Number((inputs[2].element as HTMLInputElement).value)).toBe(1)
  })

  it('2.B: changing hour input emits update:modelValue with recomputed seconds', async () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 3661 },
    })
    const hourInput = wrapper.findAll('input[type="number"]')[0]
    await hourInput.setValue('2')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted).toHaveLength(1)
    // h=2, m=1, s=1 → 7200 + 60 + 1 = 7261
    expect((emitted as number[][])[0][0]).toBe(7261)
  })

  it('2.C: setting all three fields to 0 emits update:modelValue with 0', async () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 3661 },
    })
    const inputs = wrapper.findAll('input[type="number"]')

    await inputs[0].setValue('0')
    // Update prop to reflect the last emit
    await wrapper.setProps({ modelValue: 0 })

    await inputs[1].setValue('0')
    await wrapper.setProps({ modelValue: 0 })

    await inputs[2].setValue('0')

    const emitted = wrapper.emitted('update:modelValue') as number[][]
    expect(emitted).toBeTruthy()
    const lastEmit = emitted[emitted.length - 1][0]
    expect(lastEmit).toBe(0)
  })

  it('2.D: empty input (NaN from "") is treated as 0 by composable clamp', async () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 3661 },
    })
    const inputs = wrapper.findAll('input[type="number"]')
    // Simulate clearing the minute field — browser sends ""
    const minuteInput = inputs[1]
    await minuteInput.setValue('')
    const emitted = wrapper.emitted('update:modelValue') as number[][]
    expect(emitted).toBeTruthy()
    expect(emitted).toHaveLength(1)
    // h=1, m=0 (NaN clamped to 0), s=1 → 3600 + 0 + 1 = 3601
    expect(emitted[0][0]).toBe(3601)
  })

  it('2.E: renders unit labels 時/分/秒', () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 0 },
    })
    const text = wrapper.text()
    expect(text).toContain('時')
    expect(text).toContain('分')
    expect(text).toContain('秒')
  })

  it('2.F: modelValue=0 renders three inputs all showing 0 (not blank)', () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 0 },
    })
    const inputs = wrapper.findAll('input[type="number"]')
    expect((inputs[0].element as HTMLInputElement).value).toBe('0')
    expect((inputs[1].element as HTMLInputElement).value).toBe('0')
    expect((inputs[2].element as HTMLInputElement).value).toBe('0')
  })

  it('2.G: blur on empty field restores "0" display', async () => {
    const wrapper = mount(DurationHmsInput, {
      props: { modelValue: 60 },
    })
    const minuteInput = wrapper.findAll('input[type="number"]')[1]
    const el = minuteInput.element as HTMLInputElement
    el.value = ''
    await minuteInput.trigger('blur')
    expect(el.value).toBe('0')
  })
})
