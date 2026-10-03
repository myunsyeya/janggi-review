// Synthesized sound effects (Web Audio), so no third-party sound files are shipped.

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'start' | 'brilliant'

let ctx: AudioContext | null = null
const audio = () => (ctx ??= new AudioContext())

const MUTE_KEY = 'janggi.muted'
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0')
  } catch {
    // not persisted
  }
}

// Browsers only start audio after a user gesture.
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', () => ctx?.state === 'suspended' && ctx.resume(), { capture: true })

let noise: AudioBuffer | null = null
function noiseBuffer(ac: AudioContext) {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noise
}

/** A wooden piece hitting the board: filtered noise "tick" plus a short low body. */
function knock(ac: AudioContext, at: number, pitch: number, level: number) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = pitch
  bp.Q.value = 1.4
  const g = ac.createGain()
  g.gain.setValueAtTime(level, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
  src.connect(bp).connect(g).connect(ac.destination)
  src.start(at)
  src.stop(at + 0.08)

  const body = ac.createOscillator()
  body.frequency.setValueAtTime(pitch / 9, at)
  body.frequency.exponentialRampToValueAtTime(pitch / 14, at + 0.08)
  const bg = ac.createGain()
  bg.gain.setValueAtTime(level * 0.9, at)
  bg.gain.exponentialRampToValueAtTime(0.001, at + 0.09)
  body.connect(bg).connect(ac.destination)
  body.start(at)
  body.stop(at + 0.1)
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, level: number, type: OscillatorType = 'sine') {
  const o = ac.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(level, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(ac.destination)
  o.start(at)
  o.stop(at + dur + 0.02)
}

export function playSound(kind: SoundKind) {
  if (muted) return
  const ac = audio()
  if (ac.state === "suspended") ac.resume()
  const t = ac.currentTime + 0.01
  switch (kind) {
    case "move":
      hit(ac, t, choice.move, "move")
      break
    case "capture":
      hit(ac, t, choice.capture, "capture")
      break
    case "check":
      hit(ac, t, choice.move, "move")
      tone(ac, t + 0.05, 988, 0.14, 0.18, 'triangle')
      tone(ac, t + 0.17, 784, 0.22, 0.18, 'triangle')
      break
    case 'start':
      tone(ac, t, 523, 0.25, 0.15)
      tone(ac, t + 0.1, 784, 0.35, 0.15)
      break
    case 'end':
      for (const [i, f] of [523, 659, 784, 1047].entries()) tone(ac, t + i * 0.09, f, 0.7, 0.12, 'triangle')
      break
    case 'brilliant':
      for (const [i, f] of [1047, 1319, 1568, 2093, 2637].entries()) {
        tone(ac, t + i * 0.06, f, 0.5, 0.09)
        tone(ac, t + i * 0.06, f * 1.005, 0.5, 0.05, 'triangle') // slight detune for shimmer
      }
      break
  }
}

/** Sound for a move from `before` to `after` (FENs), given whether it captured and whether the game ended. */
export function moveSound(o: { capture: boolean; check: boolean; over: boolean }): SoundKind {
  if (o.over) return 'end'
  if (o.check) return 'check'
  return o.capture ? 'capture' : 'move'
}

// --- recorded samples (Kenney "Casino Audio", CC0) for placing and capturing pieces ---------

// chosen by ear by the user
const choice = { move: "chips-collide-2", capture: "chips-stack-4" }

const samples = new Map<string, Promise<AudioBuffer | null>>()
function preload(name: string) {
  if (name === 'synth' || samples.has(name)) return samples.get(name)
  const p = fetch(`/sounds/${name}.wav`)
    .then((r) => r.arrayBuffer())
    .then((b) => audio().decodeAudioData(b))
    .catch(() => null)
  samples.set(name, p)
  return p
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => (preload(choice.move), preload(choice.capture)), { once: true })

/** Plays a sample (or the old synthesized knock for "synth" / while the sample is still loading). */
function hit(ac: AudioContext, at: number, name: string, kind: "move" | "capture") {
  const synth = () => (kind === "capture" ? (knock(ac, at, 1300, 1), knock(ac, at + 0.045, 1700, 0.7)) : knock(ac, at, 1900, 0.9))
  if (name === 'synth') return synth()
  preload(name)!.then((buf) => {
    if (!buf) return synth()
    const src = ac.createBufferSource()
    src.buffer = buf
    const g = ac.createGain()
    g.gain.value = 0.8
    src.connect(g).connect(ac.destination)
    src.start(Math.max(at, ac.currentTime))
  })
}

