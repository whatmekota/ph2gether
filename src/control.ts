/**
 * Partner control: one partner lets the other drive parts of their own
 * session (edges, intensity, what plays, the stroke generator). The rules,
 * kept free of the app so they can be tested:
 *
 * - The device's owner decides. Either side may ask or offer, but nothing is
 *   granted until the owner says yes: their offer, or their Allow on an ask.
 * - Only in a verified room (both tapped "They match"). Without the emoji
 *   check, the person asking could be someone in the middle.
 * - The owner can take it back at any moment, and panic (theirs or the
 *   partner's), a dropped connection or leaving ends it at once.
 * - Each direction is its own state: both partners may control each other.
 *
 * Two machines per side: `ownerStep` for my session (do I let them?) and
 * `ctlStep` for theirs (do they let me?). Each returns the next state, what
 * to send, and whether control began or ended here.
 */

import type { Cmd, EndWhy, Msg, Power, StopWhy } from './protocol'
import { POWERS } from './protocol'

/** What a partner gets unless the owner ticks more. */
export const GENTLE: readonly Power[] = ['edge', 'intensity']

/** The powers `want` that may be given now (`allowed`), in the usual order. */
export function within(want: readonly Power[], allowed: readonly Power[]): Power[] {
  return POWERS.filter(p => want.includes(p) && allowed.includes(p))
}

/** Which power a command needs. */
export const POWER_OF: Record<Cmd['k'], Power> = {
  edge: 'edge',
  endEdge: 'edge',
  level: 'intensity',
  stroke: 'stroke',
  strokeStop: 'stroke',
  pause: 'playback',
  resume: 'playback',
  next: 'playback',
  pick: 'playback',
}

// ─── My session (I own the device) ────────────────────────────────────────

export type OwnerState
  = | { p: 'off' }
    /** They asked; waiting for my answer. */
    | { p: 'asked', powers: Power[] }
    /** I offered; waiting for them to take it. */
    | { p: 'offered', powers: Power[] }
    | { p: 'granted', id: string, powers: Power[] }

export type OwnerEvent
  // From the partner
  = | { e: 'ask', powers: Power[] }
    | { e: 'accept' }
    | { e: 'stop', why: StopWhy, id?: string }
  // From me
    | { e: 'offer', powers: Power[] }
    | { e: 'allow', powers: Power[] }
    | { e: 'refuse' }
    | { e: 'withdraw' }
    | { e: 'takeBack' }
  // Either
    | { e: 'panic' }
    /** The connection dropped, or the room closed: nothing can be sent. */
    | { e: 'lost' }
    /** Leaving the room or switching off: say so, then end. */
    | { e: 'off' }

export interface OwnerEnv {
  /** Both tapped "They match". */
  verified: boolean
  /** What may be granted right now (playback only while hosting). */
  allowed: readonly Power[]
  newId: () => string
}

export interface Step<S> {
  s: S
  send: Msg[]
  /** Control began (owner: remember the settings to come back to). */
  began?: boolean
  /** Control ended, and why (owner: ease back to their own settings). */
  ended?: EndWhy | 'lost'
  /** Something to tell the person here. */
  note?: string
}

const OFF = { p: 'off' } as const

export function ownerStep(s: OwnerState, ev: OwnerEvent, env: OwnerEnv): Step<OwnerState> {
  const stay = (note?: string): Step<OwnerState> => ({ s, send: [], note })
  const grant = (powers: Power[]): Step<OwnerState> => {
    const id = env.newId()
    return { s: { p: 'granted', id, powers }, send: [{ t: 'pcGrant', id, powers }], began: true }
  }
  switch (ev.e) {
    case 'ask': {
      if (!env.verified)
        return { s, send: [{ t: 'pcEnd', why: 'unverified' }] }
      if (s.p === 'off')
        return { s: { p: 'asked', powers: ev.powers }, send: [] }
      if (s.p === 'asked')
        return { s: { p: 'asked', powers: ev.powers }, send: [] }
      // I offered and they ask: both want it, and I already said yes.
      if (s.p === 'offered')
        return grant(s.powers)
      return stay()
    }
    case 'accept':
      if (s.p === 'offered' && env.verified) {
        const powers = within(s.powers, env.allowed)
        if (powers.length)
          return grant(powers)
        return { s: OFF, send: [{ t: 'pcEnd', why: 'withdrawn' }] }
      }
      return stay()
    case 'stop':
      if (s.p === 'asked' && (ev.why === 'cancel' || ev.why === 'panic' || ev.why === 'off'))
        return { s: OFF, send: [] }
      if (s.p === 'offered' && (ev.why === 'pass' || ev.why === 'panic' || ev.why === 'off'))
        return { s: OFF, send: [], note: ev.why === 'pass' ? 'Your partner said no thanks.' : undefined }
      if (s.p === 'granted' && (ev.id === undefined || ev.id === s.id))
        return { s: OFF, send: [{ t: 'pcEnd', id: s.id, why: 'given' }], ended: ev.why === 'panic' ? 'panic' : 'given' }
      return stay()
    case 'offer': {
      if (!env.verified)
        return stay('Compare the emojis first: control needs a verified room.')
      const powers = within(ev.powers, env.allowed)
      if (!powers.length || s.p === 'granted')
        return stay()
      // They asked already: offering is saying yes.
      if (s.p === 'asked')
        return grant(powers)
      return { s: { p: 'offered', powers }, send: [{ t: 'pcOffer', powers }] }
    }
    case 'allow': {
      if (s.p !== 'asked')
        return stay()
      if (!env.verified)
        return stay('Compare the emojis first: control needs a verified room.')
      const powers = within(ev.powers, env.allowed)
      return powers.length ? grant(powers) : stay()
    }
    case 'refuse':
      return s.p === 'asked' ? { s: OFF, send: [{ t: 'pcEnd', why: 'no' }] } : stay()
    case 'withdraw':
      return s.p === 'offered' ? { s: OFF, send: [{ t: 'pcEnd', why: 'withdrawn' }] } : stay()
    case 'takeBack':
      return s.p === 'granted' ? { s: OFF, send: [{ t: 'pcEnd', id: s.id, why: 'taken' }], ended: 'taken' } : stay()
    case 'panic':
      if (s.p === 'off')
        return stay()
      return { s: OFF, send: [{ t: 'pcEnd', ...(s.p === 'granted' ? { id: s.id } : {}), why: 'panic' }], ended: s.p === 'granted' ? 'panic' : undefined }
    case 'off':
      if (s.p === 'off')
        return stay()
      return { s: OFF, send: [{ t: 'pcEnd', ...(s.p === 'granted' ? { id: s.id } : {}), why: 'off' }], ended: s.p === 'granted' ? 'off' : undefined }
    case 'lost':
      return s.p === 'off' ? stay() : { s: OFF, send: [], ended: s.p === 'granted' ? 'lost' : undefined }
  }
}

/** Whether a command may be carried out; why not otherwise. */
export function cmdAllowed(s: OwnerState, id: string, c: Cmd, verified: boolean): 'ok' | 'power' | 'stale' {
  if (s.p !== 'granted' || s.id !== id)
    return 'stale'
  if (!verified || !s.powers.includes(POWER_OF[c.k]))
    return 'power'
  return 'ok'
}

// ─── Their session (I would control it) ───────────────────────────────────

export type CtlState
  = | { p: 'off' }
    /** I asked (or took their offer); waiting for them. */
    | { p: 'asking', powers: Power[] }
    /** They offered; waiting for my answer. */
    | { p: 'offered', powers: Power[] }
    | { p: 'granted', id: string, powers: Power[] }

export type CtlEvent
  // From the partner (the owner)
  = | { e: 'offer', powers: Power[] }
    | { e: 'grant', id: string, powers: Power[] }
    | { e: 'end', why: EndWhy, id?: string }
  // From me
    | { e: 'ask', powers: Power[] }
    | { e: 'accept' }
    | { e: 'pass' }
    | { e: 'cancel' }
    | { e: 'letGo' }
  // Either
    | { e: 'panic' }
    | { e: 'lost' }
    | { e: 'off' }

const END_NOTES: Partial<Record<EndWhy, string>> = {
  no: 'Your partner said no.',
  withdrawn: 'Your partner took the offer back.',
  taken: 'Your partner took control back.',
  panic: 'Panic: control ended.',
  off: 'Your partner\'s control ended.',
  unverified: 'Compare the emojis first: control needs a verified room.',
}

export function ctlStep(s: CtlState, ev: CtlEvent, env: { verified: boolean }): Step<CtlState> {
  const stay = (note?: string): Step<CtlState> => ({ s, send: [], note })
  switch (ev.e) {
    case 'offer':
      if (!env.verified)
        return stay()
      if (s.p === 'off' || s.p === 'offered')
        return { s: { p: 'offered', powers: ev.powers }, send: [] }
      // I asked and they offer: that's their yes; take it.
      if (s.p === 'asking')
        return { s: { p: 'asking', powers: ev.powers }, send: [{ t: 'pcAccept' }] }
      return stay()
    case 'grant':
      if (s.p === 'asking' || s.p === 'offered')
        return { s: { p: 'granted', id: ev.id, powers: ev.powers }, send: [], began: true }
      if (s.p === 'granted' && s.id === ev.id)
        return stay()
      // Not wanted (I cancelled while it was on its way): hand it straight back.
      return { s, send: [{ t: 'pcStop', id: ev.id, why: 'cancel' }] }
    case 'end':
      if (s.p === 'off')
        return stay()
      if (s.p === 'granted' && ev.id !== undefined && ev.id !== s.id)
        return stay()
      return { s: OFF, send: [], ended: s.p === 'granted' ? ev.why : undefined, note: ev.why === 'given' ? undefined : END_NOTES[ev.why] }
    case 'ask':
      if (!env.verified)
        return stay('Compare the emojis first: control needs a verified room.')
      if (s.p === 'off' || s.p === 'asking')
        return { s: { p: 'asking', powers: ev.powers }, send: [{ t: 'pcAsk', powers: ev.powers }] }
      if (s.p === 'offered')
        return { s: { p: 'asking', powers: s.powers }, send: [{ t: 'pcAccept' }] }
      return stay()
    case 'accept':
      return s.p === 'offered' ? { s: { p: 'asking', powers: s.powers }, send: [{ t: 'pcAccept' }] } : stay()
    case 'pass':
      return s.p === 'offered' ? { s: OFF, send: [{ t: 'pcStop', why: 'pass' }] } : stay()
    case 'cancel':
      return s.p === 'asking' ? { s: OFF, send: [{ t: 'pcStop', why: 'cancel' }] } : stay()
    case 'letGo':
      return s.p === 'granted' ? { s: OFF, send: [{ t: 'pcStop', id: s.id, why: 'letGo' }], ended: 'given' } : stay()
    case 'panic':
    case 'off': {
      if (s.p === 'off')
        return stay()
      const why = ev.e
      return { s: OFF, send: [{ t: 'pcStop', ...(s.p === 'granted' ? { id: s.id } : {}), why }], ended: s.p === 'granted' ? why : undefined }
    }
    case 'lost':
      return s.p === 'off' ? stay() : { s: OFF, send: [], ended: s.p === 'granted' ? 'lost' : undefined }
  }
}

// ─── Limits on commands ───────────────────────────────────────────────────

/** At most `burst` in any `windowMs`. */
export function createWindow(burst: number, windowMs: number) {
  const times: number[] = []
  return (now: number): boolean => {
    while (times.length && now - times[0] >= windowMs)
      times.shift()
    if (times.length >= burst)
      return false
    times.push(now)
    return true
  }
}

export const RATE = {
  /** Commands of any kind in a window. */
  burst: 20,
  windowMs: 2000,
  /** Edges (and ending them): one per this long. */
  edgeMs: 1500,
  /** Pause, resume, next, pick: one per this long. */
  playMs: 1000,
  /** Knob and stroke changes: the latest one, at most this often. */
  smoothMs: 250,
  /** The controller's sliders send at most this often while dragged. */
  sendMs: 150,
  /** Asks and offers taken from the partner in a window (more are ignored). */
  asks: 3,
  asksMs: 30_000,
}

/**
 * The owner's side of the rate limit. Discrete commands (edges, playback)
 * beyond their pace are refused; the knob and the strokes, which a slider
 * sends many of, are coalesced: the latest value wins, applied at most every
 * `smoothMs`. Everything counts toward the overall burst.
 */
export class CmdGate {
  private all = createWindow(RATE.burst, RATE.windowMs)
  private lastAt: Partial<Record<'edge' | 'play' | 'level' | 'stroke', number>> = {}
  private pending: { level?: Cmd, stroke?: Cmd } = {}

  /**
   * 'now': carry it out. 'later': kept, `due()` gives it when its turn comes
   * (a newer one replaces it). 'rate': refused.
   */
  take(c: Cmd, now: number): 'now' | 'later' | 'rate' {
    if (!this.all(now))
      return 'rate'
    const lane = laneOf(c)
    const gap = lane === 'edge' ? RATE.edgeMs : lane === 'play' ? RATE.playMs : RATE.smoothMs
    const last = this.lastAt[lane]
    const free = last === undefined || now - last >= gap
    if (lane === 'level' || lane === 'stroke') {
      // A stop goes at once, whatever the pace: it only ever calms things.
      if (free || c.k === 'strokeStop') {
        this.lastAt[lane] = now
        delete this.pending[lane]
        return 'now'
      }
      this.pending[lane] = c
      return 'later'
    }
    if (!free)
      return 'rate'
    this.lastAt[lane] = now
    return 'now'
  }

  /** Coalesced commands whose turn has come. */
  due(now: number): Cmd[] {
    const out: Cmd[] = []
    for (const lane of ['level', 'stroke'] as const) {
      const c = this.pending[lane]
      const last = this.lastAt[lane] ?? -Infinity
      if (c && now - last >= RATE.smoothMs) {
        out.push(c)
        this.lastAt[lane] = now
        delete this.pending[lane]
      }
    }
    return out
  }

  /** Forget anything waiting (control ended). */
  clear() {
    this.pending = {}
  }
}

function laneOf(c: Cmd): 'edge' | 'play' | 'level' | 'stroke' {
  switch (c.k) {
    case 'edge':
    case 'endEdge':
      return 'edge'
    case 'level':
      return 'level'
    case 'stroke':
    case 'strokeStop':
      return 'stroke'
    default:
      return 'play'
  }
}

/**
 * The controller's side: a slider being dragged sends at most every
 * `RATE.sendMs`, and its last value always goes out.
 */
export function createThrottle<T>(send: (v: T) => void, gapMs = RATE.sendMs, clock = () => performance.now()) {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { v: T } | null = null
  const flush = () => {
    timer = null
    if (pending) {
      last = clock()
      const { v } = pending
      pending = null
      send(v)
    }
  }
  return {
    push(v: T) {
      pending = { v }
      const wait = gapMs - (clock() - last)
      if (wait <= 0) {
        if (timer)
          clearTimeout(timer)
        flush()
      }
      else {
        timer ??= setTimeout(flush, wait)
      }
    },
    cancel() {
      if (timer)
        clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}

// ─── Coming back to the owner's own knob ──────────────────────────────────

/**
 * Tracks whose the intensity knob is while a partner holds control. It
 * remembers where the owner had it; each move the partner asks for is
 * expected to stay between where it was and where it was sent. A change
 * outside that is the owner's own hand (or another plugin's), and from then
 * on the knob is left where they put it.
 */
export class KnobWatch {
  /** The partner moved the knob at least once. */
  moved = false
  /** Someone else (the owner) moved it after that. */
  touched = false
  private lo: number
  private hi: number

  constructor(readonly before: number) {
    this.lo = before
    this.hi = before
  }

  /** A move toward `to` begins at `from`. */
  expect(from: number, to: number) {
    this.moved = true
    this.lo = Math.min(from, to)
    this.hi = Math.max(from, to)
  }

  /** The knob reads `v` now. */
  seen(v: number) {
    if (v < this.lo - 0.011 || v > this.hi + 0.011)
      this.touched = true
  }

  /**
   * Where to take the knob when control ends, or null to leave it. After a
   * panic only down: nothing turns itself up after the owner hit panic.
   */
  restoreTo(now: number, why: EndWhy | 'lost'): number | null {
    if (!this.moved || this.touched || Math.abs(now - this.before) < 0.01)
      return null
    if (why === 'panic' && this.before > now)
      return null
    return this.before
  }
}

/** A short random id for a grant. */
export function newGrantId(): string {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return `g${[...b].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

/** The powers in words, for both sides. */
export const POWER_NAMES: Record<Power, string> = {
  edge: 'Edges',
  intensity: 'Intensity',
  playback: 'What plays',
  stroke: 'Strokes',
}

export const POWER_HINTS: Record<Power, string> = {
  edge: 'Call an edge, or end one early',
  intensity: 'Move your intensity knob, slowly, up to your limit for plugins',
  playback: 'Pause, play, skip, or pick one of your scripted videos (they see the names)',
  stroke: 'Run your stroke generator, within your speed ceiling, while no script plays',
}

export function powersText(powers: readonly Power[]): string {
  return powers.map(p => POWER_NAMES[p]).join(', ')
}
