/**
 * The arithmetic of staying in step, kept free of the app so it can be tested.
 *
 * The host leads. Each side's clock is its own performance.now(). The guest
 * pings the host; the host answers with its own clock reading. From the
 * round trip the guest works out how far the host's clock is from its own
 * (assuming the trip took as long each way, NTP style), keeping the reading
 * from the quickest recent round trip, which is the least disturbed by queues.
 *
 * With that offset, a heartbeat "at host time T the video was at P, playing
 * at rate R" says where the host's video is now: P + (now_on_host − T) · R.
 */

export const SYNC = {
  /** How often the host sends its state when nothing changes, ms. */
  heartbeatMs: 1000,
  /** How often each side looks at its own player, ms. */
  tickMs: 250,
  /** How often each side pings, ms (faster for the first few). */
  pingMs: 2000,
  /** Further apart than this while both play: seek, s. */
  seekOverS: 0.25,
  /** Further apart than this while both are paused: seek, s. */
  pausedOverS: 0.1,
  /** When the play state changes, line up if further apart than this, s. */
  edgeAlignS: 0.08,
  /** Nothing heard from the partner for this long: the connection is lost, ms. */
  staleMs: 4000,
  /** After a seek, leave it this long before judging the drift again, ms. */
  settleMs: 1500,
  /** A position that moved this much more (or less) than the clock says is a seek, s. */
  jumpS: 0.6,
  /** Don't extrapolate a heartbeat further than this, s. */
  maxAheadS: 5,
  /** Ping samples kept for the offset. */
  samples: 8,
}

export interface ClockSample {
  /** Round trip, ms. */
  rtt: number
  /** Host clock minus guest clock, ms. */
  offset: number
}

/**
 * One ping: the guest sent it at `sentLocal`, the host stamped `remoteAt` on
 * its reply, and it came back at `recvLocal` (all ms, each on its own clock).
 */
export function clockSample(sentLocal: number, remoteAt: number, recvLocal: number): ClockSample {
  const rtt = Math.max(0, recvLocal - sentLocal)
  return { rtt, offset: remoteAt - (sentLocal + recvLocal) / 2 }
}

/** Keeps the last few samples and trusts the one with the quickest round trip. */
export class ClockSync {
  private list: ClockSample[] = []
  constructor(private keep = SYNC.samples) {}

  add(s: ClockSample): void {
    this.list.push(s)
    if (this.list.length > this.keep)
      this.list.shift()
  }

  reset(): void {
    this.list = []
  }

  get ready(): boolean {
    return this.list.length > 0
  }

  private best(): ClockSample | null {
    let b: ClockSample | null = null
    for (const s of this.list) {
      if (!b || s.rtt < b.rtt)
        b = s
    }
    return b
  }

  /** Host clock minus local clock, ms (0 before any sample). */
  get offset(): number {
    return this.best()?.offset ?? 0
  }

  /** The latest round trip, ms, for showing; null before any. */
  get latestRtt(): number | null {
    return this.list.length ? this.list[this.list.length - 1].rtt : null
  }
}

export interface Beat {
  pos: number
  playing: boolean
  rate: number
  /** Host clock when pos was read, ms. */
  sent: number
}

/** Where the host's video is at local time `localNow`, seconds. */
export function hostPositionAt(beat: Beat, localNow: number, offsetMs: number, duration = Infinity): number {
  if (!beat.playing)
    return beat.pos
  const ahead = Math.min(SYNC.maxAheadS, Math.max(0, (localNow + offsetMs - beat.sent) / 1000))
  return Math.min(duration > 0 ? duration : Infinity, beat.pos + ahead * beat.rate)
}

export type Correction = { kind: 'none', drift: number } | { kind: 'seek', to: number, drift: number }

/**
 * What the guest should do about where it is. `drift` is guest − host,
 * seconds (positive: the guest is ahead). Only position: whether to play or
 * pause is decided by the host's changes, not here.
 */
export function correction(o: {
  guestPos: number
  guestPlaying: boolean
  hostPos: number
  hostPlaying: boolean
  /** ms since this side last seeked. */
  sinceSeekMs: number
}): Correction {
  const drift = o.guestPos - o.hostPos
  if (o.sinceSeekMs < SYNC.settleMs)
    return { kind: 'none', drift }
  // One plays and the other doesn't: that is about play/pause, not drift.
  if (o.guestPlaying !== o.hostPlaying)
    return { kind: 'none', drift }
  const limit = o.hostPlaying ? SYNC.seekOverS : SYNC.pausedOverS
  return Math.abs(drift) > limit ? { kind: 'seek', to: Math.max(0, o.hostPos), drift } : { kind: 'none', drift }
}

/**
 * Did the position jump (a seek) between two looks at the player? It should
 * have moved by the elapsed time times the rate while playing, and not at all
 * while paused.
 */
export function jumped(prev: { pos: number, at: number, playing: boolean }, now: { pos: number, at: number }, rate: number): boolean {
  const expected = prev.playing ? prev.pos + ((now.at - prev.at) / 1000) * rate : prev.pos
  return Math.abs(now.pos - expected) > SYNC.jumpS
}
