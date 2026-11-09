import type { Kid } from './dom'
import type { Power } from './protocol'
import type { Together, View } from './session'
import { createThrottle, GENTLE, POWER_HINTS, POWER_NAMES, powersText } from './control'
import { h } from './dom'
import { POWERS } from './protocol'
import { NO_TEXT } from './session'

/**
 * The partner-control card: handing over control of my session, and the
 * remote for theirs. Built when its shape changes (see shapeOf); `update`
 * fills the live numbers in place, so a slider being dragged stays put.
 */

/** What the card remembers between rebuilds: the open picker and its ticks. */
export interface ControlUi {
  pick: 'offer' | 'ask' | null
  offer: Set<Power>
  ask: Set<Power>
  /** Ticks for answering an ask, and the ask they were set up for. */
  allow: Set<Power>
  allowFor: string
  spm: number
  depth: number
}

export function controlUi(): ControlUi {
  return { pick: null, offer: new Set(GENTLE), ask: new Set(GENTLE), allow: new Set(GENTLE), allowFor: '', spm: 60, depth: 0.6 }
}

/** What decides the card's layout. */
export function controlShape(v: View): unknown {
  const ready = v.verifiedHere && v.verifiedThere
  return [v.pc, ready, v.partnerName, v.role, v.mine, v.theirs, v.lib?.length ?? null, v.their === null]
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const EDGE_WORDS = { idle: 'none', falling: 'backing off', holding: 'holding', rebuilding: 'easing back' } as const

export function buildControl(v: View, t: Together, ui: ControlUi, rebuild: () => void): { node: HTMLElement, update: (v: View) => void } {
  const name = v.partnerName ?? 'your partner'
  const Name = v.partnerName ?? 'Your partner'
  const ready = t.controlReady()
  const fills: ((v: View) => void)[] = []

  function checklist(set: Set<Power>, allowed: readonly Power[], asked?: readonly Power[]) {
    return h('div', { 'class': 'p2g-powers', 'role': 'group', 'aria-label': 'What they may do' }, ...POWERS.filter(p => allowed.includes(p)).map((p) => {
      const box = h('input', { type: 'checkbox' }) as HTMLInputElement
      box.checked = set.has(p)
      box.addEventListener('change', () => {
        if (box.checked)
          set.add(p)
        else
          set.delete(p)
        rebuild()
      })
      return h('label', { class: 'p2g-power' }, box, h('span', { class: 'p2g-power-text' }, h('b', {}, POWER_NAMES[p]), asked?.includes(p) && !GENTLE.includes(p) ? h('span', { class: 'p2g-tag' }, 'asked for') : null, h('span', { class: 'p2g-fine' }, POWER_HINTS[p])))
    }))
  }

  const btn = (label: string, on: () => void, cls = '', disabled = false) => h('button', { class: `p2g-btn ${cls}`, onclick: on, disabled }, label)

  // ─── My session ───
  function mine(): Kid[] {
    const s = v.mine
    const allowed = t.grantable()
    if (s.p === 'granted') {
      return [h('div', { 'class': 'p2g-owned', 'role': 'status' },
        h('div', { class: 'p2g-owned-head' }, h('i', { class: 'p2g-live-dot' }), h('b', {}, `${Name} is controlling your session`)),
        h('div', { class: 'p2g-chips' }, ...s.powers.map(p => h('span', { class: 'p2g-chip' }, POWER_NAMES[p]))),
        h('button', { class: 'p2g-btn p2g-take p2g-wide', onclick: () => t.takeBack() }, 'Take back control'),
        h('p', { class: 'p2g-fine' }, 'Panic (Esc) takes it back too, and stops everything. Your intensity limit for plugins and your speed ceiling still hold.'),
      )]
    }
    if (s.p === 'asked') {
      const key = s.powers.join()
      if (ui.allowFor !== key) {
        ui.allowFor = key
        ui.allow = new Set(GENTLE.filter(p => s.powers.includes(p)))
        if (!ui.allow.size)
          ui.allow = new Set(GENTLE)
      }
      const picked = POWERS.filter(p => ui.allow.has(p) && allowed.includes(p))
      return [h('div', { 'class': 'p2g-ask', 'role': 'alert' },
        h('b', {}, `${Name} asks to control your session`),
        h('p', { class: 'p2g-fine' }, `They asked for: ${powersText(s.powers)}. Tick what you allow.`),
        checklist(ui.allow, allowed, s.powers),
        h('div', { class: 'p2g-row' }, btn('Allow', () => t.allowControl(picked), 'p2g-primary', !picked.length || !ready), btn('No', () => t.refuseControl())),
      )]
    }
    if (s.p === 'offered') {
      return [h('p', { class: 'p2g-hint' }, `You offered ${name} control of: ${powersText(s.powers)}. Waiting for them to take it.`), btn('Withdraw', () => t.withdrawOffer())]
    }
    if (ui.pick === 'offer') {
      const picked = POWERS.filter(p => ui.offer.has(p) && allowed.includes(p))
      return [
        h('p', { class: 'p2g-hint' }, `What may ${name} do?`),
        checklist(ui.offer, allowed),
        h('div', { class: 'p2g-row' }, btn('Offer', () => {
          ui.pick = null
          t.offerControl(picked)
        }, 'p2g-primary', !picked.length || !ready), btn('Cancel', () => {
          ui.pick = null
          rebuild()
        })),
      ]
    }
    return [h('div', { class: 'p2g-row' },
      h('span', { class: 'p2g-grow p2g-lead' }, `Let ${name} call your edges or turn your intensity.`),
      btn('Hand over…', () => {
        ui.pick = 'offer'
        rebuild()
      }, '', !ready),
    )]
  }

  // ─── Theirs ───
  function theirs(): Kid[] {
    const s = v.theirs
    if (s.p === 'granted')
      return remote(s.powers)
    if (s.p === 'asking')
      return [h('p', { class: 'p2g-hint' }, `Asked. Waiting for ${name} to answer.`), btn('Cancel', () => t.cancelAsk())]
    if (s.p === 'offered') {
      return [h('div', { 'class': 'p2g-ask', 'role': 'alert' },
        h('b', {}, `${Name} offers you control of their session`),
        h('p', { class: 'p2g-fine' }, powersText(s.powers)),
        h('div', { class: 'p2g-row' }, btn('Take it', () => t.acceptOffer(), 'p2g-primary', !ready), btn('No thanks', () => t.passOffer())),
      )]
    }
    if (ui.pick === 'ask') {
      // Asking for playback is pointless when they aren't hosting: it isn't theirs to give.
      const askable = POWERS.filter(p => p !== 'playback' || v.role === 'guest')
      const picked = POWERS.filter(p => ui.ask.has(p) && askable.includes(p))
      return [
        h('p', { class: 'p2g-hint' }, 'Ask for:'),
        checklist(ui.ask, askable),
        h('div', { class: 'p2g-row' }, btn('Ask', () => {
          ui.pick = null
          t.askControl(picked)
        }, 'p2g-primary', !picked.length || !ready), btn('Cancel', () => {
          ui.pick = null
          rebuild()
        })),
      ]
    }
    return [h('div', { class: 'p2g-row' },
      h('span', { class: 'p2g-grow p2g-lead' }, `Ask to call ${name}'s edges or turn their intensity.`),
      btn('Ask…', () => {
        ui.pick = 'ask'
        rebuild()
      }, '', !ready),
    )]
  }

  function slider(min: number, max: number, step: number, value: number, label: string) {
    const el = h('input', { 'type': 'range', 'class': 'p2g-range', min, max, step, 'aria-label': label }) as HTMLInputElement
    el.value = String(value)
    let held = false
    el.addEventListener('pointerdown', () => (held = true))
    el.addEventListener('pointerup', () => (held = false))
    el.addEventListener('blur', () => (held = false))
    return { el, busy: () => held || document.activeElement === el }
  }

  function remote(powers: Power[]): Kid[] {
    const their = v.their
    const out: Kid[] = []
    const stat = (k: string) => {
      const val = h('span', { class: 'p2g-num' })
      out.push(h('div', { class: 'p2g-stat' }, h('span', { class: 'p2g-grow' }, k), val))
      return val
    }
    out.push(h('div', { class: 'p2g-owned-head' }, h('i', { class: 'p2g-live-dot' }), h('b', {}, `You control ${name}'s session`)))
    if (!their)
      out.push(h('p', { class: 'p2g-fine' }, 'Waiting for their first reading…'))
    const sLevel = stat('Intensity')
    const sEff = stat('Comes through')
    const sEdge = stat('Edge')
    const sPlay = stat('Playing')
    fills.push((v) => {
      const x = v.their
      if (!x)
        return
      sLevel.textContent = `${pct(x.level)} · their limit ${pct(x.max)}`
      sEff.textContent = pct(x.eff)
      sEdge.textContent = x.edge === 'idle' ? 'none' : `${EDGE_WORDS[x.edge]}${x.left ? ` · ${x.left} s` : ''}`
      sPlay.textContent = x.panic ? 'Panic' : x.title ? `${x.playing ? '▶' : '❚❚'} ${x.title}` : 'nothing'
    })

    if (powers.includes('edge')) {
      const end = btn('End edge', () => t.command({ k: 'endEdge' }))
      out.push(h('div', { class: 'p2g-row' }, btn('Edge', () => t.command({ k: 'edge' }), 'p2g-primary p2g-grow'), end))
      fills.push((v) => {
        end.disabled = !v.their || v.their.edge === 'idle'
      })
    }
    if (powers.includes('intensity')) {
      const max = their ? Math.round(their.max * 100) : 100
      const s = slider(10, Math.max(10, max), 1, their ? Math.round(their.level * 100) : 50, 'Their intensity')
      const shown = h('span', { class: 'p2g-num' })
      const send = createThrottle<number>(x => t.command({ k: 'level', v: x / 100 }))
      s.el.addEventListener('input', () => {
        shown.textContent = `${s.el.value}%`
        send.push(Number(s.el.value))
      })
      out.push(h('label', { class: 'p2g-slider' }, h('span', { class: 'p2g-label' }, 'Intensity'), s.el, shown))
      fills.push((v) => {
        if (!v.their)
          return
        s.el.max = String(Math.max(10, Math.round(v.their.max * 100)))
        if (!s.busy()) {
          s.el.value = String(Math.round(v.their.level * 100))
          shown.textContent = pct(v.their.level)
        }
      })
    }
    if (powers.includes('playback')) {
      const pp = btn('Pause', () => t.command(t.view.their?.playing ? { k: 'pause' } : { k: 'resume' }))
      out.push(h('div', { class: 'p2g-row' }, pp, btn('Next', () => t.command({ k: 'next' }))))
      fills.push((v) => {
        pp.textContent = v.their?.playing ? 'Pause' : 'Play'
      })
      if (v.lib?.length) {
        const sel = h('select', { 'class': 'p2g-in p2g-select', 'aria-label': 'Their videos' }, ...v.lib.map((it, i) => h('option', { value: String(i) }, it.title))) as HTMLSelectElement
        out.push(h('div', { class: 'p2g-row' }, sel, btn('Play', () => t.command({ k: 'pick', i: Number(sel.value) }))))
      }
      else if (v.lib) {
        out.push(h('p', { class: 'p2g-fine' }, 'They have no scripted videos to pick from.'))
      }
    }
    if (powers.includes('stroke')) {
      const ceiling = their?.maxSpm || 150
      ui.spm = Math.min(ui.spm, ceiling)
      const rate = slider(10, ceiling, 1, ui.spm, 'Stroke rate')
      const depth = slider(10, 100, 1, Math.round(ui.depth * 100), 'Stroke depth')
      const rateTxt = h('span', { class: 'p2g-num' }, `${ui.spm}/min`)
      const depthTxt = h('span', { class: 'p2g-num' }, pct(ui.depth))
      const go = btn('Start strokes', () => {
        if (t.view.their?.stroking)
          t.command({ k: 'strokeStop' })
        else
          t.command({ k: 'stroke', spm: ui.spm, depth: ui.depth })
      })
      const send = createThrottle<null>(() => {
        if (t.view.their?.stroking)
          t.command({ k: 'stroke', spm: ui.spm, depth: ui.depth })
      })
      rate.el.addEventListener('input', () => {
        ui.spm = Number(rate.el.value)
        rateTxt.textContent = `${ui.spm}/min`
        send.push(null)
      })
      depth.el.addEventListener('input', () => {
        ui.depth = Number(depth.el.value) / 100
        depthTxt.textContent = pct(ui.depth)
        send.push(null)
      })
      const note = h('p', { class: 'p2g-fine' })
      out.push(
        h('label', { class: 'p2g-slider' }, h('span', { class: 'p2g-label' }, 'Rate'), rate.el, rateTxt),
        h('label', { class: 'p2g-slider' }, h('span', { class: 'p2g-label' }, 'Depth'), depth.el, depthTxt),
        h('div', { class: 'p2g-row' }, go, note),
      )
      fills.push((v) => {
        const x = v.their
        go.textContent = x?.stroking ? 'Stop strokes' : 'Start strokes'
        go.classList.toggle('p2g-primary', !x?.stroking)
        note.textContent = x?.script ? 'A script is playing at their end: strokes wait for it to stop.' : x ? `Their ceiling: ${x.maxSpm}/min` : ''
        if (x && rate.el.max !== String(x.maxSpm || 150))
          rate.el.max = String(x.maxSpm || 150)
      })
    }
    const refused = h('p', { 'class': 'p2g-fine p2g-refused', 'aria-live': 'polite' })
    out.push(refused)
    fills.push((v) => {
      const r = v.refused
      refused.textContent = r && Date.now() - r.at < 5000 ? NO_TEXT[r.why] : ''
    })
    out.push(btn('Give control back', () => t.letGo()))
    return out
  }

  const kids: Kid[] = [h('div', { class: 'p2g-label' }, 'Partner control')]
  if (v.pc < 1) {
    kids.push(h('p', { class: 'p2g-fine' }, `${Name}'s ph2gether doesn't have partner control. It needs 0.2 or newer on both sides; everything else works as it is.`))
  }
  else {
    if (!(v.verifiedHere && v.verifiedThere))
      kids.push(h('p', { class: 'p2g-note', 'data-tone': 'warn' }, 'Compare the emojis first. Handing over control needs a verified room: otherwise you can\'t be sure who you\'d be handing it to.'))
    kids.push(h('div', { class: 'p2g-sub' }, 'Your session'), ...mine())
    kids.push(h('div', { class: 'p2g-sub' }, `${v.partnerName ? `${v.partnerName}'s` : 'Their'} session`), ...theirs())
  }
  const node = h('div', { 'class': 'p2g-card p2g-control', 'data-owned': v.mine.p === 'granted' ? '' : undefined }, ...kids)
  const update = (v: View) => {
    for (const f of fills)
      f(v)
  }
  update(v)
  return { node, update }
}
