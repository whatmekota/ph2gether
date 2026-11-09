import type { ChatLine } from './chat'
import type { CtlEvent, CtlState, OwnerEvent, OwnerState, Step } from './control'
import type { Link } from './net'
import type { Cmd, EndWhy, GuestState, LibItem, Live, Msg, NoWhy, Power, Role, StateMsg, VideoRef } from './protocol'
import type { RoomCode, Strategy } from './room'
import type { MotionControl, PluginContext } from './types'
import { CHAT_KEEP, cleanChat, createRateLimit } from './chat'
import { CmdGate, cmdAllowed, createWindow, ctlStep, KnobWatch, newGrantId, ownerStep, powersText, RATE } from './control'
import { sasEmojis, sdpFingerprint } from './emoji'
import { openLink } from './net'
import { cleanName, CONTROL_VERSION, POWERS, PROTOCOL } from './protocol'
import { deriveRoom, makeCode, parseCode, STRATEGIES } from './room'
import { ClockSync, clockSample, correction, hostPositionAt, jumped, SYNC } from './sync'

declare const __PH2_VERSION__: string
const VERSION = typeof __PH2_VERSION__ === 'string' ? __PH2_VERSION__ : 'dev'

export type Phase = 'idle' | 'starting' | 'waiting' | 'connected' | 'lost'

/** How the guest is following the host's video. */
export type Follow
  = | 'nothing' // the host has nothing on
    | 'loading' // putting on the same file
    | 'matched' // same file, in step
    | 'missing' // the guest doesn't have it

/** What the guest tells the host about itself, for the host's panel. */
export type GuestStatus = GuestState

export interface Notice { tone: 'info' | 'warn' | 'error', text: string }

export interface View {
  phase: Phase
  role: Role | null
  code: string | null
  strategy: Strategy | null
  /** Something went wrong or needs saying; stays until it's replaced or the room changes. */
  notice: Notice | null
  rttMs: number | null
  emojis: string[] | null
  verifiedHere: boolean
  verifiedThere: boolean
  /** The host lets the guest play, pause and seek. */
  control: boolean
  /** What the host has on (both sides know it). */
  video: VideoRef | null
  hostPlaying: boolean
  /** Guest: how it follows. Host: what the guest last said. */
  follow: Follow
  /** Guest: paused or played by its own hand while the host goes on. */
  hold: boolean
  guestStatus: GuestStatus | null
  /** Guest − host, seconds, as last measured. */
  driftS: number | null
  panicked: boolean
  /** Partner control: the version both apps speak; 0 when the partner's app doesn't have it. */
  pc: number
  /** What the partner calls themselves, if they said. */
  partnerName: string | null
  /** My session: do I let them? */
  mine: OwnerState
  /** Theirs: do they let me? */
  theirs: CtlState
  /** Their session as they last sent it, while I control it. */
  their: Live | null
  /** Their scripted videos, while I may pick what plays. */
  lib: LibItem[] | null
  /** The last command of mine they didn't carry out, and when. */
  refused: { why: NoWhy, at: number } | null
}

/** A refused command, in words. */
export const NO_TEXT: Record<NoWhy, string> = {
  rate: 'Too fast: slow down a little.',
  power: 'They didn\'t give you that.',
  panic: 'Panic is on at their end.',
  script: 'A script is playing at their end: strokes wait until it stops.',
  owner: 'They took the strokes back by hand.',
  missing: 'That video isn\'t there any more.',
  host: 'Only the host picks what plays.',
}

const STRATEGY_NAMES: Record<Strategy, string> = { nostr: 'Nostr relays', torrent: 'BitTorrent trackers', mqtt: 'MQTT brokers' }
export const strategyName = (s: Strategy) => STRATEGY_NAMES[s]

const now = () => performance.now()

/**
 * Together mode: one room, one partner. The host leads; the guest follows the
 * host's video, play state, position and speed. Safety stays local: nothing
 * the partner sends touches the device, the speed ceiling or the ranges.
 */
export class Together {
  private link: Link | null = null
  /** The chat with the partner, this room. */
  chat: ChatLine[] = []
  /** Open copies of the panel; a message that arrives with none gets a toast. */
  panelsOpen = 0
  private chatLimit = createRateLimit()
  private room: RoomCode | null = null
  private partner: string | null = null
  private partnerSaidBye = false
  private updateFns = new Set<() => void>()
  private timers: ReturnType<typeof setInterval>[] = []
  private offs: (() => void)[] = []
  private cert: RTCCertificate | undefined
  private startedAt = 0
  private connectedAt = 0
  private relaysDownSince = 0
  private iceFailedAt = 0
  private generation = 0

  // Verification: the emojis of the pair verified before, this session.
  private sasKey: string | null = null
  private verifiedKey: { here: string | null, there: string | null } = { here: null, there: null }

  // Clock and latency.
  private clock = new ClockSync()
  private lastPingAt = 0
  private pingsSent = 0

  // Host side.
  private jumps = 0
  private look: { pos: number, at: number, playing: boolean, title: string | null, rate: number } | null = null
  private fpCache = new Map<string, string | null>()
  private lastBeatAt = 0
  private stateSeq = 0

  // Guest side.
  private host: StateMsg | null = null
  private hostAt = 0
  private targetKey: string | null | undefined = undefined
  private resync = true
  private ours = { playing: null as boolean | null, until: 0 }
  private lastSeekAt = -1e9
  private guestLook: { pos: number, at: number, playing: boolean } | null = null
  private rateBefore: number | null = null
  private lastStatusSent = ''
  private ourSeekTo = { to: 0, at: -1e9 }
  private lastHeardAt = 0
  private stale = false

  // Partner control: my session (owner side).
  private askLimit = createWindow(RATE.asks, RATE.asksMs)
  private gate = new CmdGate()
  private knob: KnobWatch | null = null
  private knobOff: (() => void) | null = null
  private strokes: MotionControl | null = null
  private libIds: string[] = []
  private liveSig = ''
  private liveAt = 0
  private noAt = new Map<string, number>()
  /** Where to take the knob back to once panic is lifted. */
  private knobAfterPanic: number | null = null
  private panicWatch: ReturnType<typeof setInterval> | null = null
  // Theirs (controller side).
  private offerLimit = createWindow(RATE.asks, RATE.asksMs)
  /** Grants that ended here with the connection down: said to the partner when it comes back. */
  private lostEnds: Msg[] = []

  view: View = this.blank()
  /** The panel should put the cursor in the code box (the Join command). */
  focusJoin = false

  constructor(private ctx: PluginContext) {}

  private blank(): View {
    return {
      phase: 'idle',
      role: null,
      code: null,
      strategy: null,
      notice: null,
      rttMs: null,
      emojis: null,
      verifiedHere: false,
      verifiedThere: false,
      control: !!this.ctx?.settings.get<boolean>('guestControl'),
      video: null,
      hostPlaying: false,
      follow: 'nothing',
      hold: false,
      guestStatus: null,
      driftS: null,
      panicked: false,
      pc: 0,
      partnerName: null,
      mine: { p: 'off' },
      theirs: { p: 'off' },
      their: null,
      lib: null,
      refused: null,
    }
  }

  /** Send a chat message. False when there's nobody to send it to, nothing to send, or it's too fast. */
  sendChat(text: string): boolean {
    const clean = cleanChat(text)
    if (!clean || this.view.phase !== 'connected' || !this.partner)
      return false
    if (!this.chatLimit(now())) {
      this.ctx.ui.toast('Slow down a little', { detail: 'Too many messages at once' })
      return false
    }
    this.send({ t: 'chat', text: clean })
    this.addChat({ from: 'me', text: clean, at: Date.now() })
    return true
  }

  private addChat(line: ChatLine) {
    this.chat.push(line)
    if (this.chat.length > CHAT_KEEP)
      this.chat.splice(0, this.chat.length - CHAT_KEEP)
    this.changed()
  }

  requestJoinFocus() {
    this.focusJoin = true
    this.changed()
  }

  onUpdate(fn: () => void): () => void {
    this.updateFns.add(fn)
    return () => this.updateFns.delete(fn)
  }

  private changed(patch: Partial<View> = {}) {
    Object.assign(this.view, patch)
    for (const fn of this.updateFns) {
      try {
        fn()
      }
      catch (err) {
        this.ctx.log('panel update failed', err)
      }
    }
  }

  private notice(text: string, tone: Notice['tone'] = 'info') {
    this.changed({ notice: { tone, text } })
  }

  // ─── Rooms ──────────────────────────────────────────────────────────────

  async invite(): Promise<void> {
    if (this.view.phase !== 'idle')
      return
    const s = this.ctx.settings.get<string>('strategy')
    const strategy = (STRATEGIES as string[]).includes(s) ? s as Strategy : 'nostr'
    await this.start(makeCode(strategy), 'host')
  }

  /** False (with a notice) if the code isn't one. */
  async join(input: string): Promise<boolean> {
    if (this.view.phase !== 'idle')
      return false
    const code = parseCode(input)
    if (!code) {
      this.notice('That doesn\'t look like a room code. It\'s three parts, like velvet-otter-4271.', 'error')
      return false
    }
    await this.start(code, 'guest')
    return true
  }

  private async start(code: RoomCode, role: Role) {
    const gen = ++this.generation
    this.resetRoom()
    this.room = code
    this.changed({ ...this.blank(), phase: 'starting', role, code: code.code, strategy: code.strategy })
    try {
      this.cert ??= await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' } as EcKeyGenParams)
    }
    catch (err) {
      this.ctx.log('no certificate of our own; WebRTC makes one per connection', err)
    }
    const { roomId, password } = await deriveRoom(code)
    if (gen !== this.generation)
      return
    try {
      this.link = openLink({
        strategy: code.strategy,
        roomId,
        password,
        certificate: this.cert,
        on: {
          peerJoin: id => this.onPeerJoin(id),
          peerLeave: id => this.onPeerLeave(id),
          message: (m, id) => this.onMessage(m, id),
          iceFailed: () => this.onIceFailed(),
          joinError: why => this.ctx.log('join error', why),
        },
      })
    }
    catch (err) {
      this.ctx.log('could not open the room', err)
      this.changed({ phase: 'idle', notice: { tone: 'error', text: 'Couldn\'t open the room. Try again, or another network in settings.' } })
      return
    }
    this.startedAt = now()
    this.changed({ phase: 'waiting' })
    this.timers.push(setInterval(() => this.tick(), SYNC.tickMs))
    this.timers.push(setInterval(() => this.watchdog(), 1000))
    this.offs.push(this.ctx.player.onChange(() => {
      if (this.view.role === 'host')
        void this.sendState()
    }))
  }

  async leave(): Promise<void> {
    if (this.view.phase === 'idle')
      return
    this.generation++
    // Control ends first, with a word to the partner, and the knob eases back.
    this.mineStep({ e: 'off' })
    this.theirsStep({ e: 'off' })
    this.lostEnds = []
    if (this.partner)
      this.link?.send({ t: 'bye' }, this.partner)
    const link = this.link
    this.resetRoom()
    this.changed(this.blank())
    // Let the goodbye go out before the channel closes.
    await new Promise(r => setTimeout(r, 150))
    await link?.leave().catch(() => {})
  }

  private resetRoom() {
    this.chat = []
    for (const t of this.timers)
      clearInterval(t)
    this.timers = []
    for (const off of this.offs)
      off()
    this.offs = []
    this.restoreRate()
    this.link = null
    this.room = null
    this.partner = null
    this.partnerSaidBye = false
    this.clock.reset()
    this.pingsSent = 0
    this.host = null
    this.targetKey = undefined
    this.resync = true
    this.look = null
    this.guestLook = null
    this.relaysDownSince = 0
    this.iceFailedAt = 0
    this.lastStatusSent = ''
    this.stale = false
  }

  dispose() {
    void this.leave()
    this.updateFns.clear()
    if (this.panicWatch)
      clearInterval(this.panicWatch)
    this.panicWatch = null
  }

  // ─── Peers ──────────────────────────────────────────────────────────────

  private send(m: Msg) {
    if (this.partner)
      this.link?.send(m, this.partner)
  }

  private hello(id: string) {
    const name = cleanName(this.ctx.settings.get<string>('name'))
    this.link?.send({ t: 'hello', v: PROTOCOL, role: this.view.role!, app: VERSION, pc: CONTROL_VERSION, ...(name ? { name } : {}) }, id)
  }

  /**
   * The guest speaks first; the host answers with its own hello (you're in)
   * or 'full' (someone else is). A guest is connected only once the host has
   * said hello, so a third person never thinks they got in.
   */
  private onPeerJoin(id: string) {
    if (this.view.role === 'guest')
      this.hello(id)
  }

  private onPeerLeave(id: string) {
    if (id !== this.partner)
      return
    // Before the partner is gone: control ends, here and now.
    this.controlLost()
    this.partner = null
    this.clock.reset()
    this.pingsSent = 0
    this.resync = true
    const left = this.partnerSaidBye
    this.partnerSaidBye = false
    if (this.view.role === 'guest') {
      // Without the host there's nothing to follow: stop, so the device stops too.
      this.ourPause()
      this.restoreRate()
    }
    this.changed({
      phase: left ? 'waiting' : 'lost',
      rttMs: null,
      guestStatus: null,
      driftS: null,
      notice: left
        ? { tone: 'info', text: this.view.role === 'host' ? 'Your partner left. The room stays open if they want to come back.' : 'Your partner closed the room.' }
        : { tone: 'warn', text: 'Lost the connection to your partner.' },
    })
    if (left && this.view.role === 'guest')
      void this.leaveKeepingNotice('Your partner closed the room.')
  }

  private async leaveKeepingNotice(text: string) {
    await this.leave()
    this.notice(text)
  }

  private onIceFailed() {
    if (this.partner)
      return
    this.iceFailedAt = now()
    this.notice('Couldn\'t connect directly — one of you may be behind a strict network (some office, school or mobile networks block it). Try another network, like a phone hotspot.', 'error')
  }

  private watchdog() {
    if (!this.link || this.partner)
      return
    const t = now()
    const { open, total } = this.link.relays()
    if (open === 0 && total > 0 && t - this.startedAt > 4000) {
      this.relaysDownSince ||= t
      if (t - this.relaysDownSince > 12_000 && this.view.notice?.tone !== 'error')
        this.notice(`Can't reach the ${strategyName(this.room!.strategy)}. Check your internet connection${this.view.role === 'host' ? ', or try another network in settings' : ''}.`, 'warn')
    }
    else {
      this.relaysDownSince = 0
    }
    if (this.view.role === 'guest' && this.view.phase === 'waiting' && !this.view.notice && t - this.startedAt > 45_000)
      this.notice('No sign of your partner yet. Check the code, and that they still have the room open.', 'warn')
  }

  private onMessage(m: Msg, id: string) {
    if (m.t === 'hello')
      return this.onHello(m, id)
    if (m.t === 'full') {
      if (this.view.role === 'guest' && (!this.partner || this.partner === id))
        void this.leaveKeepingNotice('That room already has two people in it.')
      return
    }
    if (id !== this.partner)
      return
    this.lastHeardAt = now()
    if (this.stale) {
      this.stale = false
      this.resync = true
      this.changed({ phase: 'connected', notice: null })
      this.sayLostEnds()
    }
    if (m.t.startsWith('pc')) {
      this.onControlMsg(m)
      return
    }
    switch (m.t) {
      case 'bye':
        this.partnerSaidBye = true
        break
      case 'ping':
        this.send({ t: 'pong', a: m.a, b: now() })
        break
      case 'pong': {
        const s = clockSample(m.a, m.b, now())
        this.clock.add(s)
        this.changed({ rttMs: Math.round(s.rtt) })
        break
      }
      case 'verified':
        this.changed({ verifiedThere: true })
        this.verifiedKey.there = this.sasKey
        break
      case 'panic':
        // Panic ends control both ways, whoever hit it.
        this.mineStep({ e: 'panic' })
        this.theirsStep({ e: 'panic' })
        this.ourPause()
        if (this.view.role === 'guest')
          this.view.hold = true
        this.notice('Your partner hit panic. Paused here too.', 'warn')
        this.ctx.ui.toast('Your partner hit panic', { detail: 'Paused here too.' })
        break
      case 'state':
        if (this.view.role === 'guest')
          void this.onHostState(m)
        break
      case 'ctl':
        if (this.view.role === 'host' && this.view.control)
          this.onControl(m)
        break
      case 'status':
        if (this.view.role === 'host')
          this.changed({ guestStatus: m.s, driftS: m.drift })
        break
      case 'chat':
        this.addChat({ from: 'them', text: m.text, at: Date.now() })
        // Nobody's looking at the panel: say it where it will be seen.
        if (!this.panelsOpen)
          this.ctx.ui.toast(m.text.length > 120 ? `${m.text.slice(0, 117)}…` : m.text, { detail: 'From your partner, in Together' })
        break
    }
  }

  private onHello(m: Extract<Msg, { t: 'hello' }>, id: string) {
    if (m.v !== PROTOCOL) {
      this.link?.send({ t: 'full' }, id)
      this.notice(`Your partner has a different version of ph2gether (${m.app}, you have ${VERSION}). Update both and try again.`, 'error')
      return
    }
    // Two hosts or two guests: not each other's partner. Only the host turns
    // a third person away, so a guest who meets another guest stays quiet.
    if (m.role === this.view.role)
      return
    if (this.partner && this.partner !== id) {
      if (this.view.role === 'host')
        this.link?.send({ t: 'full' }, id)
      return
    }
    if (this.partner === id)
      return
    if (this.view.role === 'host')
      this.hello(id)
    this.partner = id
    this.lastHeardAt = now()
    this.stale = false
    this.connectedAt = now()
    this.resync = true
    // Partner control: the lower of the two versions; none if theirs predates it.
    const pc = Math.min(CONTROL_VERSION, m.pc ?? 0)
    this.changed({ phase: 'connected', notice: null, pc, partnerName: m.name ?? null, mine: { p: 'off' }, theirs: { p: 'off' }, their: null, lib: null, refused: null })
    this.sayLostEnds()
    void this.checkEmojis()
    this.pingNow()
    if (this.view.role === 'host')
      void this.sendState()
  }

  // ─── Verification ───────────────────────────────────────────────────────

  private async checkEmojis(tries = 0): Promise<void> {
    const id = this.partner
    const pc = id ? this.link?.connection(id) : undefined
    const here = sdpFingerprint(pc?.localDescription?.sdp)
    const there = sdpFingerprint(pc?.remoteDescription?.sdp)
    if (!here || !there) {
      if (tries < 20 && this.partner === id)
        setTimeout(() => void this.checkEmojis(tries + 1), 300)
      return
    }
    const emojis = await sasEmojis(here, there)
    if (this.partner !== id || !emojis)
      return
    const key = [here, there].sort().join('|')
    this.sasKey = key
    this.changed({
      emojis,
      verifiedHere: this.verifiedKey.here === key,
      verifiedThere: this.verifiedKey.there === key,
    })
  }

  markVerified() {
    if (!this.partner || !this.view.emojis)
      return
    this.verifiedKey.here = this.sasKey
    this.send({ t: 'verified' })
    this.changed({ verifiedHere: true })
  }

  // ─── Clock ──────────────────────────────────────────────────────────────

  private pingNow() {
    if (!this.partner)
      return
    this.lastPingAt = now()
    this.pingsSent++
    this.send({ t: 'ping', a: this.lastPingAt })
  }

  private tick() {
    if (!this.partner)
      return
    const t = now()
    if (!this.stale && t - this.lastHeardAt > SYNC.staleMs) {
      this.stale = true
      this.controlLost()
      // Nothing to follow: stop, so the device stops too.
      if (this.view.role === 'guest')
        this.ourPause()
      this.changed({ phase: 'lost', rttMs: null, notice: { tone: 'warn', text: 'Lost the connection to your partner.' } })
    }
    // A few quick pings to start with, then every couple of seconds.
    if (t - this.lastPingAt > (this.pingsSent < 6 ? 250 : SYNC.pingMs))
      this.pingNow()
    const panicked = this.ctx.safety.panicked()
    if (panicked !== this.view.panicked)
      this.changed({ panicked })
    if (this.view.role === 'host')
      this.hostTick(t)
    else
      this.guestTick(t)
    if (this.view.mine.p === 'granted' && !this.stale) {
      for (const c of this.gate.due(t))
        void this.apply(c)
      this.sendLive(t)
    }
  }

  // ─── Host ───────────────────────────────────────────────────────────────

  setControl(on: boolean) {
    this.ctx.settings.set('guestControl', on)
    this.changed({ control: on })
    if (this.view.role === 'host')
      void this.sendState()
  }

  private hostTick(t: number) {
    const s = this.ctx.player.state()
    const pos = this.ctx.player.clock()
    const rate = s.rate ?? 1
    const prev = this.look
    this.look = { pos, at: t, playing: s.playing, title: s.title, rate }
    let changed = !prev || prev.title !== s.title || prev.playing !== s.playing || prev.rate !== rate
    if (prev && prev.title === s.title && jumped(prev, { pos, at: t }, rate)) {
      this.jumps++
      changed = true
    }
    if (changed || t - this.lastBeatAt >= SYNC.heartbeatMs)
      void this.sendState()
  }

  private async fingerprintOf(title: string): Promise<string | null> {
    if (!this.fpCache.has(title)) {
      let fp: string | null = null
      try {
        fp = await this.ctx.library.fingerprint(title)
      }
      catch {}
      this.fpCache.set(title, fp)
    }
    return this.fpCache.get(title) ?? null
  }

  private async sendState() {
    if (!this.partner || this.view.role !== 'host')
      return
    const seq = ++this.stateSeq
    const s = this.ctx.player.state()
    const fp = s.title ? await this.fingerprintOf(s.title) : null
    // A newer one went out while the fingerprint was worked out.
    if (seq !== this.stateSeq)
      return
    const video: VideoRef | null = s.title ? { fp, title: s.title.slice(0, 300), duration: Number.isFinite(s.duration) ? Math.max(0, s.duration) : 0 } : null
    const msg: StateMsg = {
      t: 'state',
      video,
      playing: s.playing,
      pos: Math.max(0, this.ctx.player.clock()),
      rate: s.rate ?? 1,
      sent: now(),
      jumps: this.jumps,
      control: this.view.control,
    }
    this.lastBeatAt = msg.sent
    this.send(msg)
    const v = this.view
    if (v.video?.title !== video?.title || v.video?.fp !== video?.fp || v.hostPlaying !== s.playing)
      this.changed({ video, hostPlaying: s.playing })
  }

  private onControl(m: Extract<Msg, { t: 'ctl' }>) {
    if (m.a === 'pause')
      this.ctx.playback.pause()
    else if (m.a === 'play' && !this.ctx.safety.panicked())
      this.ctx.playback.resume()
    else if (m.a === 'seek' && m.pos !== undefined)
      this.ctx.player.seek(m.pos)
  }

  // ─── Guest ──────────────────────────────────────────────────────────────

  private ourPause() {
    this.ours = { playing: false, until: now() + 2000 }
    this.ctx.playback.pause()
  }

  private ourResume() {
    if (this.ctx.safety.panicked())
      return
    this.ours = { playing: true, until: now() + 2000 }
    this.ctx.playback.resume()
  }

  private ourSeek(to: number) {
    this.lastSeekAt = now()
    this.ourSeekTo = { to, at: this.lastSeekAt }
    this.ctx.player.seek(to)
  }

  /** Is the guest where our last seek put it (give or take playing on since)? */
  private atOurSeek(pos: number, t: number, playing: boolean, rate: number): boolean {
    const { to, at } = this.ourSeekTo
    if (t - at > 3000)
      return false
    const expected = to + (playing ? ((t - at) / 1000) * rate : 0)
    return Math.abs(pos - expected) < SYNC.jumpS
  }

  private applyRate(rate: number) {
    if (!this.ctx.settings.get<boolean>('followRate'))
      return
    const mine = this.ctx.player.state().rate
    if (mine === rate)
      return
    this.rateBefore ??= mine ?? 1
    this.ctx.player.setRate(rate)
  }

  private restoreRate() {
    if (this.rateBefore !== null) {
      try {
        this.ctx.player.setRate(this.rateBefore)
      }
      catch {}
      this.rateBefore = null
    }
  }

  private hostNow(): number {
    if (!this.host)
      return 0
    return hostPositionAt(this.host, now(), this.clock.offset, this.host.video?.duration || Infinity)
  }

  private async onHostState(m: StateMsg) {
    const prev = this.resync ? null : this.host
    this.host = m
    this.hostAt = now()
    this.resync = false
    const key = m.video ? (m.video.fp ?? `title:${m.video.title}`) : null
    const v = this.view
    if (v.control !== m.control || v.video?.title !== m.video?.title || v.video?.fp !== m.video?.fp || v.hostPlaying !== m.playing)
      this.changed({ control: m.control, video: m.video, hostPlaying: m.playing })

    if (key !== this.targetKey) {
      this.targetKey = key
      await this.switchVideo(m.video)
      if (this.targetKey !== key)
        return
      this.applyAll()
      return
    }
    if (v.follow !== 'matched')
      return
    if (!prev || prev.playing !== m.playing) {
      this.changed({ hold: false })
      // Line up closely when the play state changes; the drift check is looser.
      const target = this.hostNow()
      if (Math.abs(this.ctx.player.clock() - target) > SYNC.edgeAlignS)
        this.ourSeek(target)
      if (m.playing)
        this.ourResume()
      else
        this.ourPause()
    }
    if (!prev || prev.jumps !== m.jumps)
      this.ourSeek(this.hostNow())
    if (!prev || prev.rate !== m.rate)
      this.applyRate(m.rate)
  }

  /** Play state, position and speed, all at once (a new video, a reconnect, catching up). */
  private applyAll() {
    const m = this.host
    if (!m || (this.view.follow !== 'matched'))
      return
    this.changed({ hold: false })
    this.applyRate(m.rate)
    this.ourSeek(this.hostNow())
    if (m.playing)
      this.ourResume()
    else
      this.ourPause()
  }

  catchUp() {
    this.applyAll()
  }

  private async switchVideo(video: VideoRef | null) {
    if (!video) {
      this.ourPause()
      this.changed({ follow: 'nothing' })
      return
    }
    const key = this.targetKey
    // Already on it?
    const s = this.ctx.player.state()
    if (video.fp && s.title && await this.fingerprintOf(s.title) === video.fp) {
      this.changed({ follow: 'matched', notice: null })
      return
    }
    if (!video.fp) {
      // What plays here has nothing to do with theirs: stop it, and the device with it.
      this.ourPause()
      this.changed({ follow: 'missing' })
      return
    }
    this.changed({ follow: 'loading' })
    let ok = false
    try {
      ok = await this.ctx.playback.playFingerprint(video.fp)
    }
    catch (err) {
      this.ctx.log('playFingerprint failed', err)
    }
    if (this.targetKey !== key)
      return
    if (!ok) {
      this.ourPause()
      this.changed({ follow: 'missing' })
      return
    }
    // Wait for it to load (its title shows and it has a length).
    for (let i = 0; i < 50; i++) {
      const st = this.ctx.player.state()
      if (st.title && st.duration > 0)
        break
      await new Promise(r => setTimeout(r, 100))
    }
    if (this.targetKey !== key)
      return
    this.changed({ follow: 'matched', notice: null })
  }

  private guestTick(t: number) {
    const m = this.host
    const s = this.ctx.player.state()
    const pos = this.ctx.player.clock()
    const prev = this.guestLook
    this.guestLook = { pos, at: t, playing: s.playing }
    const following = this.view.follow === 'matched'
    let drift: number | null = null

    if (m && following && prev) {
      // Did the person here play, pause or seek by hand?
      const ourPlay = t < this.ours.until && s.playing === this.ours.playing
      if (s.playing !== prev.playing && !ourPlay) {
        if (m.control)
          this.send({ t: 'ctl', a: s.playing ? 'play' : 'pause' })
        if (s.playing !== m.playing)
          this.changed({ hold: true })
      }
      if (jumped(prev, { pos, at: t }, s.rate ?? 1) && !this.atOurSeek(pos, t, s.playing, s.rate ?? 1) && m.control) {
        this.send({ t: 'ctl', a: 'seek', pos })
        // Don't pull it back before the host's answer arrives.
        this.lastSeekAt = t
      }
      const hostPos = this.hostNow()
      drift = pos - hostPos
      if (!this.view.hold && !this.ctx.safety.panicked()) {
        const c = correction({ guestPos: pos, guestPlaying: s.playing, hostPos, hostPlaying: m.playing, sinceSeekMs: t - this.lastSeekAt })
        if (c.kind === 'seek')
          this.ourSeek(c.to)
      }
    }
    if (drift !== null && (this.view.driftS === null || Math.abs(drift - this.view.driftS) > 0.02))
      this.changed({ driftS: drift })
    // Tell the host how it's going, when it changes (and now and then).
    const status: GuestStatus = this.ctx.safety.panicked() ? 'panic' : this.view.hold ? 'hold' : this.view.follow
    const sig = `${status}|${drift === null ? '' : Math.round(drift * 20)}`
    if (sig !== this.lastStatusSent) {
      this.send({ t: 'status', s: status, drift: drift ?? 0 })
      this.lastStatusSent = sig
    }
  }

  // ─── Safety ─────────────────────────────────────────────────────────────

  /**
   * Panic here: playhound already stopped this device and let go of the
   * stroke generator. Control ends both ways, at once; then the partner hears
   * of it and pauses too.
   */
  onLocalPanic() {
    this.mineStep({ e: 'panic' })
    this.theirsStep({ e: 'panic' })
    if (this.partner)
      this.send({ t: 'panic' })
    if (this.view.role === 'guest')
      this.changed({ hold: true, panicked: true })
  }

  // ─── Partner control ────────────────────────────────────────────────────

  /** Both tapped "They match" for this connection. */
  get verified(): boolean {
    return this.view.verifiedHere && this.view.verifiedThere
  }

  /** What I can hand over now: picking what plays only while I host (the host leads what plays). */
  grantable(): Power[] {
    return POWERS.filter(p => p !== 'playback' || this.view.role === 'host')
  }

  /** Control can be asked for or offered: connected, both apps have it, the room verified. */
  controlReady(): boolean {
    return this.view.phase === 'connected' && !this.stale && this.view.pc >= 1 && this.verified
  }

  get partnerLabel(): string {
    return this.view.partnerName ?? 'Your partner'
  }

  // My session.
  offerControl(powers: Power[]) {
    this.mineStep({ e: 'offer', powers })
  }

  allowControl(powers: Power[]) {
    this.mineStep({ e: 'allow', powers })
  }

  refuseControl() {
    this.mineStep({ e: 'refuse' })
  }

  withdrawOffer() {
    this.mineStep({ e: 'withdraw' })
  }

  /** One click, always: control of my session comes back to me. */
  takeBack() {
    this.mineStep({ e: 'takeBack' })
  }

  // Theirs.
  askControl(powers: Power[]) {
    this.theirsStep({ e: 'ask', powers })
  }

  acceptOffer() {
    this.theirsStep({ e: 'accept' })
  }

  passOffer() {
    this.theirsStep({ e: 'pass' })
  }

  cancelAsk() {
    this.theirsStep({ e: 'cancel' })
  }

  letGo() {
    this.theirsStep({ e: 'letGo' })
  }

  /** Send a command to the partner whose session I control. False if I don't. */
  command(c: Cmd): boolean {
    const s = this.view.theirs
    if (s.p !== 'granted' || !this.partner || this.stale)
      return false
    this.send({ t: 'pcCmd', id: s.id, c })
    return true
  }

  private applyStep<S>(r: Step<S>) {
    for (const m of r.send)
      this.send(m)
    if (r.note) {
      this.notice(r.note, 'info')
      if (!this.panelsOpen)
        this.ctx.ui.toast(r.note, { detail: 'Together' })
    }
  }

  private mineStep(ev: OwnerEvent) {
    const before = this.view.mine
    const r = ownerStep(before, ev, { verified: this.verified, allowed: this.grantable(), newId: newGrantId })
    if (r.s === before && !r.send.length && !r.note)
      return
    this.applyStep(r)
    this.changed({ mine: r.s })
    if (r.began && r.s.p === 'granted')
      this.beginOwned(r.s.powers)
    if (r.ended) {
      if (r.ended === 'lost' && before.p === 'granted')
        this.lostEnds.push({ t: 'pcEnd', id: before.id, why: 'off' })
      this.endOwned(r.ended)
    }
  }

  private theirsStep(ev: CtlEvent) {
    const before = this.view.theirs
    const r = ctlStep(before, ev, { verified: this.verified })
    if (r.s === before && !r.send.length && !r.note)
      return
    this.applyStep(r)
    const patch: Partial<View> = { theirs: r.s }
    if (r.began || r.s.p !== 'granted')
      Object.assign(patch, { their: null, lib: null, refused: null })
    this.changed(patch)
    if (r.ended === 'lost' && before.p === 'granted')
      this.lostEnds.push({ t: 'pcStop', id: before.id, why: 'off' })
    if (r.ended === 'lost')
      this.ctx.ui.toast('Lost your partner', { detail: 'Your control of their session ended.' })
  }

  /** The connection is gone (or went quiet): control ends both ways, without a word (none can go). */
  private controlLost() {
    this.mineStep({ e: 'lost' })
    this.theirsStep({ e: 'lost' })
  }

  /** The connection is back: say which grants ended while it was down, in case the partner didn't notice. */
  private sayLostEnds() {
    for (const m of this.lostEnds)
      this.send(m)
    this.lostEnds = []
  }

  private onControlMsg(m: Msg) {
    // Their app doesn't speak it (or says it doesn't): ignore it all.
    if (this.view.pc < 1)
      return
    const t = now()
    switch (m.t) {
      // About my session.
      case 'pcAsk':
        if (!this.askLimit(t))
          return
        this.mineStep({ e: 'ask', powers: m.powers })
        if (this.view.mine.p === 'asked' && !this.panelsOpen)
          this.ctx.ui.toast(`${this.partnerLabel} asks to control your session`, { detail: 'Open Together to answer.' })
        return
      case 'pcAccept':
        return this.mineStep({ e: 'accept' })
      case 'pcStop':
        return this.mineStep({ e: 'stop', why: m.why, id: m.id })
      case 'pcCmd':
        return this.onCmd(m.id, m.c)
      // About theirs.
      case 'pcOffer':
        if (!this.offerLimit(t))
          return
        this.theirsStep({ e: 'offer', powers: m.powers })
        if (this.view.theirs.p === 'offered' && !this.panelsOpen)
          this.ctx.ui.toast(`${this.partnerLabel} offers you control of their session`, { detail: 'Open Together to take it.' })
        return
      case 'pcGrant':
        this.theirsStep({ e: 'grant', id: m.id, powers: m.powers })
        if (this.view.theirs.p === 'granted' && !this.panelsOpen)
          this.ctx.ui.toast(`You have control of ${this.view.partnerName ?? 'your partner'}'s session`, { detail: powersText(m.powers) })
        return
      case 'pcEnd':
        return this.theirsStep({ e: 'end', why: m.why, id: m.id })
      case 'pcLive':
      case 'pcLib':
      case 'pcNo': {
        const s = this.view.theirs
        if (s.p !== 'granted' || s.id !== m.id)
          return
        if (m.t === 'pcLive')
          this.changed({ their: m.s })
        else if (m.t === 'pcLib')
          this.changed({ lib: m.items })
        else
          this.changed({ refused: { why: m.why, at: Date.now() } })
      }
    }
  }

  // ─── My session, while my partner holds control ───

  private beginOwned(powers: Power[]) {
    const intensity = this.ctx.session.intensity
    this.knob = new KnobWatch(intensity.get())
    this.knobOff?.()
    this.knobOff = intensity.onChange(v => this.knob?.seen(v))
    this.knobAfterPanic = null
    this.gate = new CmdGate()
    this.liveSig = ''
    this.liveAt = 0
    this.sendLive(now())
    if (powers.includes('playback'))
      void this.sendLib()
  }

  private endOwned(why: EndWhy | 'lost') {
    this.gate.clear()
    this.knobOff?.()
    this.knobOff = null
    // The generator goes back to the owner's settings, stopped.
    try {
      this.strokes?.release()
    }
    catch {}
    this.strokes = null
    this.libIds = []
    const intensity = this.ctx.session.intensity
    const to = this.knob?.restoreTo(intensity.get(), why) ?? null
    this.knob = null
    if (to !== null) {
      if (this.ctx.safety.panicked())
        this.restoreAfterPanic(to)
      else
        this.setKnob(to)
    }
    const name = this.partnerLabel
    if (why === 'lost')
      this.ctx.ui.toast('Lost your partner: you have control again', { detail: to === null ? 'Your settings stay as they are.' : 'Easing back to your own intensity.' })
    else if (why === 'given')
      this.ctx.ui.toast(`${name} gave you control back`)
    else if (why === 'panic')
      this.ctx.ui.toast('Panic: you have control again')
  }

  private setKnob(level: number) {
    try {
      this.ctx.session.intensity.set(level)
    }
    catch (err) {
      this.ctx.log('could not set the intensity', err)
    }
  }

  /** While panic is on, playhound won't move the knob (not even down): wait, then lower it. */
  private restoreAfterPanic(level: number) {
    this.knobAfterPanic = level
    this.panicWatch ??= setInterval(() => {
      if (this.ctx.safety.panicked())
        return
      const to = this.knobAfterPanic
      this.knobAfterPanic = null
      if (this.panicWatch)
        clearInterval(this.panicWatch)
      this.panicWatch = null
      // Only ever down after a panic, and only if nobody turned it since.
      if (to !== null && to < this.ctx.session.intensity.get() - 0.005)
        this.setKnob(to)
    }, 400)
  }

  private refuse(id: string, why: NoWhy) {
    // One of each a second at most: a flood of commands isn't answered with a flood.
    const t = now()
    if (t - (this.noAt.get(why) ?? -1e9) < 1000)
      return
    this.noAt.set(why, t)
    this.send({ t: 'pcNo', id, why })
  }

  private onCmd(id: string, c: Cmd) {
    const s = this.view.mine
    const ok = cmdAllowed(s, id, c, this.verified)
    if (ok === 'stale') {
      // An old grant (it ended while the connection was down): say it's over.
      if (s.p !== 'granted' && now() - (this.noAt.get('stale') ?? -1e9) > 1000) {
        this.noAt.set('stale', now())
        this.send({ t: 'pcEnd', id, why: 'off' })
      }
      return
    }
    if (ok === 'power')
      return this.refuse(id, 'power')
    if (this.ctx.safety.panicked())
      return this.refuse(id, 'panic')
    const when = this.gate.take(c, now())
    if (when === 'rate')
      return this.refuse(id, 'rate')
    if (when === 'now')
      void this.apply(c)
  }

  /** Carry out a command that passed the checks and the rate limit. */
  private async apply(c: Cmd) {
    const s = this.view.mine
    if (s.p !== 'granted' || this.ctx.safety.panicked())
      return
    const id = s.id
    const { session, playback } = this.ctx
    switch (c.k) {
      case 'edge':
        session.edge()
        break
      case 'endEdge':
        session.endEdge()
        break
      case 'level': {
        const from = session.intensity.get()
        // Expected before the move starts: its first step may be heard at once.
        this.knob?.expect(from, Math.max(0.1, Math.min(session.intensity.max(), c.v)))
        const to = session.intensity.set(c.v)
        this.knob?.expect(from, to)
        break
      }
      case 'stroke': {
        const st = this.ctx.player.state()
        if (st.playing && st.hasScript) {
          this.refuse(id, 'script')
          break
        }
        if (this.strokes && !this.strokes.active) {
          // The owner picked another motion source by hand: theirs now.
          this.refuse(id, 'owner')
          break
        }
        this.strokes ??= this.ctx.motion.take()
        if (!this.strokes) {
          this.refuse(id, 'panic')
          break
        }
        if (c.spm <= 0)
          this.strokes.hold()
        else
          this.strokes.set({ spm: c.spm, depth: c.depth })
        break
      }
      case 'strokeStop':
        if (this.strokes?.active)
          this.strokes.hold()
        break
      case 'pause':
        playback.pause()
        break
      case 'resume':
        playback.resume()
        break
      case 'next':
      case 'pick': {
        if (this.view.role !== 'host') {
          this.refuse(id, 'host')
          break
        }
        const target = c.k === 'pick' ? this.libIds[c.i] : await this.nextVideo()
        if (!target || !(await playback.play(target).catch(() => false)))
          this.refuse(id, 'missing')
        break
      }
    }
    // Show the result soon rather than at the next heartbeat.
    this.liveSig = ''
  }

  private async scripted() {
    try {
      return (await this.ctx.library.list()).filter(v => v.hasScript)
    }
    catch {
      return []
    }
  }

  /** The scripted video after the one playing, in library order (playhound has no queue to skip in, for plugins). */
  private async nextVideo(): Promise<string | null> {
    const list = await this.scripted()
    if (!list.length)
      return null
    const cur = this.ctx.player.state().title
    const i = list.findIndex(v => v.id === cur)
    return list[(i + 1) % list.length].id
  }

  private async sendLib() {
    const list = (await this.scripted()).slice(0, 200)
    const s = this.view.mine
    if (s.p !== 'granted')
      return
    this.libIds = list.map(v => v.id)
    this.send({ t: 'pcLib', id: s.id, items: list.map(v => ({ title: v.title.slice(0, 300), dur: Math.max(0, Math.min(86_400, v.durationS ?? 0)) })) })
  }

  private liveNow(): Live {
    const { session, player } = this.ctx
    const es = session.edgeState()
    const r = this.ctx.motion.readout()
    const st = player.state()
    const r2 = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100) / 100
    return {
      level: r2(session.intensity.get()),
      max: r2(session.intensity.max()),
      eff: r2(es.effective),
      edge: es.phase,
      left: Math.max(0, Math.min(3600, Math.round(es.remainingSec))),
      panic: this.ctx.safety.panicked(),
      title: st.title ? st.title.slice(0, 300) : null,
      playing: st.playing,
      script: st.playing && st.hasScript,
      spm: Math.max(0, Math.min(600, Math.round(r.spm))),
      depth: r2(r.depth),
      maxSpm: Math.max(0, Math.min(600, Math.round(r.maxSpm))),
      stroking: !!this.strokes?.active && r.spm > 0,
    }
  }

  /** My session as my partner sees it: when it changes (5 a second at most), and every second. */
  private sendLive(t: number) {
    const s = this.view.mine
    if (s.p !== 'granted')
      return
    const live = this.liveNow()
    const sig = JSON.stringify(live)
    if ((sig !== this.liveSig && t - this.liveAt >= 200) || t - this.liveAt >= 1000) {
      this.liveSig = sig
      this.liveAt = t
      this.send({ t: 'pcLive', id: s.id, s: live })
    }
  }
}
