import type { Room } from '@trystero-p2p/nostr'
import type { Msg } from './protocol'
import type { Strategy } from './room'
import { joinRoom as joinMqtt, getRelaySockets as mqttSockets } from '@trystero-p2p/mqtt'
import { joinRoom as joinNostr, getRelaySockets as nostrSockets } from '@trystero-p2p/nostr'
import { joinRoom as joinTorrent, getRelaySockets as torrentSockets } from '@trystero-p2p/torrent'
import { parseMessage } from './protocol'

/**
 * The connection: a Trystero room on public signalling (Nostr relays,
 * BitTorrent trackers or MQTT brokers), which only carries the encrypted
 * WebRTC offers, and then a direct, DTLS-encrypted data channel between the
 * two apps. Public STUN servers help each side find its own address; there is
 * no TURN relay, so two networks that can't reach each other directly don't
 * connect (and we say so).
 */

export const APP_ID = 'ph2gether'

/** Nostr relays to use at once (of Trystero's list; the same ones on both sides). */
const NOSTR_REDUNDANCY = 8

/** A connection with both descriptions that hasn't connected after this long has failed, ms. */
const STUCK_MS = 20_000

export interface LinkEvents {
  peerJoin: (peerId: string) => void
  peerLeave: (peerId: string) => void
  message: (msg: Msg, peerId: string) => void
  /** A peer that answered on the relays couldn't be reached directly. */
  iceFailed: () => void
  /** The room password didn't match (shouldn't happen: it comes from the code). */
  joinError: (why: string) => void
}

export interface Link {
  send: (msg: Msg, to?: string) => void
  leave: () => Promise<void>
  /** The peer connection to `peerId`, for its certificate fingerprints. */
  connection: (peerId: string) => RTCPeerConnection | undefined
  /** Signalling sockets open / tried. */
  relays: () => { open: number, total: number }
}

const joins = { nostr: joinNostr, torrent: joinTorrent, mqtt: joinMqtt }
const sockets: Record<Strategy, () => Record<string, unknown>> = { nostr: nostrSockets, torrent: torrentSockets, mqtt: mqttSockets }

function isOpen(s: unknown): boolean {
  if (!s || typeof s !== 'object')
    return false
  // A WebSocket (nostr, torrent) or mqtt's stream socket.
  const rs = (s as { readyState?: unknown }).readyState
  return rs === 1 || rs === 'open'
}

/**
 * RTCPeerConnection, as Trystero makes them, with each one watched: a
 * connection that got the other side's answer but whose ICE then failed means
 * the two networks couldn't reach each other directly.
 */
function watchedPeerConnection(onFailed: () => void): typeof RTCPeerConnection {
  return class Watched extends RTCPeerConnection {
    private stuck: ReturnType<typeof setTimeout> | null = null
    constructor(cfg?: RTCConfiguration) {
      super(cfg)
      const check = () => {
        if (this.connectionState === 'connected' || this.connectionState === 'closed') {
          if (this.stuck)
            clearTimeout(this.stuck)
          this.stuck = null
        }
        if ((this.iceConnectionState === 'failed' || this.connectionState === 'failed') && this.remoteDescription)
          onFailed()
      }
      this.addEventListener('iceconnectionstatechange', check)
      this.addEventListener('connectionstatechange', check)
    }

    // Both sides have each other's offer and answer: it should connect within
    // seconds. Still trying after STUCK_MS (without ever saying "failed", which
    // happens when one side has no usable address at all) counts as failed too.
    override async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
      await super.setRemoteDescription(desc)
      this.stuck ??= setTimeout(() => {
        this.stuck = null
        if (this.connectionState !== 'connected' && this.connectionState !== 'closed' && this.signalingState !== 'closed')
          onFailed()
      }, STUCK_MS)
    }
  }
}

export function openLink(opts: {
  strategy: Strategy
  roomId: string
  password: string
  /** Our DTLS certificate: the same one for every connection this session, so the emojis survive a reconnect. */
  certificate?: RTCCertificate
  on: LinkEvents
}): Link {
  const { on } = opts
  const config = {
    appId: APP_ID,
    password: opts.password,
    // Scripts can be big; Trystero splits them into frames.
    maxReceiveBytes: 32 * 1024 * 1024,
    rtcConfig: opts.certificate ? { certificates: [opts.certificate] } : undefined,
    rtcPolyfill: watchedPeerConnection(() => on.iceFailed()),
    ...(opts.strategy === 'nostr' ? { relayConfig: { redundancy: NOSTR_REDUNDANCY } } : {}),
  }
  const room: Room = joins[opts.strategy](config, opts.roomId, {
    onJoinError: e => on.joinError(e.error),
  })
  const action = room.makeAction<string>('ph')
  action.onMessage = (data, { peerId }) => {
    let raw: unknown
    try {
      raw = typeof data === 'string' ? JSON.parse(data) : null
    }
    catch {
      return
    }
    const msg = parseMessage(raw)
    if (msg)
      on.message(msg, peerId)
  }
  room.onPeerJoin = id => on.peerJoin(id)
  room.onPeerLeave = id => on.peerLeave(id)

  return {
    send(msg, to) {
      void action.send(JSON.stringify(msg), to ? { target: to } : undefined).catch(() => {})
    },
    leave: () => room.leave(),
    connection: id => room.getPeers()[id],
    relays() {
      const all = Object.values(sockets[opts.strategy]() ?? {})
      return { open: all.filter(isOpen).length, total: all.length }
    },
  }
}
