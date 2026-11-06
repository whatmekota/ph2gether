/**
 * What the two apps say to each other, over the WebRTC data channel. Every
 * message is checked on the way in (parseMessage): the other side is another
 * person's app, so nothing it sends is trusted to be well formed.
 *
 * Nothing in here can reach the device directly. The worst a message can do
 * is play, pause or seek a video, or load a script for the video that is open,
 * and the receiving app's own speed ceiling and ranges still apply.
 */

/** Bumped when a change breaks talking to an older version. */
export const PROTOCOL = 1

export type Role = 'host' | 'guest'

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

export type Msg
  = | { t: 'hello', v: number, role: Role, app: string }
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

/** The message, if it is one we understand and well formed; null otherwise. */
export function parseMessage(x: unknown): Msg | null {
  if (!isObj(x) || typeof x.t !== 'string')
    return null
  switch (x.t) {
    case 'hello':
      return num(x.v, 0, 1e6) && (x.role === 'host' || x.role === 'guest') && str(x.app, LIMITS.app)
        ? { t: 'hello', v: x.v, role: x.role, app: x.app }
        : null
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
      return null
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
