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

/**
 * `core: 'new'` is playhound 2.2 as it shipped (intensity.restore, lowering
 * during a panic, safety.onResume, playback.next, readout.scriptDriving);
 * 'old' is the API 3 before those.
 */
function fakeApp(core: 'new' | 'old' = 'new') {
  const calls: string[] = []
  const app = {
    level: 0.4,
    max: 0.8,
    panicked: false,
    knobFns: new Set<(v: number) => void>(),
    resumeFns: new Set<() => void>(),
    motion: null as null | { active: boolean, spm: number, depth: number },
    playing: false,
    hasScript: false,
    /** Like core: where the knob was before this plugin first moved it, and where it last sent it. */
    mark: null as null | { level: number, left: number },
    /** Make restore() answer this instead (to stand for core's own idea of "before"). */
    restoreSays: undefined as undefined | number | null,
    nextSays: false,
  }
  const setLevel = (v: number) => {
    app.level = v
    for (const f of app.knobFns) f(v)
  }
  const lift = () => {
    app.panicked = false
    for (const f of app.resumeFns) f()
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
        // Like playhound: held to the limit (here it lands at once). During a
        // panic, the old core moves nothing; the new one lowers only.
        set: (v: number, ceiling = app.max) => {
          calls.push(`set:${v}`)
          const to = Math.max(0.1, Math.min(ceiling, v))
          if (core === 'new') {
            if (!app.mark || Math.abs(app.level - app.mark.left) > 0.004)
              app.mark = { level: app.level, left: to }
            else
              app.mark.left = to
          }
          if (app.panicked) {
            if (core === 'new' && to < app.level)
              setLevel(to)
            return app.level
          }
          setLevel(to)
          return to
        },
        ...(core === 'new'
          ? {
              restore: () => {
                calls.push('restore')
                const mark = app.mark
                app.mark = null
                if (app.restoreSays !== undefined) {
                  if (app.restoreSays !== null)
                    setLevel(app.restoreSays)
                  return app.restoreSays
                }
                if (!mark || Math.abs(app.level - mark.left) > 0.004)
                  return null
                if (app.panicked && mark.level > app.level)
                  return app.level
                setLevel(mark.level)
                return mark.level
              },
            }
          : {}),
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
      readout: () => ({
        spm: app.motion?.spm ?? 0,
        depth: app.motion?.depth ?? 0,
        pos: 0,
        maxSpm: 150,
        device: false,
        phase: null,
        nextStrokeInMs: null,
        ...(core === 'new' ? { scriptDriving: app.playing && app.hasScript } : {}),
      }),
    },
    player: {
      state: () => ({ playing: app.playing, title: 'a.mp4', time: 0, duration: 60, hasScript: app.hasScript, rate: 1 }),
      clock: () => 0,
      onChange: () => () => {},
    },
    safety: {
      panicked: () => app.panicked,
      onPanic: () => () => {},
      ...(core === 'new'
        ? {
            onResume: (fn: () => void) => {
              app.resumeFns.add(fn)
              return () => app.resumeFns.delete(fn)
            },
          }
        : {}),
    },
    playback: {
      pause: () => calls.push('pause'),
      resume: () => calls.push('resume'),
      play: async (id: string) => (calls.push(`play:${id}`), true),
      ...(core === 'new' ? { next: async () => (calls.push('next'), app.nextSays) } : {}),
    },
    library: { list: async () => [{ id: 'a.mp4', title: 'a', hasScript: true, durationS: 60 }, { id: 'b.mp4', title: 'b', hasScript: true, durationS: 90 }, { id: 'c.mp4', title: 'c', hasScript: false, durationS: 5 }] },
  } as unknown as PluginContext
  return { app, ctx, calls, setLevel, lift }
}

/** A Together connected to a partner, in a verified room, both on partner control. */
function connected(role: 'host' | 'guest' = 'host', core: 'new' | 'old' = 'new') {
  const f = fakeApp(core)
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

test('panic takes it back at once, and the knob comes down at once', () => {
  const c = connected()
  const id = grant(c, ['intensity', 'stroke'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.app.panicked = true
  c.t.onLocalPanic()
  assert.equal(c.t.view.mine.p, 'off')
  assert.ok(c.sent.some(m => m.t === 'pcEnd' && m.why === 'panic'))
  assert.ok(c.sent.some(m => m.t === 'panic'))
  assert.ok(c.calls.includes('restore'))
  assert.equal(c.app.level, 0.4)
})

test('panic after the partner lowered the knob: it stays down', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.2 } })
  c.app.panicked = true
  c.t.onLocalPanic()
  assert.equal(c.app.level, 0.2)
  c.lift()
  assert.equal(c.app.level, 0.2)
})

test('an older playhound: during a panic the knob waits, and comes down once panic is lifted', async () => {
  const c = connected('host', 'old')
  const id = grant(c, ['intensity', 'stroke'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.app.panicked = true
  c.t.onLocalPanic()
  assert.equal(c.t.view.mine.p, 'off')
  // That playhound refuses to move the knob while panicked…
  assert.equal(c.app.level, 0.75)
  c.app.panicked = false
  await new Promise(r => setTimeout(r, 500))
  // …so it comes down after.
  assert.equal(c.app.level, 0.4)
  c.t.dispose()
})

test('an older playhound: take back sets the saved level itself', () => {
  const c = connected('host', 'old')
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.t.takeBack()
  assert.equal(c.app.level, 0.4)
  assert.ok(!c.calls.includes('restore'))
})

test('restore() gives back a level above the limit for plugins', () => {
  const c = connected()
  c.app.level = 1
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.5 } })
  assert.equal(c.app.level, 0.5)
  c.t.takeBack()
  assert.equal(c.app.level, 1)
})

test('restore() saying no while a move was under way: set() covers it', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.app.restoreSays = null
  c.t.takeBack()
  assert.equal(c.app.level, 0.4)
})

test('restore() going back to a level mid-way through a move: corrected to the owner\'s own', () => {
  const c = connected()
  const id = grant(c, ['intensity'])
  c.recv({ t: 'pcCmd', id, c: { k: 'level', v: 0.75 } })
  c.app.restoreSays = 0.55
  c.t.takeBack()
  assert.equal(c.app.level, 0.4)
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

test('strokes wait while a script plays, and the remote is told', () => {
  for (const core of ['new', 'old'] as const) {
    const c = connected('host', core)
    const id = grant(c, ['stroke'])
    c.app.playing = true
    c.app.hasScript = true
    c.recv({ t: 'pcCmd', id, c: { k: 'stroke', spm: 90, depth: 0.6 } })
    // Taken and set: it runs when the script stops.
    assert.equal(c.app.motion?.spm, 90, core)
    c.any.liveSig = ''
    c.any.liveAt = -1e9
    c.any.sendLive(performance.now())
    const live = c.sent.filter(m => m.t === 'pcLive').at(-1)
    assert.equal(live && live.t === 'pcLive' && live.s.script, true, core)
  }
})

test('next: playhound\'s own Next first, the library order when it has nothing', async () => {
  const c = connected('host')
  const id = grant(c, ['playback'])
  c.app.nextSays = true
  c.recv({ t: 'pcCmd', id, c: { k: 'next' } })
  await flush()
  assert.ok(c.calls.includes('next'))
  assert.ok(!c.calls.some(x => x.startsWith('play:')))
  c.app.nextSays = false
  c.any.gate = new (c.any.gate.constructor)()
  c.recv({ t: 'pcCmd', id, c: { k: 'next' } })
  await flush()
  assert.ok(c.calls.includes('play:b.mp4'))
})

test('picking what plays (older playhound): next, and from the list sent', async () => {
  const c = connected('host', 'old')
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
