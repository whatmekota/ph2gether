import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMOJI_NAMES, EMOJIS, sasEmojis, sasIndexes, sdpFingerprint, sixBitGroups } from '../src/emoji.ts'

const FP_A = 'sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:3E:4B:65:0F:23:D8:6A:89:14:72:5E:3B'
const FP_B = 'sha-256 01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF'
// What sasIndexes(FP_A, FP_B) gave when the derivation was written; it must never change.
const PINNED_AB = [43, 58, 58, 48, 4]
const FP_C = 'sha-256 FE:DC:BA:98:76:54:32:10:FE:DC:BA:98:76:54:32:10:FE:DC:BA:98:76:54:32:10:FE:DC:BA:98:76:54:32:10'

test('64 emojis, all different, each with a name', () => {
  assert.equal(EMOJIS.length, 64)
  assert.equal(new Set(EMOJIS).size, 64)
  assert.equal(EMOJI_NAMES.length, 64)
  assert.equal(new Set(EMOJI_NAMES).size, 64)
  // No emoji is another one plus or minus the emoji presentation selector.
  const bare = EMOJIS.map(e => e.replace(/️/g, ''))
  assert.equal(new Set(bare).size, 64)
})

test('sixBitGroups: 6 bits each, most significant first', () => {
  // 0b000001 000010 000011 000100 000101 ...
  const bytes = new Uint8Array([0b00000100, 0b00100000, 0b11000100, 0b00010100, 0, 0, 0, 0])
  assert.deepEqual(sixBitGroups(bytes, 5), [1, 2, 3, 4, 5])
  assert.deepEqual(sixBitGroups(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]), 5), [63, 63, 63, 63, 63])
  assert.deepEqual(sixBitGroups(new Uint8Array(4), 5), [0, 0, 0, 0, 0])
  for (const v of sixBitGroups(crypto.getRandomValues(new Uint8Array(32)), 42))
    assert.ok(v >= 0 && v < 64)
})

test('sdpFingerprint: finds, normalises and de-duplicates', () => {
  const sdp = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    `a=fingerprint:SHA-256 ${FP_A.slice(8).toLowerCase()}`,
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    `a=fingerprint:sha-256 ${FP_A.slice(8)}`,
    'a=setup:actpass',
  ].join('\r\n')
  assert.equal(sdpFingerprint(sdp), FP_A)
  assert.equal(sdpFingerprint(''), '')
  assert.equal(sdpFingerprint(null), '')
  assert.equal(sdpFingerprint('v=0\r\na=setup:active'), '')
})

test('sas: symmetric, stable, 5 emojis', async () => {
  const ab = await sasIndexes(FP_A, FP_B)
  const ba = await sasIndexes(FP_B, FP_A)
  assert.ok(ab)
  assert.deepEqual(ab, ba)
  assert.equal(ab.length, 5)
  for (const i of ab)
    assert.ok(Number.isInteger(i) && i >= 0 && i < 64)
  assert.deepEqual(await sasIndexes(FP_A, FP_B), ab)
  const e = await sasEmojis(FP_B, FP_A)
  assert.deepEqual(e, ab.map(i => EMOJIS[i]))
})

test('sas: pinned values (both sides of a call must agree across versions)', async () => {
  assert.deepEqual(await sasIndexes(FP_A, FP_B), PINNED_AB)
})

test('sas: someone in the middle shows each side different emojis', async () => {
  // A talks to M (C), B talks to M (C): A sees (A, C), B sees (B, C).
  const a = await sasIndexes(FP_A, FP_C)
  const b = await sasIndexes(FP_B, FP_C)
  assert.notDeepEqual(a, b)
})

test('sas: missing fingerprint gives nothing', async () => {
  assert.equal(await sasIndexes('', FP_B), null)
  assert.equal(await sasEmojis(FP_A, ''), null)
})

test('sas: spreads over all 64 emojis', async () => {
  const seen = new Set<number>()
  for (let i = 0; i < 300; i++) {
    const r = await sasIndexes(`sha-256 ${i}`, FP_B)
    for (const x of r!)
      seen.add(x)
  }
  assert.equal(seen.size, 64)
})

