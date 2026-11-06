import type { Together, View } from './session'
import type { PluginContext } from './types'
import { EMOJI_NAMES, EMOJIS } from './emoji'
import { strategyName } from './session'

/**
 * The panel in the drawer. Built from the session's view: the layout is
 * rebuilt only when what it shows changes shape (a new phase, a notice, the
 * verification state…); live numbers (latency, drift) are updated in place,
 * so a button never disappears from under the pointer.
 */

type Kid = Node | string | null | undefined | false

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false)
      continue
    if (k === 'class')
      el.className = String(v)
    else if (k === 'text')
      el.textContent = String(v)
    else if (k === 'value')
      (el as HTMLInputElement).value = String(v)
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2), v as EventListener)
    else
      el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const k of kids) {
    if (k)
      el.append(k)
  }
  return el
}

const ms = (s: number) => `${Math.round(s * 1000)} ms`

/** The guest's state in words: what the guest sees, and what the host sees about the guest. */
function guestLine(v: View): { text: string, s: 'ok' | 'busy' | 'warn' | 'bad' } {
  const title = v.video?.title ?? 'it'
  if (v.role === 'guest') {
    if (v.panicked)
      return { text: 'Panic is on here. Not following until you turn it off.', s: 'bad' }
    if (v.hold)
      return { text: v.hostPlaying ? 'You paused. Your partner is still playing.' : 'You\'re playing on your own. Your partner is paused.', s: 'warn' }
    switch (v.follow) {
      case 'nothing': return { text: 'Your partner hasn\'t put anything on yet.', s: 'busy' }
      case 'loading': return { text: `Putting on ${title}…`, s: 'busy' }
      case 'missing': return { text: `Your partner is playing ${title} — you don't have it.`, s: 'warn' }
      case 'borrowed': return { text: 'Playing their script over your video.', s: 'ok' }
      case 'matched': return { text: 'In step with your partner.', s: 'ok' }
    }
  }
  switch (v.guestStatus) {
    case null:
    case 'nothing': return { text: v.video ? 'Your partner is getting ready…' : 'Put on a video: your partner\'s app follows.', s: 'busy' }
    case 'loading': return { text: 'Your partner is putting it on…', s: 'busy' }
    case 'matched': return { text: 'Your partner is in step.', s: 'ok' }
    case 'missing': return { text: 'Your partner doesn\'t have this video. They can use your script.', s: 'warn' }
    case 'borrowed': return { text: 'Your partner is playing your script over their own video.', s: 'ok' }
    case 'hold': return { text: 'Your partner paused on their side.', s: 'warn' }
    case 'panic': return { text: 'Your partner hit panic.', s: 'bad' }
  }
}

/** What decides the layout; the rest is filled in place. */
function shapeOf(v: View): string {
  const g = guestLine(v)
  return JSON.stringify([v.phase, v.role, v.code, v.notice, v.emojis, v.verifiedHere, v.verifiedThere, v.control, v.video?.title, v.hostPlaying, g.text, v.fetchingScript, v.panicked])
}

export function mountPanel(el: HTMLElement, t: Together, ctx: PluginContext): () => void {
  const root = h('div', { class: 'p2g' })
  el.append(root)
  let shape = ''
  const live: { rtt?: HTMLElement, drift?: HTMLElement } = {}
  let codeDraft = ''

  function render() {
    const v = t.view
    const next = shapeOf(v)
    if (next !== shape) {
      shape = next
      const input = root.querySelector<HTMLInputElement>('.p2g-code-in')
      if (input)
        codeDraft = input.value
      root.replaceChildren(...build(v))
    }
    if (live.rtt)
      live.rtt.textContent = v.rttMs === null ? '…' : `${v.rttMs} ms`
    if (live.drift)
      live.drift.textContent = v.driftS === null ? '' : `off by ${ms(Math.abs(v.driftS))}`
    if (t.focusJoin) {
      t.focusJoin = false
      root.querySelector<HTMLInputElement>('.p2g-code-in')?.focus()
    }
  }

  function noticeEl(v: View) {
    return v.notice ? h('div', { 'class': 'p2g-note', 'data-tone': v.notice.tone, 'role': v.notice.tone === 'error' ? 'alert' : 'status' }, v.notice.text) : null
  }

  function leaveBtn(label = 'Leave') {
    return h('button', { class: 'p2g-btn', onclick: () => void t.leave() }, label)
  }

  function build(v: View): Node[] {
    live.rtt = undefined
    live.drift = undefined
    const kids = v.phase === 'idle' ? buildIdle(v) : v.phase === 'connected' ? buildConnected(v) : buildWaiting(v)
    return kids.filter((k): k is Node => k instanceof Node)
  }

  function buildIdle(v: View): Kid[] {
    const input = h('input', {
      'class': 'p2g-in p2g-code-in',
      'placeholder': 'velvet-otter-4271',
      'aria-label': 'Room code',
      'spellcheck': 'false',
      'autocomplete': 'off',
      'value': codeDraft,
      'onkeydown': (e: KeyboardEvent) => {
        if (e.key === 'Enter')
          void join()
      },
    })
    const join = async () => {
      codeDraft = input.value
      if (await t.join(input.value))
        codeDraft = ''
    }
    return [
      h('p', { class: 'p2g-lead' }, 'Watch and play in sync with someone, each with your own playhound and device.'),
      h('button', { class: 'p2g-btn p2g-primary p2g-wide', onclick: () => void t.invite() }, 'Invite'),
      h('div', { class: 'p2g-or' }, h('span', {}, 'or join with a code')),
      h('div', { class: 'p2g-row' }, input, h('button', { class: 'p2g-btn', onclick: () => void join() }, 'Join')),
      noticeEl(v),
      h('p', { class: 'p2g-fine' }, 'The connection goes straight between your two apps, encrypted. Your partner can see your IP address.'),
    ]
  }

  function codeBox(v: View) {
    const copy = h('button', {
      class: 'p2g-btn',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(v.code ?? '')
          copy.textContent = 'Copied'
          setTimeout(() => {
            copy.textContent = 'Copy'
          }, 1500)
        }
        catch {
          ctx.ui.toast('Couldn\'t copy. Select the code and copy it by hand.')
        }
      },
    }, 'Copy')
    return h('div', { class: 'p2g-codebox' }, h('code', { class: 'p2g-code', tabindex: '0' }, v.code ?? ''), copy)
  }

  function buildWaiting(v: View): Kid[] {
    const out: Kid[] = []
    if (v.role === 'host') {
      out.push(h('p', { class: 'p2g-lead' }, 'Send this code to your partner. They paste it under Join.'))
      out.push(codeBox(v))
    }
    else {
      out.push(h('p', { class: 'p2g-lead' }, v.phase === 'lost' ? 'Your room' : 'Joining room'), h('div', { class: 'p2g-codebox' }, h('code', { class: 'p2g-code' }, v.code ?? '')))
    }
    const waitText = v.phase === 'lost'
      ? 'Waiting for your partner to come back…'
      : v.phase === 'starting'
        ? 'Opening the room…'
        : v.role === 'host' ? 'Waiting for your partner to join…' : 'Looking for your partner…'
    out.push(h('div', { class: 'p2g-status' }, h('i', { 'class': 'p2g-dot', 'data-s': v.phase === 'lost' ? 'warn' : 'busy' }), waitText))
    out.push(noticeEl(v))
    out.push(h('div', { class: 'p2g-row p2g-end' }, h('span', { class: 'p2g-fine p2g-grow' }, `Through ${strategyName(v.strategy ?? 'nostr')}`), leaveBtn(v.role === 'host' ? 'Close room' : v.phase === 'lost' ? 'Leave' : 'Cancel')))
    return out
  }

  function verifyCard(v: View) {
    if (!v.emojis)
      return h('div', { class: 'p2g-card' }, h('div', { class: 'p2g-fine' }, 'Working out the check emojis…'))
    const names = v.emojis.map(e => EMOJI_NAMES[EMOJIS.indexOf(e)] ?? e).join(', ')
    const both = v.verifiedHere && v.verifiedThere
    const badge = both
      ? h('span', { 'class': 'p2g-badge', 'data-s': 'ok' }, 'Verified')
      : v.verifiedHere
        ? h('span', { 'class': 'p2g-badge', 'data-s': 'busy' }, 'Waiting for your partner to confirm')
        : h('span', { 'class': 'p2g-badge', 'data-s': 'warn' }, 'Not verified')
    return h('div', { class: 'p2g-card' },
      h('div', { class: 'p2g-row' }, h('span', { class: 'p2g-label p2g-grow' }, 'Check'), badge),
      h('div', { 'class': 'p2g-emojis', 'role': 'img', 'aria-label': names, 'title': names }, ...v.emojis.map(e => h('span', {}, e))),
      both
        ? h('p', { class: 'p2g-fine' }, 'You both saw the same emojis: nobody is in the middle.')
        : h('p', { class: 'p2g-hint' }, 'Compare these with your partner — say them out loud.'),
      !v.verifiedHere && h('button', { class: 'p2g-btn p2g-primary', onclick: () => t.markVerified() }, 'They match'),
      !both && h('p', { class: 'p2g-fine' }, 'If they don\'t match, someone may be listening in between: leave the room.'),
    )
  }

  function playingCard(v: View) {
    const g = guestLine(v)
    const status = h('div', { class: 'p2g-status' }, h('i', { 'class': 'p2g-dot', 'data-s': g.s }), h('span', { class: 'p2g-grow' }, g.text))
    if ((v.role === 'guest' && v.follow === 'matched' && !v.hold) || (v.role === 'host' && v.guestStatus === 'matched')) {
      live.drift = h('span', { class: 'p2g-num' })
      status.append(live.drift)
    }
    const kids: Kid[] = [
      h('div', { class: 'p2g-label' }, 'Now playing'),
      h('div', { class: 'p2g-title' }, v.video ? v.video.title : 'Nothing yet', v.video && h('span', { class: 'p2g-fine' }, v.hostPlaying ? ' · playing' : ' · paused')),
      status,
    ]
    if (v.role === 'guest' && v.follow === 'missing' && !v.hold) {
      kids.push(h('button', { class: 'p2g-btn', disabled: v.fetchingScript, onclick: () => t.requestScript() }, v.fetchingScript ? 'Getting their script…' : 'Use their script'))
      kids.push(h('p', { class: 'p2g-fine' }, 'Their script plays over the video you have open, in step with theirs.'))
    }
    if (v.role === 'guest' && (v.hold || v.panicked))
      kids.push(h('button', { class: 'p2g-btn p2g-primary', disabled: v.panicked, onclick: () => t.catchUp() }, 'Catch up'))
    if (v.role === 'host') {
      const sw = h('input', { 'type': 'checkbox', 'role': 'switch', 'aria-label': 'Let them control playback too' }) as HTMLInputElement
      sw.checked = v.control
      sw.addEventListener('change', () => t.setControl(sw.checked))
      kids.push(h('label', { class: 'p2g-switch' }, sw, 'Let them control playback too'))
    }
    else if (v.control) {
      kids.push(h('p', { class: 'p2g-fine' }, 'You can play, pause and seek for both of you.'))
    }
    return h('div', { class: 'p2g-card' }, ...kids)
  }

  function buildConnected(v: View): Kid[] {
    live.rtt = h('span', { class: 'p2g-num' })
    return [
      h('div', { class: 'p2g-status' },
        h('i', { 'class': 'p2g-dot', 'data-s': 'ok' }),
        h('span', { class: 'p2g-grow' }, v.role === 'host' ? 'Connected · you\'re hosting' : 'Connected · your partner is hosting'),
        live.rtt,
      ),
      noticeEl(v),
      verifyCard(v),
      playingCard(v),
      h('p', { class: 'p2g-fine' }, 'Panic stops your own device, and pauses your partner\'s video. Your speed limit and ranges stay yours.'),
      h('div', { class: 'p2g-row p2g-end' }, h('code', { class: 'p2g-fine p2g-grow' }, v.code ?? ''), leaveBtn()),
    ]
  }

  const off = t.onUpdate(render)
  render()
  return () => {
    off()
    root.remove()
  }
}
