// Retro 16/32-bit style chiptune SFX. Synthesized with the Web Audio API —
// no asset files, no network fetch. Soundtrack is TODO — designing it later.

export type SfxName =
  | 'move'
  | 'appMove'
  | 'correct'
  | 'best'
  | 'wrong'
  | 'tooWeak'
  | 'undo'
  | 'complete'
  | 'completePerfect'
  | 'gameOver'

const SFX_KEY = 'chess-trainer-sfx'

const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

interface VoiceOpts {
  freq: number
  dur: number
  type?: OscillatorType
  vol?: number
  when?: number
  slideTo?: number
  attack?: number
  release?: number
}

interface NoiseOpts {
  dur: number
  vol?: number
  when?: number
  hp?: number
  lp?: number
}

class SoundEngine {
  private ctx: AudioContext | null = null
  private sfxBus: GainNode | null = null

  private sfxOn = true

  constructor() {
    try {
      this.sfxOn = localStorage.getItem(SFX_KEY) !== 'off'
    } catch { /* localStorage unavailable */ }
  }

  isSfxOn() { return this.sfxOn }

  setSfxOn(on: boolean) {
    this.sfxOn = on
    try { localStorage.setItem(SFX_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  }

  /** Call from any user-gesture handler to unlock/resume the AudioContext. */
  unlock() {
    this.ensureContext()
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor = window.AudioContext
      if (!Ctor) return null
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)

      const sfxBus = ctx.createGain()
      sfxBus.gain.value = 0.9
      sfxBus.connect(master)

      this.ctx = ctx
      this.sfxBus = sfxBus
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  // ── low-level synth voices ───────────────────────────────────────────────

  private tone(dest: AudioNode, opts: VoiceOpts) {
    const ctx = this.ctx
    if (!ctx) return
    const t = opts.when ?? ctx.currentTime
    const attack = opts.attack ?? 0.005
    const release = opts.release ?? 0.06
    const vol = opts.vol ?? 0.3

    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'square'
    osc.frequency.setValueAtTime(Math.max(1, opts.freq), t)
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t + opts.dur)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur + release)

    osc.connect(gain)
    gain.connect(dest)
    osc.start(t)
    osc.stop(t + opts.dur + release + 0.02)
  }

  private noiseBurst(dest: AudioNode, opts: NoiseOpts) {
    const ctx = this.ctx
    if (!ctx) return
    const t = opts.when ?? ctx.currentTime
    const vol = opts.vol ?? 0.2
    const n = Math.max(1, Math.floor(ctx.sampleRate * opts.dur))
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf
    let node: AudioNode = src
    if (opts.hp) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = opts.hp
      node.connect(f)
      node = f
    }
    if (opts.lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = opts.lp
      node.connect(f)
      node = f
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    node.connect(gain)
    gain.connect(dest)
    src.start(t)
    src.stop(t + opts.dur + 0.02)
  }

  // ── sound effects ────────────────────────────────────────────────────────

  play(name: SfxName) {
    if (!this.sfxOn) return
    const ctx = this.ensureContext()
    const bus = this.sfxBus
    if (!ctx || !bus) return
    const now = ctx.currentTime

    const arpeggio = (notes: number[], step: number, type: OscillatorType, vol: number) => {
      notes.forEach((midi, i) => {
        this.tone(bus, { freq: mtof(midi), dur: step * 0.9, type, vol, when: now + i * step })
      })
    }

    switch (name) {
      case 'move':
        this.tone(bus, { freq: mtof(72), dur: 0.05, vol: 0.16, type: 'square' })
        break
      case 'appMove':
        this.tone(bus, { freq: mtof(67), dur: 0.055, vol: 0.13, type: 'triangle' })
        break
      case 'correct':
        arpeggio([76, 79], 0.08, 'square', 0.26)
        break
      case 'best':
        arpeggio([72, 76, 79, 84], 0.06, 'square', 0.24)
        this.tone(bus, { freq: mtof(91), dur: 0.12, vol: 0.12, type: 'triangle', when: now + 0.26 })
        break
      case 'wrong':
        this.tone(bus, { freq: mtof(57), dur: 0.26, vol: 0.26, type: 'square', slideTo: mtof(45) })
        this.noiseBurst(bus, { dur: 0.1, vol: 0.12, hp: 800, when: now + 0.02 })
        break
      case 'tooWeak':
        this.tone(bus, { freq: mtof(53), dur: 0.2, vol: 0.2, type: 'sawtooth', slideTo: mtof(50) })
        break
      case 'undo':
        this.tone(bus, { freq: mtof(79), dur: 0.14, vol: 0.16, type: 'square', slideTo: mtof(55) })
        break
      case 'complete':
        arpeggio([72, 76, 79], 0.11, 'square', 0.24)
        break
      case 'completePerfect':
        arpeggio([72, 76, 79, 84, 88], 0.09, 'square', 0.24)
        arpeggio([79, 84, 88, 91], 0.09, 'triangle', 0.14)
        this.noiseBurst(bus, { dur: 0.3, vol: 0.06, hp: 4000, when: now + 0.45 })
        break
      case 'gameOver':
        arpeggio([72, 69, 65, 60], 0.14, 'square', 0.26)
        this.tone(bus, { freq: 55, dur: 0.4, vol: 0.24, type: 'sawtooth', slideTo: 28, when: now + 0.52 })
        this.noiseBurst(bus, { dur: 0.35, vol: 0.1, lp: 500, when: now + 0.52 })
        break
    }
  }
}

export const sound = new SoundEngine()
