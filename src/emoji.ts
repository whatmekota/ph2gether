/**
 * The verification emojis, as in Telegram's calls.
 *
 * Each app has its own DTLS certificate; its fingerprint is in the SDP both
 * sides exchanged. Both apps take the two fingerprints (their own, and the one
 * they actually connected to), sort them so both sides agree on the order, hash
 * them, and show 5 emojis from 30 bits of the hash. Someone in the middle has
 * to make two connections with two certificates of their own, so the two
 * sides would see different pairs and, all but certainly, different emojis
 * (a forger gets them to match by luck once in 2^30 tries).
 */

/**
 * 64 emojis, 6 bits each. Distinct at a glance: different colours or shapes,
 * nothing that looks like another one in a small size. The order is part of
 * the protocol: never reorder or change it, only bump SAS_VERSION with a new
 * list.
 */
export const EMOJIS: readonly string[] = [
  '❤️', '💙', '💚', '💛', '💜', '🖤', '⭐', '✨',
  '🔞', '🐾', '🍑', '🍒', '💋', '🔥', '💦', '🎀',
  '🌙', '🍭', '😈', '👅', '🦴', '🐶', '🌶️', '🍓',
  '🎧', '🎵', '🌈', '💎', '🔒', '🗝️', '🍆', '🍌',
  '🍩', '🍯', '🍫', '🍷', '🧁', '🍉', '🍋', '🥑',
  '🌹', '🌸', '🍄', '🌵', '🦊', '🧲', '🐰', '🦄',
  '🐙', '🦋', '🐝', '🐍', '👑', '🎲', '🎈', '🕯️',
  '🛁', '🧸', '⛓️', '👠', '👙', '⚡', '🍿', '🎬',
]

/** One word for each emoji, for reading them out loud and for screen readers. */
export const EMOJI_NAMES: readonly string[] = [
  'red heart', 'blue heart', 'green heart', 'yellow heart', 'purple heart', 'black heart', 'star', 'sparkles',
  'eighteen plus', 'paw prints', 'peach', 'cherries', 'kiss', 'fire', 'droplets', 'ribbon',
  'moon', 'lollipop', 'devil', 'tongue', 'bone', 'puppy', 'chili', 'strawberry',
  'headphones', 'music', 'rainbow', 'diamond', 'lock', 'key', 'eggplant', 'banana',
  'donut', 'honey', 'chocolate', 'wine', 'cupcake', 'watermelon', 'lemon', 'avocado',
  'rose', 'blossom', 'mushroom', 'cactus', 'fox', 'magnet', 'bunny', 'unicorn',
  'octopus', 'butterfly', 'bee', 'snake', 'crown', 'dice', 'balloon', 'candle',
  'bathtub', 'teddy bear', 'chains', 'high heel', 'bikini', 'lightning', 'popcorn', 'clapper',
]

export const SAS_VERSION = 1
export const SAS_LENGTH = 5

/**
 * The certificate fingerprints in an SDP (`a=fingerprint:sha-256 AB:CD:…`),
 * normalised (algorithm lower case, hex upper case), unique and sorted, joined
 * with a comma. Empty if there is none.
 */
export function sdpFingerprint(sdp: string | null | undefined): string {
  const out = new Set<string>()
  for (const m of String(sdp ?? '').matchAll(/^a=fingerprint:\s*(\S+)\s+([0-9a-f:]+)\s*$/gim))
    out.add(`${m[1].toLowerCase()} ${m[2].toUpperCase()}`)
  return [...out].sort().join(',')
}

/** The 6-bit groups of `bytes`, most significant bit first: the first `count` of them. */
export function sixBitGroups(bytes: Uint8Array, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    let v = 0
    for (let b = 0; b < 6; b++) {
      const bit = i * 6 + b
      v = (v << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1)
    }
    out.push(v)
  }
  return out
}

/**
 * The emoji indexes for a pair of fingerprints. Symmetric: (a, b) and (b, a)
 * give the same. Null if either side is missing.
 */
export async function sasIndexes(local: string, remote: string): Promise<number[] | null> {
  if (!local || !remote)
    return null
  const [lo, hi] = [local, remote].sort()
  const input = new TextEncoder().encode(`ph2gether/sas/${SAS_VERSION}\n${lo}\n${hi}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  return sixBitGroups(hash, SAS_LENGTH)
}

export async function sasEmojis(local: string, remote: string): Promise<string[] | null> {
  const idx = await sasIndexes(local, remote)
  return idx ? idx.map(i => EMOJIS[i]) : null
}
