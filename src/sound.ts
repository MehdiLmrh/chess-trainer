// Retro 16/32-bit style audio: chiptune SFX + a looping soundtrack.
// Everything is synthesized with the Web Audio API — no asset files, no
// network fetch. A single lazily-created AudioContext is shared by both.

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
const MUSIC_KEY = 'chess-trainer-music'

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

// One bar per chord of a 4-bar i–VI–III–VII progression (A minor).
const CHORDS = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [52, 55, 60] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
]

// Lead melody, one note per 8th note, 8 per bar × 4 bars. 0 = rest.
const LEAD = [
  72, 0, 76, 0, 74, 72, 0, 69,
  72, 0, 74, 0, 76, 0, 0, 0,
  76, 0, 79, 0, 76, 74, 0, 72,
  74, 0, 71, 0, 74, 0, 62, 0,
]

const STEPS_PER_BAR = 16
const BARS = 4
const TOTAL_STEPS = STEPS_PER_BAR * BARS

class SoundEngine {
  private ctx: AudioContext | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null

  private musicTimer: number | null = null
  private musicStep = 0
  private nextStepTime = 0

  private sfxOn = true
  private musicOn = false

  constructor() {
    try {
      this.sfxOn = localStorage.getItem(SFX_KEY) !== 'off'
      this.musicOn = localStorage.getItem(MUSIC_KEY) === 'on'
    } catch { /* localStorage unavailable */ }
  }

  isSfxOn() { return this.sfxOn }
  isMusicOn() { return this.musicOn }

  setSfxOn(on: boolean) {
    this.sfxOn = on
    try { localStorage.setItem(SFX_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  }

  setMusicOn(on: boolean) {
    this.musicOn = on
    try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
    if (on) this.startMusic()
    else this.stopMusic()
  }

  /** Call from any user-gesture handler to unlock/resume the AudioContext. */
  unlock() {
    const ctx = this.ensureContext()
    if (ctx && this.musicOn && this.musicTimer === null) this.startMusic()
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

      const musicBus = ctx.createGain()
      musicBus.gain.value = 0.0001
      musicBus.connect(master)

      this.ctx = ctx
      this.sfxBus = sfxBus
      this.musicBus = musicBus
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

  // ── looping soundtrack ───────────────────────────────────────────────────

  private startMusic() {
    const ctx = this.ensureContext()
    if (!ctx || !this.musicBus || this.musicTimer !== null) return
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime)
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, ctx.currentTime)
    this.musicBus.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.8)

    this.musicStep = 0
    this.nextStepTime = ctx.currentTime + 0.1
    this.musicTimer = window.setInterval(() => this.scheduler(), 25)
  }

  private stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
    const ctx = this.ctx
    if (ctx && this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(ctx.currentTime)
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, ctx.currentTime)
      this.musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    }
  }

  private scheduler() {
    const ctx = this.ctx
    if (!ctx) return
    const bpm = 132
    const stepDur = 60 / bpm / 4 // one 16th note
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.musicStep % TOTAL_STEPS, this.nextStepTime, stepDur)
      this.nextStepTime += stepDur
      this.musicStep++
    }
  }

  private scheduleStep(step: number, t: number, stepDur: number) {
    const bus = this.musicBus
    if (!bus) return
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS
    const inBar = step % STEPS_PER_BAR
    const chord = CHORDS[bar]

    // Bass: root on the main beats, an octave bounce on the offbeats.
    if (inBar === 0 || inBar === 8) {
      this.tone(bus, { freq: mtof(chord.root), dur: stepDur * 1.8, vol: 0.22, type: 'triangle', when: t })
    } else if (inBar === 3 || inBar === 11) {
      this.tone(bus, { freq: mtof(chord.root + 12), dur: stepDur * 0.9, vol: 0.16, type: 'triangle', when: t })
    }

    // Arpeggio: quiet broken chord, one tone per 16th.
    const tone = chord.tones[inBar % chord.tones.length]
    this.tone(bus, { freq: mtof(tone), dur: stepDur * 0.7, vol: 0.05, type: 'square', when: t })

    // Lead melody: one note per 8th note.
    if (inBar % 2 === 0) {
      const midi = LEAD[(step / 2) % LEAD.length]
      if (midi > 0) {
        this.tone(bus, { freq: mtof(midi), dur: stepDur * 1.7, vol: 0.14, type: 'square', when: t })
      }
    }

    // Drums.
    if (inBar === 0 || inBar === 6 || inBar === 8) {
      this.tone(bus, { freq: 110, dur: 0.09, vol: 0.3, type: 'sine', slideTo: 42, when: t })
      this.noiseBurst(bus, { dur: 0.05, vol: 0.12, lp: 300, when: t })
    }
    if (inBar === 4 || inBar === 12) {
      this.noiseBurst(bus, { dur: 0.1, vol: 0.16, hp: 1200, lp: 8000, when: t })
    }
    if (inBar % 2 === 0) {
      this.noiseBurst(bus, { dur: 0.025, vol: 0.05, hp: 7000, when: t })
    }
  }
}

export const sound = new SoundEngine()
