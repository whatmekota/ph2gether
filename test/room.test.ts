import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODE_BITS, deriveRoom, makeCode, parseCode } from '../src/room.ts'
import { ADJECTIVES, ANIMALS } from '../src/words.ts'

test('word lists: 256 each, unique, plain lower-case words, no overlap', () => {
  for (const list of [ADJECTIVES, ANIMALS]) {
    assert.equal(list.length, 256)
    assert.equal(new Set(list).size, 256)
    for (const w of list)
      assert.match(w, /^[a-z]{2,12}$/, w)
  }
  assert.deepEqual(ADJECTIVES.filter(w => ANIMALS.includes(w)), [])
})

test('codes carry about 29 bits', () => {
  assert.ok(CODE_BITS > 29 && CODE_BITS < 29.2, String(CODE_BITS))
})

test('makeCode: adjective-animal-number, with the network suffix', () => {
  for (let i = 0; i < 200; i++) {
    const c = makeCode()
    assert.match(c.code, /^[a-z]+-[a-z]+-\d{4}$/)
    assert.equal(c.base, c.code)
    assert.equal(c.strategy, 'nostr')
    const [adj, animal, n] = c.code.split('-')
    assert.ok(ADJECTIVES.includes(adj))
    assert.ok(ANIMALS.includes(animal))
    assert.ok(Number(n) >= 1000 && Number(n) <= 9999)
  }
  assert.match(makeCode('torrent').code, /-\d{4}-bt$/)
  assert.match(makeCode('mqtt').code, /-\d{4}-mq$/)
})

test('makeCode: uniform picks, rejecting the biased top of the range', () => {
  // A source that first gives a value in the biased zone (65535 >= 63000 for 9000).
  const seq = [0, 0, 65535, 5]
  let i = 0
  const c = makeCode('nostr', () => seq[i++])
  assert.equal(c.code, `${ADJECTIVES[0]}-${ANIMALS[0]}-1005`)
})

test('makeCode: codes differ', () => {
  const seen = new Set(Array.from({ length: 500 }, () => makeCode().code))
  assert.ok(seen.size > 495)
})

test('parseCode: tolerant of case, spaces and text around it', () => {
  const want = 'velvet-otter-4271'
  for (const s of ['velvet-otter-4271', 'Velvet-Otter-4271', '  velvet otter 4271 ', 'velvet_otter_4271', 'join me: velvet-otter-4271 :)', 'VELVET--OTTER--4271', 'code is velvet otter 4271.'])
    assert.equal(parseCode(s)?.code, want, s)
  assert.deepEqual(parseCode('velvet-otter-4271-bt'), { code: 'velvet-otter-4271-bt', base: 'velvet-otter-4271', strategy: 'torrent' })
  assert.deepEqual(parseCode('Velvet Otter 4271 MQ'), { code: 'velvet-otter-4271-mq', base: 'velvet-otter-4271', strategy: 'mqtt' })
})

test('parseCode: refuses what is not a code', () => {
  for (const s of ['', 'hello', 'velvet-otter', 'velvet-otter-42', 'velvet-otter-0999', 'velvet-otter-12345', 'purple-otter-4271x', 'otter-velvet-4271', 'velvet-zzz-4271', 'zzz-otter-4271'])
    assert.equal(parseCode(s), null, s)
})

test('parseCode round-trips makeCode', () => {
  for (const s of ['nostr', 'torrent', 'mqtt'] as const) {
    const c = makeCode(s)
    assert.deepEqual(parseCode(c.code), c)
  }
})

test('deriveRoom: stable, separate from the code, the same for every network', async () => {
  const a = await deriveRoom(parseCode('velvet-otter-4271')!)
  const b = await deriveRoom(parseCode('Velvet Otter 4271 bt')!)
  assert.deepEqual(a, b)
  assert.match(a.roomId, /^[0-9a-f]{32}$/)
  assert.match(a.password, /^[0-9a-f]{64}$/)
  assert.ok(!a.password.startsWith(a.roomId))
  assert.ok(!a.roomId.includes('velvet'))
  const c = await deriveRoom(parseCode('velvet-otter-4272')!)
  assert.notEqual(c.roomId, a.roomId)
  assert.notEqual(c.password, a.password)
  // Pinned, so a change to the derivation (which would split old and new versions) is noticed.
  assert.equal(a.roomId, '607630378f1028f23667331d410375fd')
})
