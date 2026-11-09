import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanName, flatten, LIMITS, parseMessage, parsePowers, unflatten } from '../src/protocol.ts'

const state = { t: 'state', video: { fp: 'v1:123:abc', title: 'clip.mp4', duration: 60 }, playing: true, pos: 12.5, rate: 1, sent: 1234.5, jumps: 2, control: false }

test('good messages come through as they are', () => {
  const msgs = [
    { t: 'hello', v: 1, role: 'host', app: '0.1.0' },
    { t: 'full' },
    { t: 'bye' },
    state,
    { ...state, video: null },
    { ...state, video: { fp: null, title: 'not in library.mp4', duration: 0 } },
    { t: 'ping', a: 1 },
    { t: 'pong', a: 1, b: 2 },
    { t: 'verified' },
    { t: 'panic' },
    { t: 'ctl', a: 'play' },
    { t: 'ctl', a: 'pause' },
    { t: 'ctl', a: 'seek', pos: 30 },
    { t: 'getScript' },
    { t: 'noScript' },
    { t: 'status', s: 'matched', drift: -0.04 },
    { t: 'script', video: 'v1:123:abc', axes: [{ axis: 'L0', name: 'clip.funscript', actions: [0, 0, 500, 100] }] },
  ]
  for (const m of msgs)
    assert.deepEqual(parseMessage(m), m, JSON.stringify(m))
})

test('extra fields are dropped', () => {
  assert.deepEqual(parseMessage({ t: 'panic', evil: true }), { t: 'panic' })
  assert.deepEqual(parseMessage({ t: 'ctl', a: 'play', pos: 5 }), { t: 'ctl', a: 'play' })
  const s = parseMessage({ ...state, __proto__x: 1, extra: 'x' })
  assert.deepEqual(s, state)
})

test('bad messages are refused', () => {
  const bad: unknown[] = [
    null,
    undefined,
    'state',
    42,
    [],
    {},
    { t: 'nope' },
    { t: 'hello', v: 1, role: 'admin', app: 'x' },
    { t: 'hello', v: '1', role: 'host', app: 'x' },
    { t: 'hello', v: 1, role: 'host', app: 'x'.repeat(LIMITS.app + 1) },
    { ...state, playing: 'yes' },
    { ...state, pos: -1 },
    { ...state, pos: Number.NaN },
    { ...state, pos: Infinity },
    { ...state, rate: 0 },
    { ...state, rate: 50 },
    { ...state, sent: 'now' },
    { ...state, video: { fp: 'x', title: 't'.repeat(LIMITS.title + 1), duration: 1 } },
    { ...state, video: { fp: '', title: 'a', duration: 1 } },
    { ...state, video: { fp: 'x', title: 'a', duration: -1 } },
    { ...state, video: 'clip.mp4' },
    { ...state, control: 1 },
    { t: 'ping' },
    { t: 'pong', a: 1 },
    { t: 'ctl', a: 'eject' },
    { t: 'ctl', a: 'seek' },
    { t: 'ctl', a: 'seek', pos: -3 },
    { t: 'status', s: 'hacked', drift: 0 },
    { t: 'status', s: 'matched', drift: 'x' },
    { t: 'script', video: 'v', axes: 'L0' },
    { t: 'script', video: 'v', axes: [{ axis: 'L0', name: 'a', actions: [0, 0, 500] }] },
    { t: 'script', video: 'v', axes: [{ axis: 'L0', name: 'a', actions: [0, 101] }] },
    { t: 'script', video: 'v', axes: [{ axis: 'L0', name: 'a', actions: [-5, 50] }] },
    { t: 'script', video: 'v', axes: [{ axis: 'L0', name: 'a', actions: ['0', 50] }] },
    { t: 'script', video: 'v', axes: [{ axis: '../x', name: 'a', actions: [0, 50] }] },
    { t: 'script', video: 'v', axes: Array.from({ length: LIMITS.axes + 1 }, () => ({ axis: 'L0', name: 'a', actions: [] })) },
  ]
  for (const m of bad)
    assert.equal(parseMessage(m), null, JSON.stringify(m))
})

const live = { level: 0.5, max: 0.8, eff: 0.42, edge: 'holding', left: 12, panic: false, title: 'clip.mp4', playing: true, script: true, spm: 0, depth: 0.5, maxSpm: 150, stroking: false }

test('hello: partner control\'s version and a name, both optional', () => {
  assert.deepEqual(parseMessage({ t: 'hello', v: 1, role: 'guest', app: '0.2.0', pc: 1, name: 'Sam' }), { t: 'hello', v: 1, role: 'guest', app: '0.2.0', pc: 1, name: 'Sam' })
  // An older app's hello: no pc, no name.
  assert.deepEqual(parseMessage({ t: 'hello', v: 1, role: 'guest', app: '0.1.1' }), { t: 'hello', v: 1, role: 'guest', app: '0.1.1' })
  // A newer app's: a higher pc comes through (each side then speaks the lower).
  assert.equal((parseMessage({ t: 'hello', v: 1, role: 'host', app: '9.0.0', pc: 7 }) as { pc?: number }).pc, 7)
  // Bad extras are dropped, not the hello.
  assert.deepEqual(parseMessage({ t: 'hello', v: 1, role: 'host', app: 'x', pc: 'lots', name: 42 }), { t: 'hello', v: 1, role: 'host', app: 'x' })
  assert.deepEqual(parseMessage({ t: 'hello', v: 1, role: 'host', app: 'x', pc: 1.5, name: '   ' }), { t: 'hello', v: 1, role: 'host', app: 'x' })
})

test('names are plain, short text', () => {
  assert.equal(cleanName('  Sam\u0000‮\n '), 'Sam')
  assert.equal(cleanName('x'.repeat(100))?.length, LIMITS.name)
  assert.equal(cleanName('​'), null)
  assert.equal(cleanName(null), null)
})

test('powers: known ones, each once, in the usual order', () => {
  assert.deepEqual(parsePowers(['intensity', 'edge']), ['edge', 'intensity'])
  assert.deepEqual(parsePowers(['stroke', 'playback', 'intensity', 'edge']), ['edge', 'intensity', 'playback', 'stroke'])
  for (const bad of [[], ['edge', 'edge'], ['root'], 'edge', null, [1], ['edge', 'intensity', 'playback', 'stroke', 'edge']])
    assert.equal(parsePowers(bad), null, JSON.stringify(bad))
})

test('good control messages come through as they are', () => {
  const msgs = [
    { t: 'pcAsk', powers: ['edge', 'intensity'] },
    { t: 'pcOffer', powers: ['edge'] },
    { t: 'pcAccept' },
    { t: 'pcGrant', id: 'g0123456789ab', powers: ['edge', 'intensity', 'stroke'] },
    { t: 'pcEnd', why: 'no' },
    { t: 'pcEnd', id: 'g0123456789ab', why: 'taken' },
    { t: 'pcStop', why: 'cancel' },
    { t: 'pcStop', id: 'g0123456789ab', why: 'letGo' },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'edge' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'endEdge' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'level', v: 0.65 } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'stroke', spm: 80, depth: 0.7 } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'strokeStop' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'pause' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'resume' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'next' } },
    { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'pick', i: 3 } },
    { t: 'pcLive', id: 'g0123456789ab', s: live },
    { t: 'pcLive', id: 'g0123456789ab', s: { ...live, title: null } },
    { t: 'pcLib', id: 'g0123456789ab', items: [{ title: 'a', dur: 60 }] },
    { t: 'pcLib', id: 'g0123456789ab', items: [] },
    { t: 'pcNo', id: 'g0123456789ab', why: 'rate' },
  ]
  for (const m of msgs)
    assert.deepEqual(parseMessage(m), m, JSON.stringify(m))
})

test('bad control messages are refused', () => {
  const id = 'g0123456789ab'
  const bad: unknown[] = [
    { t: 'pcAsk' },
    { t: 'pcAsk', powers: [] },
    { t: 'pcAsk', powers: ['admin'] },
    { t: 'pcGrant', powers: ['edge'] },
    { t: 'pcGrant', id: 'x', powers: ['edge'] },
    { t: 'pcGrant', id: '<script>alert(1)</script>', powers: ['edge'] },
    { t: 'pcEnd', why: 'because' },
    { t: 'pcEnd', id: 5, why: 'taken' },
    { t: 'pcStop', why: 'taken' },
    { t: 'pcCmd', id, c: { k: 'explode' } },
    { t: 'pcCmd', id, c: 'edge' },
    { t: 'pcCmd', id, c: { k: 'level', v: 1.5 } },
    { t: 'pcCmd', id, c: { k: 'level', v: -0.1 } },
    { t: 'pcCmd', id, c: { k: 'level', v: Number.NaN } },
    { t: 'pcCmd', id, c: { k: 'level' } },
    { t: 'pcCmd', id, c: { k: 'stroke', spm: 9999, depth: 0.5 } },
    { t: 'pcCmd', id, c: { k: 'stroke', spm: 60, depth: 2 } },
    { t: 'pcCmd', id, c: { k: 'pick', i: 1.5 } },
    { t: 'pcCmd', id, c: { k: 'pick', i: LIMITS.lib } },
    { t: 'pcCmd', c: { k: 'edge' } },
    { t: 'pcLive', id, s: { ...live, level: 2 } },
    { t: 'pcLive', id, s: { ...live, edge: 'boiling' } },
    { t: 'pcLive', id, s: { ...live, title: 't'.repeat(LIMITS.title + 1) } },
    { t: 'pcLive', id, s: { ...live, panic: 'no' } },
    { t: 'pcLive', id, s: { level: 0.5 } },
    { t: 'pcLib', id, items: [{ title: '', dur: 1 }] },
    { t: 'pcLib', id, items: Array.from({ length: LIMITS.lib + 1 }, () => ({ title: 'a', dur: 1 })) },
    { t: 'pcNo', id, why: 'meh' },
    { t: 'pcNope' },
  ]
  for (const m of bad)
    assert.equal(parseMessage(m), null, JSON.stringify(m))
})

test('extra fields in control messages are dropped', () => {
  assert.deepEqual(parseMessage({ t: 'pcCmd', id: 'g0123456789ab', c: { k: 'edge', times: 50 }, x: 1 }), { t: 'pcCmd', id: 'g0123456789ab', c: { k: 'edge' } })
  assert.deepEqual(parseMessage({ t: 'pcAccept', powers: ['stroke'] }), { t: 'pcAccept' })
})

test('script actions flatten and come back', () => {
  const acts = [{ at: 0, pos: 0 }, { at: 433.4, pos: 99.96 }, { at: 900, pos: 50 }]
  const flat = flatten(acts)
  assert.deepEqual(flat, [0, 0, 433, 100, 900, 50])
  assert.deepEqual(unflatten(flat), [{ at: 0, pos: 0 }, { at: 433, pos: 100 }, { at: 900, pos: 50 }])
  assert.deepEqual(unflatten([]), [])
})
