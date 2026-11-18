import type { PluginAchievement, PluginContext } from './types'

/** ph2gether's own achievements, in playhound's Stats → Achievements. */
export const AWARDS: PluginAchievement[] = [
  { id: 'together', title: 'Together', description: 'Connect with your partner', icon: '💞' },
  { id: 'verified', title: 'It\'s really you', description: 'Compare the emojis, and both say they match', icon: '🔐' },
  { id: 'hand-over', title: 'In your hands', description: 'Hand your partner the controls of your session', icon: '🤝', tier: 2 },
  { id: 'take-over', title: 'At the controls', description: 'Take the controls of your partner\'s session', icon: '🎮', tier: 2 },
  { id: 'long-night', title: 'A long night', description: 'Stay together for an hour in one room', icon: '🌙', tier: 2 },
  { id: 'regulars', title: 'Regulars', description: 'Get together on 10 different days', icon: '📅', target: 10, tier: 3 },
]

/** How long together in one room earns A long night, ms. */
export const LONG_NIGHT_MS = 60 * 60_000

/** The local calendar day, like 2026-11-18. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Earning them. Never throws: an achievement must not get in the way of the
 * connection or of partner control. The days are kept in the plugin's
 * storage, one at a time.
 */
export class Awards {
  private chain: Promise<void> = Promise.resolve()
  /** Asked for already this run: asking again (every tick, say) costs nothing. */
  private done = new Set<string>()

  constructor(private ctx: Pick<PluginContext, 'achievements' | 'storage' | 'log'>) {}

  define() {
    try {
      this.ctx.achievements.define(AWARDS)
    }
    catch (err) {
      this.ctx.log('could not define achievements', err)
    }
  }

  unlock(id: string) {
    if (this.done.has(id))
      return
    this.done.add(id)
    try {
      this.ctx.achievements.unlock(id)
    }
    catch {}
  }

  /** Together today: counts toward Regulars once a day. Resolves once it is stored and reported. */
  day(at = new Date()): Promise<void> {
    this.chain = this.chain.then(async () => {
      const today = dayKey(at)
      const seen = await this.ctx.storage.get<{ last?: string, days?: number }>('days')
      if (seen?.last === today)
        return
      const days = (seen?.days ?? 0) + 1
      await this.ctx.storage.set('days', { last: today, days })
      this.ctx.achievements.progress('regulars', days)
    }).catch(() => {})
    return this.chain
  }
}
