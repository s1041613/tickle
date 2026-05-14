export type ColorKey = 'yellow' | 'orange' | 'red'

export type SoundKey = 'chime' | 'bell' | 'gong' | 'polite' | 'cheer'

export interface Warning {
  id: number
  at: number
  color: ColorKey
  sound: SoundKey
}

export type TimerState = 'default' | 'warn-yellow' | 'warn-orange' | 'warn-red' | 'done'

export const COLOR_TO_STATE: Record<ColorKey, Exclude<TimerState, 'default' | 'done'>> = {
  yellow: 'warn-yellow',
  orange: 'warn-orange',
  red: 'warn-red',
}

export const COLOR_LABELS: Record<ColorKey, string> = {
  yellow: '🟡 黃色',
  orange: '🟠 橘色',
  red: '🔴 紅色',
}

export const SOUND_LABELS: Record<SoundKey, string> = {
  chime: '🎐 chime',
  bell: '🔔 bell',
  gong: '🪘 gong',
  polite: '👏 polite',
  cheer: '🎉 cheer',
}
