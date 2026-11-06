import type { PluginContext } from './types'
import { mountPanel } from './panel'
import { strategyName, Together } from './session'
import { CSS } from './style'

/**
 * ph2gether: together mode. Two people, each with their own playhound and
 * device, watch and play in sync over a direct, encrypted connection. The
 * host leads; the guest's app follows. No server of our own: public relays
 * only pass the encrypted connection offers.
 */

/** The rail button's icon: two linked hearts. */
export const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"><path d="M5.6 12.6C2.9 10.7 1.4 9.1 1.4 7.2c0-1.4 1-2.4 2.3-2.4 1 0 1.6.5 2 1.2.4-.7 1-1.2 2-1.2 1.3 0 2.3 1 2.3 2.4 0 1.9-1.5 3.5-4.4 5.4z"/><path d="M10.4 11.2c2.7-1.9 4.2-3.5 4.2-5.4 0-1.4-1-2.4-2.3-2.4-1 0-1.6.5-2 1.2-.4-.7-1-1.2-2-1.2-.7 0-1.3.3-1.7.8"/></svg>'

export default function activate(ctx: PluginContext) {
  const together = new Together(ctx)

  ctx.ui.style(CSS)
  ctx.ui.settings([
    { type: 'heading', label: 'Connection' },
    {
      key: 'strategy',
      type: 'select',
      label: 'Find each other through',
      hint: 'Public servers that only pass the encrypted connection offers. Applies to rooms you start; the code tells your partner\'s app which one to use. Try another if you can\'t connect.',
      options: [
        { value: 'nostr', label: `${strategyName('nostr')} (default)` },
        { value: 'torrent', label: strategyName('torrent') },
        { value: 'mqtt', label: strategyName('mqtt') },
      ],
      default: 'nostr',
    },
    { type: 'heading', label: 'Playing together' },
    {
      key: 'guestControl',
      type: 'switch',
      label: 'Let my partner control playback',
      hint: 'When you host: they can play, pause and seek for both of you. You can change it in the panel too.',
      default: false,
    },
    {
      key: 'followRate',
      type: 'switch',
      label: 'Match my partner\'s speed',
      hint: 'When you join: play at the host\'s speed. Yours is put back when you leave.',
      default: true,
    },
  ])

  ctx.ui.panel({ title: 'Together', icon: ICON, mount: el => mountPanel(el, together, ctx) })

  ctx.commands.register({
    id: 'invite',
    title: 'Invite partner',
    hint: 'Start a together room and get a code to send',
    icon: ICON,
    async run() {
      ctx.ui.openPanel()
      if (together.view.phase === 'idle')
        await together.invite()
    },
  })
  ctx.commands.register({
    id: 'join',
    title: 'Join partner',
    hint: 'Paste the code your partner sent',
    icon: ICON,
    run() {
      ctx.ui.openPanel()
      if (together.view.phase === 'idle')
        together.requestJoinFocus()
    },
  })
  ctx.commands.register({
    id: 'leave',
    title: 'Leave together mode',
    hint: 'Close the connection to your partner',
    async run() {
      if (together.view.phase === 'idle')
        ctx.ui.toast('You aren\'t in a together room')
      else
        await together.leave()
    },
  })

  const offPanic = ctx.safety.onPanic(() => together.onLocalPanic())

  return () => {
    offPanic()
    together.dispose()
  }
}
