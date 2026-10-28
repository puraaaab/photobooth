// Web Audio API Synthesizer for Photobooth Countdown & Shutter Beeps

let audioCtx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new AudioContextClass()
  }
  return audioCtx
}

/**
 * Unlocks the Web Audio context on the user's initial gesture (touch/click).
 * This satisfies Chromium's autoplay policy requirement.
 */
export async function unlockAudioContext(): Promise<AudioContext> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch (e) {
      console.warn('[Audio] Failed to resume AudioContext:', e)
    }
  }
  return ctx
}

/**
 * Play a synthesized countdown tick beep (short sine wave pulse).
 */
export function playCountdownTick(frequency = 880, duration = 0.08) {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)

    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch (err) {
    console.warn('[Audio] Countdown tick error:', err)
  }
}

/**
 * Play a synthesized shutter click / chime sound.
 */
export function playShutterSound() {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    // High chime tone
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1320, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)

    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch (err) {
    console.warn('[Audio] Shutter sound error:', err)
  }
}
