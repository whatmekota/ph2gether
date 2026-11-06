import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ClockSync, clockSample, correction, hostPositionAt, jumped, SYNC } from '../src/sync.ts'

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)

test('clockSample: offset from a symmetric round trip', () => {
  // Host clock runs 5000 ms ahead; 40 ms each way.
  const sent = 1000
  const hostAt = sent + 40 + 5000
  const recv = sent + 80
  const s = clockSample(sent, hostAt, recv)
  close(s.rtt, 80)
  close(s.offset, 5000)
})

test('clockSample: an asymmetric trip errs by half the difference', () => {
  // 10 ms out, 70 ms back: the estimate is off by (10 - 70) / 2 = -30 ms.
  const s = clockSample(0, 10 + 5000, 80)
  close(s.offset, 4970)
})

test('ClockSync: trusts the quickest round trip of the recent ones', () => {
  const c = new ClockSync(4)
  assert.equal(c.ready, false)
  assert.equal(c.offset, 0)
  c.add({ rtt: 200, offset: 900 })
  c.add({ rtt: 30, offset: 1000 })
  c.add({ rtt: 120, offset: 1100 })
  assert.equal(c.offset, 1000)
  assert.equal(c.latestRtt, 120)
  // The quick one ages out.
  c.add({ rtt: 90, offset: 1050 })
  c.add({ rtt: 100, offset: 1060 })
  c.add({ rtt: 110, offset: 1070 })
  assert.equal(c.offset, 1050)
  c.reset()
  assert.equal(c.ready, false)
})

test('hostPositionAt: paused stays put; playing runs on with the rate', () => {
  const beat = { pos: 10, playing: true, rate: 1, sent: 5000 }
  // Local now 1000, offset 4500 → host now 5500: half a second on.
  close(hostPositionAt(beat, 1000, 4500), 10.5)
  close(hostPositionAt({ ...beat, rate: 1.5 }, 1000, 4500), 10.75)
  close(hostPositionAt({ ...beat, playing: false }, 1000, 4500), 10)
  // Never backwards, never too far, never past the end.
  close(hostPositionAt(beat, 0, 4500), 10)
  close(hostPositionAt(beat, 100_000, 4500), 10 + SYNC.maxAheadS)
  close(hostPositionAt(beat, 1000, 4500, 10.2), 10.2)
})

test('correction: small drift is left alone, big drift seeks', () => {
  const base = { guestPlaying: true, hostPlaying: true, sinceSeekMs: 10_000 }
  assert.equal(correction({ ...base, guestPos: 10.1, hostPos: 10 }).kind, 'none')
  assert.equal(correction({ ...base, guestPos: 9.8, hostPos: 10 }).kind, 'none')
  const ahead = correction({ ...base, guestPos: 10.4, hostPos: 10 })
  assert.equal(ahead.kind, 'seek')
  close(ahead.drift, 0.4, 1e-9)
  const behind = correction({ ...base, guestPos: 7, hostPos: 10 })
  assert.deepEqual(behind, { kind: 'seek', to: 10, drift: -3 })
})

test('correction: tighter while paused, waits after a seek, ignores play/pause mismatch', () => {
  assert.equal(correction({ guestPos: 10.15, hostPos: 10, guestPlaying: false, hostPlaying: false, sinceSeekMs: 10_000 }).kind, 'seek')
  assert.equal(correction({ guestPos: 10.05, hostPos: 10, guestPlaying: false, hostPlaying: false, sinceSeekMs: 10_000 }).kind, 'none')
  assert.equal(correction({ guestPos: 20, hostPos: 10, guestPlaying: true, hostPlaying: true, sinceSeekMs: 500 }).kind, 'none')
  assert.equal(correction({ guestPos: 20, hostPos: 10, guestPlaying: false, hostPlaying: true, sinceSeekMs: 10_000 }).kind, 'none')
  assert.equal(correction({ guestPos: 20, hostPos: 10, guestPlaying: true, hostPlaying: true, sinceSeekMs: SYNC.settleMs }).kind, 'seek')
})

test('correction: right at the limits', () => {
  const base = { guestPlaying: true, hostPlaying: true, sinceSeekMs: 10_000, hostPos: 10 }
  assert.equal(correction({ ...base, guestPos: 10 + SYNC.seekOverS }).kind, 'none')
  assert.equal(correction({ ...base, guestPos: 10 + SYNC.seekOverS + 0.001 }).kind, 'seek')
})

test('jumped: a seek is noticed, playing along is not', () => {
  const prev = { pos: 10, at: 1000, playing: true }
  assert.equal(jumped(prev, { pos: 10.25, at: 1250 }, 1), false)
  assert.equal(jumped(prev, { pos: 10.5, at: 1250 }, 2), false)
  assert.equal(jumped(prev, { pos: 30, at: 1250 }, 1), true)
  assert.equal(jumped(prev, { pos: 5, at: 1250 }, 1), true)
  // Paused: any real move is a seek; standing still is not.
  assert.equal(jumped({ ...prev, playing: false }, { pos: 10, at: 5000 }, 1), false)
  assert.equal(jumped({ ...prev, playing: false }, { pos: 12, at: 1250 }, 1), true)
  // A short stall while "playing" isn't one.
  assert.equal(jumped(prev, { pos: 10, at: 1400 }, 1), false)
})
