import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDurationHms } from '../../src/composables/useDurationHms'

describe('useDurationHms', () => {
  it('1.4: useDurationHms(ref(0)) returns h=0, m=0, s=0', () => {
    const seconds = ref(0)
    const { h, m, s } = useDurationHms(seconds)
    expect(h.value).toBe(0)
    expect(m.value).toBe(0)
    expect(s.value).toBe(0)
  })

  it('1.5: useDurationHms(ref(3661)) returns h=1, m=1, s=1', () => {
    const seconds = ref(3661)
    const { h, m, s } = useDurationHms(seconds)
    expect(h.value).toBe(1)
    expect(m.value).toBe(1)
    expect(s.value).toBe(1)
  })

  it('1.6: setHms({h:2, m:30, s:0}) updates underlying ref to 9000', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 2, m: 30, s: 0 })
    expect(seconds.value).toBe(9000)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=0', () => {
    const seconds = ref(0)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 0
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=59', () => {
    const seconds = ref(59)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 59
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=60', () => {
    const seconds = ref(60)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 60
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=3599', () => {
    const seconds = ref(3599)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 3599
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=3600', () => {
    const seconds = ref(3600)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 3600
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.7: round-trip setHms(x) → {h,m,s} is identity for x=36000', () => {
    const seconds = ref(36000)
    const { h, m, s, setHms } = useDurationHms(seconds)
    const x = 36000
    setHms({ h: h.value, m: m.value, s: s.value })
    expect(seconds.value).toBe(x)
  })

  it('1.8: setHms with negative h value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: -1, m: 30, s: 0 })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with negative m value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 1, m: -5, s: 30 })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with negative s value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 1, m: 30, s: -10 })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with NaN h value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: NaN, m: 30, s: 0 })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with NaN m value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 1, m: NaN, s: 30 })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with NaN s value clamps to 0', () => {
    const seconds = ref(0)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 1, m: 30, s: NaN })
    expect(seconds.value).toBe(0)
  })

  it('1.8: setHms with all valid values and one NaN keeps h/m as-is only if all are valid', () => {
    const seconds = ref(3600)
    const { setHms } = useDurationHms(seconds)
    setHms({ h: 2, m: 0, s: NaN })
    expect(seconds.value).toBe(0)
  })
})
