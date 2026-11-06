import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flatten, LIMITS, parseMessage, unflatten } from '../src/protocol.ts'

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

test('script actions flatten and come back', () => {
  const acts = [{ at: 0, pos: 0 }, { at: 433.4, pos: 99.96 }, { at: 900, pos: 50 }]
  const flat = flatten(acts)
  assert.deepEqual(flat, [0, 0, 433, 100, 900, 50])
  assert.deepEqual(unflatten(flat), [{ at: 0, pos: 0 }, { at: 433, pos: 100 }, { at: 900, pos: 50 }])
  assert.deepEqual(unflatten([]), [])
})
