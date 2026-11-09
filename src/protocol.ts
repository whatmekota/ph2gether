/**
 * What the two apps say to each other, over the WebRTC data channel. Every
 * message is checked on the way in (parseMessage): the other side is another
 * person's app, so nothing it sends is trusted to be well formed.
 *
 * Nothing in here can reach the device directly. Without partner control,
 * the worst a message can do is play, pause or seek a video. With it, and
 * only once the receiving person has granted it in a verified room, a
 * command can call an edge, move the intensity knob (ramped, under their own
 * limit for plugins) or run the stroke generator (under their own speed
 * ceiling) through playhound's plugin API, which applies those limits itself.
 * Their speed ceiling, ranges and panic stay theirs.
 */

/** Bumped when a change breaks talking to an older version. */
export const PROTOCOL = 1

/**
 * Partner control's own version, said in the hello as `pc`. Each side speaks
 * the lower of the two; 0 (an app from before partner control, whose hello
 * has no `pc`) means no control in that room, while the rest works as before.
 */
export const CONTROL_VERSION = 1

export type Role = 'host' | 'guest'

/**
 * What one partner may do to the other's session, as the owner granted it:
 * call and end edges, move the intensity knob (ramped, under the owner's
 * limit for plugins), pause, resume and pick what plays (owner hosting
 * only), drive the stroke generator (under the owner's speed ceiling).
 */
export type Power = 'edge' | 'intensity' | 'playback' | 'stroke'
export const POWERS: readonly Power[] = ['edge', 'intensity', 'playback', 'stroke']

/** A command from the partner in control. */
export type Cmd
  = | { k: 'edge' }
    | { k: 'endEdge' }
    /** The intensity knob, 0.1–1. */
    | { k: 'level', v: number }
    /** The stroke generator: strokes per minute and depth 0–1. */
    | { k: 'stroke', spm: number, depth: number }
    | { k: 'strokeStop' }
    | { k: 'pause' }
    | { k: 'resume' }
    | { k: 'next' }
    /** Play item `i` of the list the owner sent (pcLib). */
    | { k: 'pick', i: number }

export type EdgePhase = 'idle' | 'falling' | 'holding' | 'rebuilding'

/** The owner's session as the partner in control sees it. */
export interface Live {
  /** The intensity knob, 0.1–1. */
  level: number
  /** The most a plugin may set it to, the owner's own limit. */
  max: number
  /** What comes through: the knob times what an edge leaves, 0–1. */
  eff: number
  edge: EdgePhase
  /** Seconds left of the edge's hold and rebuild. */
  left: number
  panic: boolean
  title: string | null
  playing: boolean
  /** A script plays: it drives the device, and the stroke generator waits. */
  script: boolean
  spm: number
  depth: number
  /** The owner's speed ceiling, strokes per minute. */
  maxSpm: number
  /** The partner's strokes are running. */
  stroking: boolean
}

/** Why a grant (or an ask or offer) ended. */
export type EndWhy
  = | 'no' // the owner said no to an ask
    | 'withdrawn' // the owner took back an offer before it was taken
    | 'taken' // the owner took control back
    | 'panic' // panic, on either side
    | 'given' // the partner gave it back
    | 'off' // leaving the room, the plugin switched off
    | 'unverified' // the room isn't verified
const END_WHYS: readonly string[] = ['no', 'withdrawn', 'taken', 'panic', 'given', 'off', 'unverified']

/** Why the partner in control stopped (or didn't start). */
export type StopWhy = 'cancel' | 'pass' | 'letGo' | 'panic' | 'off'
const STOP_WHYS: readonly string[] = ['cancel', 'pass', 'letGo', 'panic', 'off']

/** Why a command wasn't carried out. */
export type NoWhy
  = | 'rate' // too many, too fast
    | 'power' // not granted
    | 'panic' // panic is on
    | 'script' // a script drives the device: the generator waits
    | 'owner' // the owner took the strokes back by hand
    | 'missing' // nothing to play
    | 'host' // the owner isn't hosting: the host picks what plays
const NO_WHYS: readonly string[] = ['rate', 'power', 'panic', 'script', 'owner', 'missing', 'host']

export interface VideoRef {
  /** library.fingerprint() of the file, or null if it isn't in the host's library. */
  fp: string | null
  title: string
  duration: number
}

/** The host's player, sent on every change and as the heartbeat. */
export interface StateMsg {
  t: 'state'
  video: VideoRef | null
  playing: boolean
  /** Seconds into the video when this was sent. */
  pos: number
  rate: number
  /** The host's performance.now() when it read `pos`, ms. */
  sent: number
  /** Counts the host's seeks: a change means "jump there now". */
  jumps: number
  /** The guest may play, pause and seek too. */
  control: boolean
}

export interface ScriptAxis {
  axis: string
  name: string
  /** Funscript actions flattened: at, pos, at, pos… (ms, 0–100). */
  actions: number[]
}

/** How the guest is doing, for the host's panel. */
export type GuestState = 'nothing' | 'loading' | 'matched' | 'missing' | 'hold' | 'panic'
const GUEST_STATES: readonly string[] = ['nothing', 'loading', 'matched', 'missing', 'hold', 'panic']

/** One of the owner's scripted videos, for the partner to pick from. */
export interface LibItem { title: string, dur: number }

export type Msg
  = | { t: 'hello', v: number, role: Role, app: string, pc?: number, name?: string }
    | { t: 'full' }
    | { t: 'bye' }
    | StateMsg
    | { t: 'ping', a: number }
    | { t: 'pong', a: number, b: number }
    | { t: 'verified' }
    | { t: 'panic' }
    | { t: 'ctl', a: 'play' | 'pause' | 'seek', pos?: number }
    | { t: 'getScript' }
    | { t: 'script', video: string, axes: ScriptAxis[] }
    | { t: 'noScript' }
    | { t: 'status', s: GuestState, drift: number }
    | { t: 'chat', text: string }
    // Partner control. Each type goes one way, so with both partners in
    // control of each other at once nothing is ambiguous.
    // The owner, to the partner who would control their session:
    | { t: 'pcOffer', powers: Power[] }
    | { t: 'pcGrant', id: string, powers: Power[] }
    | { t: 'pcEnd', id?: string, why: EndWhy }
    | { t: 'pcLive', id: string, s: Live }
    | { t: 'pcLib', id: string, items: LibItem[] }
    | { t: 'pcNo', id: string, why: NoWhy }
    // The partner who would control, to the owner:
    | { t: 'pcAsk', powers: Power[] }
    | { t: 'pcAccept' }
    | { t: 'pcStop', id?: string, why: StopWhy }
    | { t: 'pcCmd', id: string, c: Cmd }

export const LIMITS = {
  title: 300,
  fp: 200,
  app: 40,
  axes: 8,
  axisName: 40,
  /** Points per axis (each is two numbers). Long scripts run to tens of thousands. */
  points: 200_000,
  maxPos: 24 * 3600,
  /** Characters in one chat message (see chat.ts). */
  chat: 1000,
  /** A display name. */
  name: 32,
  /** A grant's id. */
  grantId: 24,
  /** Videos in a pcLib list. */
  lib: 200,
  /** Strokes per minute, past any ceiling a device reaches. */
  spm: 600,
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown, min = -Infinity, max = Infinity): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max
const bool = (x: unknown): x is boolean => typeof x === 'boolean'

function video(x: unknown): VideoRef | null | undefined {
  if (x === null)
    return null
  if (!isObj(x) || !(x.fp === null || (str(x.fp, LIMITS.fp) && x.fp)) || !str(x.title, LIMITS.title) || !num(x.duration, 0, LIMITS.maxPos))
    return undefined
  return { fp: x.fp as string | null, title: x.title, duration: x.duration }
}

function axes(x: unknown): ScriptAxis[] | null {
  if (!Array.isArray(x) || x.length > LIMITS.axes)
    return null
  const out: ScriptAxis[] = []
  for (const a of x) {
    if (!isObj(a) || !str(a.axis, 12) || !/^[a-z0-9]+$/i.test(a.axis) || !str(a.name, LIMITS.axisName) || !Array.isArray(a.actions))
      return null
    const acts = a.actions
    if (acts.length % 2 || acts.length > LIMITS.points * 2)
      return null
    for (let i = 0; i < acts.length; i += 2) {
      if (!num(acts[i], 0, LIMITS.maxPos * 1000) || !num(acts[i + 1], 0, 100))
        return null
    }
    out.push({ axis: a.axis, name: a.name, actions: acts as number[] })
  }
  return out
}

/** A list of powers: known ones, each once, at least one; in the usual order. Null otherwise. */
export function parsePowers(x: unknown): Power[] | null {
  if (!Array.isArray(x) || !x.length || x.length > POWERS.length)
    return null
  if (!x.every(p => typeof p === 'string' && (POWERS as readonly string[]).includes(p)) || new Set(x).size !== x.length)
    return null
  return POWERS.filter(p => x.includes(p))
}

const grantId = (x: unknown): x is string => typeof x === 'string' && /^[\w-]{4,24}$/.test(x)

/** A name as it may be shown: no control characters, trimmed, short. Null if nothing's left. */
export function cleanName(x: unknown): string | null {
  if (typeof x !== 'string')
    return null
  // eslint-disable-next-line no-control-regex
  const s = x.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '').trim()
  return s ? s.slice(0, LIMITS.name) : null
}

function parseCmd(x: unknown): Cmd | null {
  if (!isObj(x))
    return null
  switch (x.k) {
    case 'edge':
    case 'endEdge':
    case 'strokeStop':
    case 'pause':
    case 'resume':
    case 'next':
      return { k: x.k }
    case 'level':
      return num(x.v, 0, 1) ? { k: 'level', v: x.v } : null
    case 'stroke':
      return num(x.spm, 0, LIMITS.spm) && num(x.depth, 0, 1) ? { k: 'stroke', spm: x.spm, depth: x.depth } : null
    case 'pick':
      return num(x.i, 0, LIMITS.lib - 1) && Number.isInteger(x.i) ? { k: 'pick', i: x.i } : null
    default:
      return null
  }
}

const EDGE_PHASES: readonly string[] = ['idle', 'falling', 'holding', 'rebuilding']

function parseLive(x: unknown): Live | null {
  if (!isObj(x))
    return null
  const title = x.title === null ? null : str(x.title, LIMITS.title) ? x.title : undefined
  if (title === undefined
    || !num(x.level, 0, 1) || !num(x.max, 0, 1) || !num(x.eff, 0, 1)
    || typeof x.edge !== 'string' || !EDGE_PHASES.includes(x.edge) || !num(x.left, 0, 3600)
    || !bool(x.panic) || !bool(x.playing) || !bool(x.script) || !bool(x.stroking)
    || !num(x.spm, 0, LIMITS.spm) || !num(x.depth, 0, 1) || !num(x.maxSpm, 0, LIMITS.spm)) {
    return null
  }
  return {
    level: x.level,
    max: x.max,
    eff: x.eff,
    edge: x.edge as EdgePhase,
    left: x.left,
    panic: x.panic,
    title,
    playing: x.playing,
    script: x.script,
    spm: x.spm,
    depth: x.depth,
    maxSpm: x.maxSpm,
    stroking: x.stroking,
  }
}

function parseLib(x: unknown): LibItem[] | null {
  if (!Array.isArray(x) || x.length > LIMITS.lib)
    return null
  const out: LibItem[] = []
  for (const it of x) {
    if (!isObj(it) || !str(it.title, LIMITS.title) || !it.title || !num(it.dur, 0, LIMITS.maxPos))
      return null
    out.push({ title: it.title, dur: it.dur })
  }
  return out
}

/** Partner-control messages; null if `x` isn't a good one. */
function parseControl(x: Obj): Msg | null {
  switch (x.t) {
    case 'pcOffer':
    case 'pcAsk': {
      const p = parsePowers(x.powers)
      return p ? { t: x.t, powers: p } : null
    }
    case 'pcGrant': {
      const p = parsePowers(x.powers)
      return p && grantId(x.id) ? { t: 'pcGrant', id: x.id, powers: p } : null
    }
    case 'pcEnd':
      if (typeof x.why !== 'string' || !END_WHYS.includes(x.why) || (x.id !== undefined && !grantId(x.id)))
        return null
      return x.id === undefined ? { t: 'pcEnd', why: x.why as EndWhy } : { t: 'pcEnd', id: x.id, why: x.why as EndWhy }
    case 'pcStop':
      if (typeof x.why !== 'string' || !STOP_WHYS.includes(x.why) || (x.id !== undefined && !grantId(x.id)))
        return null
      return x.id === undefined ? { t: 'pcStop', why: x.why as StopWhy } : { t: 'pcStop', id: x.id, why: x.why as StopWhy }
    case 'pcAccept':
      return { t: 'pcAccept' }
    case 'pcLive': {
      const s = parseLive(x.s)
      return s && grantId(x.id) ? { t: 'pcLive', id: x.id, s } : null
    }
    case 'pcLib': {
      const items = parseLib(x.items)
      return items && grantId(x.id) ? { t: 'pcLib', id: x.id, items } : null
    }
    case 'pcNo':
      return grantId(x.id) && typeof x.why === 'string' && NO_WHYS.includes(x.why) ? { t: 'pcNo', id: x.id, why: x.why as NoWhy } : null
    case 'pcCmd': {
      const c = parseCmd(x.c)
      return c && grantId(x.id) ? { t: 'pcCmd', id: x.id, c } : null
    }
    default:
      return null
  }
}

/** The message, if it is one we understand and well formed; null otherwise. */
export function parseMessage(x: unknown): Msg | null {
  if (!isObj(x) || typeof x.t !== 'string')
    return null
  switch (x.t) {
    case 'hello': {
      if (!num(x.v, 0, 1e6) || (x.role !== 'host' && x.role !== 'guest') || !str(x.app, LIMITS.app))
        return null
      const m: Extract<Msg, { t: 'hello' }> = { t: 'hello', v: x.v, role: x.role, app: x.app }
      // Newer fields: one that isn't right is left out (an older app has neither).
      if (num(x.pc, 0, 1e6) && Number.isInteger(x.pc))
        m.pc = x.pc
      const name = cleanName(x.name)
      if (name)
        m.name = name
      return m
    }
    case 'full':
    case 'bye':
    case 'verified':
    case 'panic':
    case 'getScript':
    case 'noScript':
      return { t: x.t }
    case 'state': {
      const v = video(x.video)
      if (v === undefined || !bool(x.playing) || !num(x.pos, 0, LIMITS.maxPos) || !num(x.rate, 0.1, 10) || !num(x.sent) || !num(x.jumps, 0) || !bool(x.control))
        return null
      return { t: 'state', video: v, playing: x.playing, pos: x.pos, rate: x.rate, sent: x.sent, jumps: x.jumps, control: x.control }
    }
    case 'ping':
      return num(x.a) ? { t: 'ping', a: x.a } : null
    case 'pong':
      return num(x.a) && num(x.b) ? { t: 'pong', a: x.a, b: x.b } : null
    case 'ctl':
      if (x.a === 'play' || x.a === 'pause')
        return { t: 'ctl', a: x.a }
      return x.a === 'seek' && num(x.pos, 0, LIMITS.maxPos) ? { t: 'ctl', a: 'seek', pos: x.pos } : null
    case 'chat':
      return str(x.text, LIMITS.chat) && x.text.trim() ? { t: 'chat', text: x.text } : null
    case 'status':
      return typeof x.s === 'string' && GUEST_STATES.includes(x.s) && num(x.drift, -LIMITS.maxPos, LIMITS.maxPos)
        ? { t: 'status', s: x.s as GuestState, drift: x.drift }
        : null
    case 'script': {
      const ax = axes(x.axes)
      return ax && str(x.video, LIMITS.title) ? { t: 'script', video: x.video, axes: ax } : null
    }
    default:
      return x.t.startsWith('pc') ? parseControl(x) : null
  }
}

/** Funscript actions to the flat form and back. */
export function flatten(actions: { at: number, pos: number }[]): number[] {
  const out: number[] = []
  for (const a of actions)
    out.push(Math.round(a.at), Math.round(a.pos * 10) / 10)
  return out
}

export function unflatten(flat: number[]): { at: number, pos: number }[] {
  const out: { at: number, pos: number }[] = []
  for (let i = 0; i + 1 < flat.length; i += 2)
    out.push({ at: flat[i], pos: flat[i + 1] })
  return out
}
