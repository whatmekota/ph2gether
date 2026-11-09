import type { Together } from './session'
import type { PluginContext } from './types'
import { powersText } from './control'
import { h } from './dom'

/**
 * While a partner controls this session (or asks to), a pill at the top of
 * the window says so, whatever playhound shows and whether the Together
 * panel is open or not, with the one click that takes control back.
 *
 * playhound has no place for a plugin's status outside its panel and the
 * video overlay (which shows only on the full-size player), so the pill is
 * the plugin's own element on the page, removed when the plugin goes.
 */
export function mountIndicator(t: Together, ctx: PluginContext): () => void {
  let el: HTMLElement | null = null
  let sig = ''

  function render() {
    const v = t.view
    const s = v.mine
    const show = v.phase !== 'idle' && (s.p === 'granted' || s.p === 'asked')
    const next = show ? JSON.stringify([s, v.partnerName]) : ''
    if (next === sig)
      return
    sig = next
    el?.remove()
    el = null
    if (!show)
      return
    const name = v.partnerName ?? 'Your partner'
    el = s.p === 'granted'
      ? h('div', { 'class': 'p2g-pill', 'data-s': 'owned', 'role': 'status', 'aria-live': 'polite' },
          h('i', { class: 'p2g-live-dot' }),
          h('span', { class: 'p2g-pill-text' }, h('b', {}, `${name} has control`), h('span', {}, ` · ${powersText(s.powers)}`)),
          h('button', { class: 'p2g-pill-btn', onclick: () => t.takeBack() }, 'Take back'),
        )
      : h('div', { 'class': 'p2g-pill', 'data-s': 'asked', 'role': 'status', 'aria-live': 'polite' },
          h('span', { class: 'p2g-pill-text' }, h('b', {}, `${name} asks to control your session`)),
          h('button', { class: 'p2g-pill-btn', onclick: () => ctx.ui.openPanel() }, 'Answer'),
        )
    document.body.append(el)
  }

  const off = t.onUpdate(render)
  render()
  return () => {
    off()
    el?.remove()
    el = null
  }
}
