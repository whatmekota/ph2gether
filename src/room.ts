import { ADJECTIVES, ANIMALS } from './words'

/**
 * Room codes, e.g. `velvet-otter-4271`: an adjective, an animal and a number
 * from 1000 to 9999, picked at random. 8 + 8 + 13.1 ≈ 29 bits: about 590
 * million codes. Guessing one would mean trying hundreds of millions of rooms
 * on public relays while that room is open, and a room takes only two people.
 *
 * The code itself never leaves the app. The room id the relays see and the
 * password that encrypts the connection offers are both hashed from it.
 *
 * A room on another signalling network than the default carries it at the
 * end (`-bt` for BitTorrent trackers, `-mq` for MQTT), so a guest who pastes
 * the code always lands on the same network as the host.
 */

export type Strategy = 'nostr' | 'torrent' | 'mqtt'

export const STRATEGIES: readonly Strategy[] = ['nostr', 'torrent', 'mqtt']

const SUFFIX: Record<Strategy, string> = { nostr: '', torrent: 'bt', mqtt: 'mq' }

export interface RoomCode {
  /** The shareable code, with the network suffix if any. */
  code: string
  /** adjective-animal-number, the part the secrets come from. */
  base: string
  strategy: Strategy
}

/** Uniform random integer in [0, n) from a source of random 16-bit numbers. */
function pick(n: number, rand16: () => number): number {
  const limit = Math.floor(65536 / n) * n
  for (;;) {
    const r = rand16()
    if (r < limit)
      return r % n
  }
}

const cryptoRand16 = () => crypto.getRandomValues(new Uint16Array(1))[0]

/** A new random room code. */
export function makeCode(strategy: Strategy = 'nostr', rand16: () => number = cryptoRand16): RoomCode {
  const base = `${ADJECTIVES[pick(ADJECTIVES.length, rand16)]}-${ANIMALS[pick(ANIMALS.length, rand16)]}-${1000 + pick(9000, rand16)}`
  return { base, strategy, code: SUFFIX[strategy] ? `${base}-${SUFFIX[strategy]}` : base }
}

/**
 * A code as typed or pasted: any case, spaces or dashes between the parts,
 * text around it ("join me: Velvet Otter 4271"). Null if it isn't one.
 */
export function parseCode(input: string): RoomCode | null {
  const s = String(input ?? '').toLowerCase().replace(/[\s_.,:;/]+/g, '-')
  const re = /(?:^|[^a-z])([a-z]+)-+([a-z]+)-+(\d{4})(?:-+(bt|mq))?(?![a-z\d])/g
  for (const m of s.matchAll(re)) {
    const [, adj, animal, num, suf] = m
    const n = Number(num)
    if (!ADJECTIVES.includes(adj) || !ANIMALS.includes(animal) || n < 1000)
      continue
    const strategy: Strategy = suf === 'bt' ? 'torrent' : suf === 'mq' ? 'mqtt' : 'nostr'
    const base = `${adj}-${animal}-${num}`
    return { base, strategy, code: suf ? `${base}-${suf}` : base }
  }
  return null
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('')
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

/**
 * What a room code becomes on the wire. Two different hashes of the code, so
 * the room id (which relays see, hashed again by Trystero) says nothing about
 * the password (which encrypts the offers and checks the peer knows the code).
 */
export async function deriveRoom(code: RoomCode): Promise<{ roomId: string, password: string }> {
  return {
    roomId: (await sha256(`ph2gether/room/1/${code.base}`)).slice(0, 32),
    password: await sha256(`ph2gether/key/1/${code.base}`),
  }
}

/** log2 of how many codes there are (for the record and the tests). */
export const CODE_BITS = Math.log2(ADJECTIVES.length * ANIMALS.length * 9000)
