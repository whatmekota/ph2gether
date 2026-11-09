import type { CtlEvent, CtlState, OwnerEvent, OwnerState } from '../src/control.ts'
import type { Power } from '../src/protocol.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CmdGate, cmdAllowed, createThrottle, createWindow, ctlStep, KnobWatch, newGrantId, ownerStep, RATE, within } from '../src/control.ts'
import { parseMessage, POWERS } from '../src/protocol.ts'

const GENTLE: Power[] = ['edge', 'intensity']
let n = 0
const env = (over: Partial<{ verified: boolean, allowed: readonly Power[] }> = {}) => ({ verified: true, allowed: POWERS, newId: () => `grant${++n}`, ...over })

/** Run owner events from off; the last step. */
function owner(events: OwnerEvent[], e = env()) {
  let s: OwnerState = { p: 'off' }
  let r = ownerStep(s, events[0], e)
  for (const ev of events) {
    r = ownerStep(s, ev, e)
    s = r.s
  }
  return r
}

function ctl(events: CtlEvent[], verified = true) {
  let s: CtlState = { p: 'off' }
  let r = ctlStep(s, events[0], { verified })
  for (const ev of events) {
    r = ctlStep(s, ev, { verified })
    s = r.s
  }
  return r
}

// ─── Owner: consent first ─────────────────────────────────────────────────

test('an ask waits for the owner; nothing is granted by asking', () => {
  const r = owner([{ e: 'ask', powers: ['edge', 'intensity', 'stroke'] }])
  assert.deepEqual(r.s, { p: 'asked', powers: ['edge', 'intensity', 'stroke'] })
  assert.deepEqual(r.send, [])
  assert.equal(r.began, undefined)
})

test('the owner allows what they tick, not what was asked', () => {
  const r = owner([{ e: 'ask', powers: ['edge', 'intensity', 'stroke'] }, { e: 'allow', powers: ['edge'] }])
  assert.equal(r.s.p, 'granted')
  assert.deepEqual(r.s.p === 'granted' && r.s.powers, ['edge'])
  assert.equal(r.began, true)
  assert.equal(r.send[0].t, 'pcGrant')
})

test('the owner can say no', () => {
  const r = owner([{ e: 'ask', powers: GENTLE }, { e: 'refuse' }])
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [{ t: 'pcEnd', why: 'no' }])
})

test('an offer is the owner\'s yes; it is granted when taken', () => {
  const offered = owner([{ e: 'offer', powers: GENTLE }])
  assert.deepEqual(offered.s, { p: 'offered', powers: GENTLE })
  assert.deepEqual(offered.send, [{ t: 'pcOffer', powers: GENTLE }])
  const taken = owner([{ e: 'offer', powers: GENTLE }, { e: 'accept' }])
  assert.equal(taken.s.p, 'granted')
  assert.equal(taken.began, true)
})

test('asking while an offer is out (or offering while asked) grants at once', () => {
  assert.equal(owner([{ e: 'offer', powers: GENTLE }, { e: 'ask', powers: ['edge'] }]).s.p, 'granted')
  const r = owner([{ e: 'ask', powers: ['edge'] }, { e: 'offer', powers: GENTLE }])
  assert.equal(r.s.p, 'granted')
  // The owner's own choice wins.
  assert.deepEqual(r.s.p === 'granted' && r.s.powers, GENTLE)
})

test('an accept with no offer out does nothing', () => {
  const r = owner([{ e: 'accept' }])
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [])
})

test('withdrawing an offer, and the partner passing on it', () => {
  assert.deepEqual(owner([{ e: 'offer', powers: GENTLE }, { e: 'withdraw' }]).send, [{ t: 'pcEnd', why: 'withdrawn' }])
  const passed = owner([{ e: 'offer', powers: GENTLE }, { e: 'stop', why: 'pass' }])
  assert.deepEqual(passed.s, { p: 'off' })
  assert.ok(passed.note)
})

test('the partner cancelling an ask clears it', () => {
  assert.deepEqual(owner([{ e: 'ask', powers: GENTLE }, { e: 'stop', why: 'cancel' }]).s, { p: 'off' })
})

test('playback can\'t be granted when it isn\'t the owner\'s to give', () => {
  const e = env({ allowed: ['edge', 'intensity', 'stroke'] })
  const r = owner([{ e: 'ask', powers: ['playback', 'edge'] }, { e: 'allow', powers: ['playback', 'edge'] }], e)
  assert.deepEqual(r.s.p === 'granted' && r.s.powers, ['edge'])
  // Only playback: nothing to grant.
  assert.equal(owner([{ e: 'offer', powers: ['playback'] }], e).s.p, 'off')
  assert.deepEqual(within(['stroke', 'edge', 'playback'], ['edge', 'stroke']), ['edge', 'stroke'])
})

test('unverified rooms can\'t grant control', () => {
  const e = env({ verified: false })
  const asked = owner([{ e: 'ask', powers: GENTLE }], e)
  assert.deepEqual(asked.s, { p: 'off' })
  assert.deepEqual(asked.send, [{ t: 'pcEnd', why: 'unverified' }])
  const offered = owner([{ e: 'offer', powers: GENTLE }], e)
  assert.deepEqual(offered.s, { p: 'off' })
  assert.ok(offered.note)
  // Asked while verified, then (somehow) not: Allow does nothing.
  const s: OwnerState = { p: 'asked', powers: GENTLE }
  assert.equal(ownerStep(s, { e: 'allow', powers: GENTLE }, e).s, s)
  const o: OwnerState = { p: 'offered', powers: GENTLE }
  assert.equal(ownerStep(o, { e: 'accept' }, e).s, o)
})

// ─── Owner: ending ────────────────────────────────────────────────────────

const granted: OwnerState = { p: 'granted', id: 'g123456', powers: GENTLE }

test('take back: one step, says so, ends', () => {
  const r = ownerStep(granted, { e: 'takeBack' }, env())
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [{ t: 'pcEnd', id: 'g123456', why: 'taken' }])
  assert.equal(r.ended, 'taken')
})

test('panic ends it from any state', () => {
  const r = ownerStep(granted, { e: 'panic' }, env())
  assert.deepEqual(r.s, { p: 'off' })
  assert.equal(r.ended, 'panic')
  assert.deepEqual(r.send, [{ t: 'pcEnd', id: 'g123456', why: 'panic' }])
  for (const s of [{ p: 'asked', powers: GENTLE }, { p: 'offered', powers: GENTLE }] as OwnerState[]) {
    const x = ownerStep(s, { e: 'panic' }, env())
    assert.deepEqual(x.s, { p: 'off' })
    assert.equal(x.ended, undefined)
  }
  assert.deepEqual(ownerStep({ p: 'off' }, { e: 'panic' }, env()).send, [])
})

test('a lost connection ends it, with nothing to send', () => {
  const r = ownerStep(granted, { e: 'lost' }, env())
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [])
  assert.equal(r.ended, 'lost')
})

test('leaving ends it with a word', () => {
  const r = ownerStep(granted, { e: 'off' }, env())
  assert.deepEqual(r.send, [{ t: 'pcEnd', id: 'g123456', why: 'off' }])
  assert.equal(r.ended, 'off')
})

test('the partner giving it back ends it; a stale id doesn\'t', () => {
  const r = ownerStep(granted, { e: 'stop', why: 'letGo', id: 'g123456' }, env())
  assert.equal(r.ended, 'given')
  assert.equal(ownerStep(granted, { e: 'stop', why: 'letGo', id: 'gother1' }, env()).s, granted)
  assert.equal(ownerStep(granted, { e: 'stop', why: 'panic', id: 'g123456' }, env()).ended, 'panic')
})

test('a new ask while granted changes nothing', () => {
  assert.equal(ownerStep(granted, { e: 'ask', powers: POWERS.slice() }, env()).s, granted)
})

test('commands need the grant, its id and the power', () => {
  assert.equal(cmdAllowed(granted, 'g123456', { k: 'edge' }, true), 'ok')
  assert.equal(cmdAllowed(granted, 'g123456', { k: 'level', v: 0.5 }, true), 'ok')
  assert.equal(cmdAllowed(granted, 'g123456', { k: 'stroke', spm: 60, depth: 0.5 }, true), 'power')
  assert.equal(cmdAllowed(granted, 'g123456', { k: 'next' }, true), 'power')
  assert.equal(cmdAllowed(granted, 'gother1', { k: 'edge' }, true), 'stale')
  assert.equal(cmdAllowed({ p: 'off' }, 'g123456', { k: 'edge' }, true), 'stale')
  assert.equal(cmdAllowed(granted, 'g123456', { k: 'edge' }, false), 'power')
})

// ─── Controller ───────────────────────────────────────────────────────────

test('asking sends an ask and waits', () => {
  const r = ctl([{ e: 'ask', powers: GENTLE }])
  assert.deepEqual(r.s, { p: 'asking', powers: GENTLE })
  assert.deepEqual(r.send, [{ t: 'pcAsk', powers: GENTLE }])
})

test('asking needs a verified room', () => {
  const r = ctl([{ e: 'ask', powers: GENTLE }], false)
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [])
  // An offer in an unverified room isn't shown.
  assert.deepEqual(ctl([{ e: 'offer', powers: GENTLE }], false).s, { p: 'off' })
})

test('the grant arrives: control begins', () => {
  const r = ctl([{ e: 'ask', powers: GENTLE }, { e: 'grant', id: 'g1abc', powers: ['edge'] }])
  assert.deepEqual(r.s, { p: 'granted', id: 'g1abc', powers: ['edge'] })
  assert.equal(r.began, true)
})

test('an offer waits for my answer', () => {
  assert.deepEqual(ctl([{ e: 'offer', powers: GENTLE }]).s, { p: 'offered', powers: GENTLE })
  const acc = ctl([{ e: 'offer', powers: GENTLE }, { e: 'accept' }])
  assert.deepEqual(acc.send, [{ t: 'pcAccept' }])
  assert.equal(acc.s.p, 'asking')
  const pass = ctl([{ e: 'offer', powers: GENTLE }, { e: 'pass' }])
  assert.deepEqual(pass.send, [{ t: 'pcStop', why: 'pass' }])
  assert.deepEqual(pass.s, { p: 'off' })
})

test('an offer while I\'m asking is taken', () => {
  const r = ctl([{ e: 'ask', powers: GENTLE }, { e: 'offer', powers: ['edge'] }])
  assert.deepEqual(r.send, [{ t: 'pcAccept' }])
})

test('a grant nobody asked for goes straight back', () => {
  const r = ctl([{ e: 'grant', id: 'g9zzz', powers: GENTLE }])
  assert.deepEqual(r.s, { p: 'off' })
  assert.deepEqual(r.send, [{ t: 'pcStop', id: 'g9zzz', why: 'cancel' }])
})

test('the owner\'s no, take back, and a stale end', () => {
  assert.deepEqual(ctl([{ e: 'ask', powers: GENTLE }, { e: 'end', why: 'no' }]).s, { p: 'off' })
  const s: CtlState = { p: 'granted', id: 'g1abc', powers: GENTLE }
  const taken = ctlStep(s, { e: 'end', why: 'taken', id: 'g1abc' }, { verified: true })
  assert.deepEqual(taken.s, { p: 'off' })
  assert.equal(taken.ended, 'taken')
  assert.ok(taken.note)
  assert.equal(ctlStep(s, { e: 'end', why: 'taken', id: 'g0old' }, { verified: true }).s, s)
})

test('letting go, panic and a lost connection end it here', () => {
  const s: CtlState = { p: 'granted', id: 'g1abc', powers: GENTLE }
  assert.deepEqual(ctlStep(s, { e: 'letGo' }, { verified: true }).send, [{ t: 'pcStop', id: 'g1abc', why: 'letGo' }])
  const p = ctlStep(s, { e: 'panic' }, { verified: true })
  assert.deepEqual(p.s, { p: 'off' })
  assert.deepEqual(p.send, [{ t: 'pcStop', id: 'g1abc', why: 'panic' }])
  const l = ctlStep(s, { e: 'lost' }, { verified: true })
  assert.deepEqual(l.s, { p: 'off' })
  assert.deepEqual(l.send, [])
  assert.equal(l.ended, 'lost')
})

test('both ways at once: two independent pairs of machines', () => {
  // A controls B and B controls A; messages cross over the wire.
  const e = env()
  let aOwn: OwnerState = { p: 'off' }
  let aCtl: CtlState = { p: 'off' }
  let bOwn: OwnerState = { p: 'off' }
  let bCtl: CtlState = { p: 'off' }
  // A asks for B's; B asks for A's.
  let r1 = ctlStep(aCtl, { e: 'ask', powers: GENTLE }, e)
  aCtl = r1.s
  bOwn = ownerStep(bOwn, { e: 'ask', powers: GENTLE }, e).s
  r1 = ctlStep(bCtl, { e: 'ask', powers: ['edge'] }, e)
  bCtl = r1.s
  aOwn = ownerStep(aOwn, { e: 'ask', powers: ['edge'] }, e).s
  // Both allow.
  const gb = ownerStep(bOwn, { e: 'allow', powers: GENTLE }, e)
  bOwn = gb.s
  const ga = ownerStep(aOwn, { e: 'allow', powers: ['edge'] }, e)
  aOwn = ga.s
  const grantB = gb.send[0] as { id: string, powers: Power[] }
  const grantA = ga.send[0] as { id: string, powers: Power[] }
  aCtl = ctlStep(aCtl, { e: 'grant', id: grantB.id, powers: grantB.powers }, e).s
  bCtl = ctlStep(bCtl, { e: 'grant', id: grantA.id, powers: grantA.powers }, e).s
  assert.equal(aCtl.p, 'granted')
  assert.equal(bCtl.p, 'granted')
  // B takes back; A's control of B ends, B's control of A stays.
  const tb = ownerStep(bOwn, { e: 'takeBack' }, e)
  bOwn = tb.s
  const end = tb.send[0] as { id: string, why: 'taken' }
  aCtl = ctlStep(aCtl, { e: 'end', id: end.id, why: end.why }, e).s
  assert.equal(aCtl.p, 'off')
  assert.equal(bCtl.p, 'granted')
  assert.equal(aOwn.p, 'granted')
})

test('every message the machines send is a valid message', () => {
  const sent = [
    ...owner([{ e: 'ask', powers: GENTLE }, { e: 'allow', powers: GENTLE }]).send,
    ...ownerStep(granted, { e: 'takeBack' }, env()).send,
    ...ownerStep(granted, { e: 'panic' }, env()).send,
    ...owner([{ e: 'offer', powers: POWERS.slice() }]).send,
    ...ctl([{ e: 'ask', powers: GENTLE }]).send,
    ...ctl([{ e: 'offer', powers: GENTLE }, { e: 'pass' }]).send,
    ...ctlStep({ p: 'granted', id: 'g1abc', powers: GENTLE }, { e: 'letGo' }, { verified: true }).send,
  ]
  assert.ok(sent.length >= 7)
  for (const m of sent)
    assert.deepEqual(parseMessage(JSON.parse(JSON.stringify(m))), m, JSON.stringify(m))
  assert.match(newGrantId(), /^g[0-9a-f]{12}$/)
})

// ─── Rate limits ──────────────────────────────────────────────────────────

test('edges: one per pace, the rest refused', () => {
  const g = new CmdGate()
  assert.equal(g.take({ k: 'edge' }, 0), 'now')
  assert.equal(g.take({ k: 'edge' }, 100), 'rate')
  assert.equal(g.take({ k: 'endEdge' }, 800), 'rate')
  assert.equal(g.take({ k: 'edge' }, RATE.edgeMs), 'now')
})

test('playback commands are paced too', () => {
  const g = new CmdGate()
  assert.equal(g.take({ k: 'next' }, 0), 'now')
  assert.equal(g.take({ k: 'next' }, 10), 'rate')
  assert.equal(g.take({ k: 'pause' }, RATE.playMs), 'now')
})

test('a dragged slider: the latest value wins, at a steady pace', () => {
  const g = new CmdGate()
  assert.equal(g.take({ k: 'level', v: 0.3 }, 0), 'now')
  assert.equal(g.take({ k: 'level', v: 0.4 }, 50), 'later')
  assert.equal(g.take({ k: 'level', v: 0.5 }, 100), 'later')
  assert.deepEqual(g.due(200), [])
  assert.deepEqual(g.due(RATE.smoothMs), [{ k: 'level', v: 0.5 }])
  assert.deepEqual(g.due(RATE.smoothMs + 10), [])
  // Knob and strokes are separate lanes.
  assert.equal(g.take({ k: 'stroke', spm: 60, depth: 0.5 }, 260), 'now')
})

test('stopping the strokes is never held back', () => {
  const g = new CmdGate()
  assert.equal(g.take({ k: 'stroke', spm: 60, depth: 0.5 }, 0), 'now')
  assert.equal(g.take({ k: 'stroke', spm: 90, depth: 0.5 }, 10), 'later')
  assert.equal(g.take({ k: 'strokeStop' }, 20), 'now')
  // The pending speed-up was dropped: it doesn't restart the strokes.
  assert.deepEqual(g.due(1000), [])
})

test('a flood is refused, then lets up', () => {
  const g = new CmdGate()
  const results = Array.from({ length: 40 }, (_, i) => g.take({ k: 'level', v: 0.5 }, i))
  assert.equal(results.filter(r => r === 'rate').length, 40 - RATE.burst)
  assert.notEqual(g.take({ k: 'level', v: 0.5 }, RATE.windowMs + 50), 'rate')
  g.clear()
  assert.deepEqual(g.due(1e6), [])
})

test('the window limiter', () => {
  const ok = createWindow(3, 1000)
  assert.deepEqual([ok(0), ok(1), ok(2), ok(3)], [true, true, true, false])
  assert.equal(ok(1000), true)
})

test('the slider throttle sends at a pace and always sends the last value', async () => {
  let clock = 0
  const sent: number[] = []
  const th = createThrottle<number>(v => sent.push(v), 100, () => clock)
  th.push(1)
  clock = 10
  th.push(2)
  clock = 20
  th.push(3)
  assert.deepEqual(sent, [1])
  clock = 200
  await new Promise(r => setTimeout(r, 120))
  assert.deepEqual(sent, [1, 3])
  // Long after the last send: the next goes at once.
  clock = 400
  th.push(4)
  assert.deepEqual(sent, [1, 3, 4])
  th.cancel()
})

// ─── The knob comes back ──────────────────────────────────────────────────

test('the knob goes back to where the owner had it', () => {
  const k = new KnobWatch(0.4)
  k.expect(0.4, 0.7)
  k.seen(0.45)
  k.seen(0.7)
  assert.equal(k.restoreTo(0.7, 'lost'), 0.4)
  assert.equal(k.restoreTo(0.7, 'taken'), 0.4)
})

test('untouched by the partner: nothing to restore', () => {
  assert.equal(new KnobWatch(0.4).restoreTo(0.4, 'lost'), null)
})

test('the owner turned it themselves: it stays where they put it', () => {
  const k = new KnobWatch(0.4)
  k.expect(0.4, 0.7)
  k.seen(0.5)
  k.seen(0.2)
  assert.equal(k.touched, true)
  assert.equal(k.restoreTo(0.2, 'lost'), null)
})

test('after a panic only down, never up', () => {
  const up = new KnobWatch(0.4)
  up.expect(0.4, 0.8)
  assert.equal(up.restoreTo(0.8, 'panic'), 0.4)
  const down = new KnobWatch(0.8)
  down.expect(0.8, 0.3)
  assert.equal(down.restoreTo(0.3, 'panic'), null)
  assert.equal(down.restoreTo(0.3, 'lost'), 0.8)
})
