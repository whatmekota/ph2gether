import type { Msg } from '../src/protocol.ts'
import type { PluginContext } from '../src/types.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Together } from '../src/session.ts'

/**
 * The owner's side of partner control, end to end inside one app: a fake
 * playhound (the parts of ctx control touches) and a fake partner on the
 * other end of the link.
 */

function fakeApp() {
  const calls: string[] = []
  const app = {
    level: 0.4,
    max: 0.8,
    panicked: false,
    knobFns: new Set<(v: number) => void>(),
    motion: null as null | { active: boolean, spm: number, depth: number },
    playing: false,
    hasScript: false,
  }
  const setLevel = (v: number) => {
    app.level = v
    for (const f of app.knobFns) f(v)
  }
  const ctx = {
    settings: { get: () => undefined, set: () => {}, all: () => ({}), onChange: () => () => {} },
    ui: { toast: (text: string) => calls.push(`toast:${text}`), openPanel: () => {} },
    log: () => {},
    session: {
      edge: () => calls.push('edge'),
      endEdge: () => calls.push('endEdge'),
      edgeState: () => ({ phase: 'idle', remainingSec: 0, holdBack: 0, effective: app.level }),
      onEdge: () => () => {},
      onFinish: () => () => {},
      intensity: {
        get: () => app.level,
        max: () => app.max,
        // Like playhound: held to the limit, refused while panicked (here it lands at once).
        set: (v: number) => {
          calls.push(`set:${v}`)
          if (app.panicked)
            return app.level
          const to = Math.max(0.1, Math.min(app.max, v))
          setLevel(to)
          return to
        },
        onChange: (fn: (v: number) => void) => {
          app.knobFns.add(fn)
          return () => app.knobFns.delete(fn)
        },
      },
    },
    motion: {
      take: () => {
        if (app.panicked)
          return null
        calls.push('take')
        const m = { active: true, spm: 0, depth: 0 }
        app.motion = m
        return {
          get active() {
            return m.active
          },
          set: (t: { spm?: number, depth?: number }) => {
            m.spm = Math.min(150, t.spm ?? m.spm)
            m.depth = t.depth ?? m.depth
          },
          hold: () => {
            m.spm = 0
          },
          release: () => {
            if (m.active)
              calls.push('release')
            m.active = false
          },
        }
      },
      readout: () => ({ spm: app.motion?.spm ?? 0, depth: app.motion?.depth ?? 0, pos: 0, maxSpm: 150, device: false, phase: null, nextStrokeInMs: null }),
    },
    player: {
      state: () => ({ playing: app.playing, title: 'a.mp4', time: 0, duration: 60, hasScript: app.hasScript, rate: 1 }),
      clock: () => 0,
      onChange: () => () => {},
    },
    safety: { panicked: () => app.panicked, onPanic: () => () => {} },
    playback: { pause: () => calls.push('pause'), resume: () => calls.push('resume'), play: async (id: string) => (calls.push(`play:${id}`), true) },
    library: { list: async () => [{ id: 'a.mp4', title: 'a', hasScript: true, durationS: 60 }, { id: 'b.mp4', title: 'b', hasScript: true, durationS: 90 }, { id: 'c.mp4', title: 'c', hasScript: false, durationS: 5 }] },
  } as unknown as PluginContext
  return { app, ctx, calls, setLevel }
}

/** A Together connected to a partner, in a verified room, both on partner control. */
function connected(role: 'host' | 'guest' = 'host') {
  const f = fakeApp()
  const t = new Together(f.ctx)
  const sent: Msg[] = []
  const any = t as any
  any.link = { send: (m: Msg) => sent.push(m), leave: async () => {}, connection: () => undefined, relays: () => ({ open: 1, total: 1 }) }
  any.partner = 'peer'
  any.lastHeardAt = performance.now()
  Object.assign(t.view, { phase: 'connected', role, pc: 1, verifiedHere: true, verifiedThere: true })
  const recv = (m: Msg) => any.onMessage(m, 'peer')
  return { ...f, t, sent, recv, any }
}

const flush = () => new Promise(r => setTimeout(r, 0))

function grant(c: ReturnType<typeof connected>, powers: ('edge' | 'intensity' | 'playback' | 'stroke')[]) {
  c.recv({ t: 'pcAsk', powers })
  assert.equal(c.t.view.mine.p, 'asked')
  c.t.allowControl(powers)
  const s = c.t.view.mine
  assert.equal(s.p, 'granted')
  return s.p === 'granted' ? s.id : ''
}

test('nothing happens to the session before the owner says yes', () => {
  const c = connected()
  c.recv({ t: 'pcAsk', powers: ['edge', 'intensity'] })
  c.recv({ t: 'pcCmd', id: 'gwhatever', c: { k: 'edge' } })
  c.recv({ t: 'pcCmd', id: 'gwhatever', c: { k: 'level', v: 0.8 } })
  assert.ok(!c.calls.includes('edge'))
  assert.equal(c.app.level, 0.4)
})

test('granted commands reach the session; ungranted ones are refused', () => {
  const c = connected()
  const id = grant(c, ['edge', 'intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'edge' } })
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.7 } })
  assert.ok(c.calls.includes('edge'))
  assert.equal(c.app.level, 0.7)
  c.recv({ t: 'pcCmd', id, c: { k: 'stroke', spm: 100, depth: 0.5 } })
  assert.ok(!c.calls.includes('take'))
  assert.ok(c.sent.some(m => m.t === 'pcNo' && m.why === 'power'))
  // Its live state went out.
  assert.ok(c.sent.some(m => m.t === 'pcLive' && m.id === id))
})

test('take back: the knob eases back to the owner\'s own, strokes released', () => {
  const c = connected()
  const id = grant(c, ['intensity', 'stroke'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.recv({ t: 'pcCmd', id, c: { k: 'stroke', spm: 90, depth: 0.6 } })
  assert.equal(c.app.motion?.spm, 90)
  c.t.takeBack()
  assert.equal(c.t.view.mine.p, 'off')
  assert.equal(c.app.level, 0.4)
  assert.ok(c.calls.includes('release'))
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.why === 'taken'))
  // And commands after that do nothing.
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.8 } })
  assert.equal(c.app.level, 0.4)
})

test('a lost connection ends control and eases back', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.any.onPeerLeave('peer')
  assert.equal(c.t.view.mine.p, 'off')
  assert.equal(c.app.level, 0.4)
})

test('silence counts as a lost connection too', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.any.lastHeardAt = performance.now() - 10_000
  c.any.tick()
  assert.equal(c.t.view.mine.p, 'off')
  assert.equal(c.app.level, 0.4)
  // When it comes back, the partner is told the grant is over.
  c.sent.length = 0
  c.recv({ t: 'ping', a: 1 })
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.id === id))
})

test('the owner turning the knob: it stays where they put it', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.setLevel(0.2) // by hand
  c.t.takeBack()
  assert.equal(c.app.level, 0.2)
})

test('panic takes it back at once; the knob comes down once panic is lifted', async () => {
  const c = connected()
  const id = grant(c, ['intensity', 'stroke'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.app.panicked = true
  c.t.onLocalPanic()
  assert.equal(c.t.view.mine.p, 'off')
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.why === 'panic'))
  assert.ok(c.sent.some(m => m.t === 'panic'))
  // playhound refuses to move the knob while panicked…
  assert.equal(c.app.level, 0.75)
  c.app.panicked = false
  await new Promise(r => setTimeout(r, 500))
  // …so it comes down after.
  assert.equal(c.app.level, 0.4)
  c.t.dispose()
})

test('the partner\'s panic ends control both ways', () => {
  const c = connected()
  grant(c, ['edge'])
  c.recv({ t: 'pcGrant', id: 'gtheirs1', powers: ['edge'] }) // unasked: handed back
  c.t.askControl(['edge'])
  c.recv({ t: 'pcGrant', id: 'gtheirs2', powers: ['edge'] })
  assert.equal(c.t.view.theirs.p, 'granted')
  c.recv({ t: 'panic' })
  assert.equal(c.t.view.mine.p, 'off')
  assert.equal(c.t.view.theirs.p, 'off')
})

test('a flood of commands is limited', () => {
  const c = connected()
  const id = grant(c, ['edge'])
  for (let i = 0; i < 30; i++)
    c.recv({ t: 'pcCmd', id, c: { k: 'edge' } })
  assert.equal(c.calls.filter(x => x === 'edge').length, 1)
  assert.equal(c.sent.filter(m => m.t === 'pcNo' && m.why === 'rate').length, 1)
})

test('asks are limited too', () => {
  const c = connected()
  for (let i = 0; i < 10; i++) {
    c.recv({ t: 'pcAsk', powers: ['edge'] })
    c.t.refuseControl()
  }
  assert.equal(c.sent.filter(m => m.t === 'pcEnd' && m.why === 'no').length, 3)
})

test('strokes wait while a script plays', () => {
  const c = connected()
  const id = grant(c, ['stroke'])
  c.app.playing = true
  c.app.hasScript = true
  c.recv({ t: 'pcCmd', id, c: { k: 'stroke', spm: 90, depth: 0.6 } })
  assert.ok(!c.calls.includes('take'))
  assert.ok(c.sent.some(m => m.t === 'pcNo' && m.why === 'script'))
})

test('picking what plays: next, and from the list sent', async () => {
  const c = connected('host')
  const id = grant(c, ['playback'])
  await flush()
  const lib = c.sent.find(m => m.t === 'pcLib')
  assert.deepEqual(lib && lib.t === 'pcLib' && lib.items, [{ title: 'a', dur: 60 }, { title: 'b', dur: 90 }])
  c.recv({ t: 'pcCmd', id, c: { k: 'next' } })
  await flush()
  assert.ok(c.calls.includes('play:b.mp4'))
  c.any.gate = new (c.any.gate.constructor)()
  c.recv({ t: 'pcCmd', id, c: { k: 'pick', i: 0 } })
  await flush()
  assert.ok(c.calls.includes('play:a.mp4'))
})

test('a guest can\'t grant what plays: the host leads it', () => {
  const c = connected('guest')
  c.recv({ t: 'pcAsk', powers: ['edge', 'playback'] })
  c.t.allowControl(['edge', 'playback'])
  const s = c.t.view.mine
  assert.deepEqual(s.p === 'granted' && s.powers, ['edge'])
})

test('an older partner: control messages are ignored', () => {
  const c = connected()
  c.t.view.pc = 0
  c.recv({ t: 'pcAsk', powers: ['edge'] })
  assert.equal(c.t.view.mine.p, 'off')
})

test('the hello says which version of control we speak', () => {
  const c = connected()
  c.any.partner = null
  c.recv({ t: 'hello', v: 1, role: 'guest', app: '0.1.1' })
  assert.equal(c.t.view.pc, 0)
  const hello = c.sent.find(m => m.t === 'hello')
  assert.equal(hello && hello.t === 'hello' && hello.pc, 1)
  c.any.partner = null
  c.recv({ t: 'hello', v: 1, role: 'guest', app: '9.0.0', pc: 5, name: 'Sam' })
  assert.equal(c.t.view.pc, 1)
  assert.equal(c.t.view.partnerName, 'Sam')
})

test('unverified: an ask is answered no, and nothing is granted', () => {
  const c = connected()
  c.t.view.verifiedThere = false
  c.recv({ t: 'pcAsk', powers: ['edge'] })
  assert.equal(c.t.view.mine.p, 'off')
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.why === 'unverified'))
})

test('leaving the room ends control with a word', async () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  await c.t.leave()
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.why === 'off'))
  assert.equal(c.app.level, 0.4)
})
