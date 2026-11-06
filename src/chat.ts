/**
 * The little chat beside the sync: mostly for swapping links to videos.
 *
 * Text only. What the partner sends is never put into the page as HTML: it's
 * split into plain text and links here, and the panel builds text nodes and
 * anchors from that.
 */

export interface ChatLine {
  from: 'me' | 'them'
  text: string
  /** When it was sent or received, Date.now(). */
  at: number
}

/** Longest message, in characters. A long link fits; an essay doesn't. */
export const CHAT_MAX = 1000
/** Lines kept; older ones drop off the top. */
export const CHAT_KEEP = 200

export type ChatPart = { kind: 'text', text: string } | { kind: 'link', text: string, href: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi
/** Punctuation that usually ends a sentence rather than the link. */
const TRAILING = /[.,;:!?)\]}]+$/

/** The message as plain text and http(s) links. */
export function splitLinks(text: string): ChatPart[] {
  const parts: ChatPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]
    const trail = url.match(TRAILING)?.[0] ?? ''
    // Keep a closing bracket that has its opening one inside the link (wiki-style URLs).
    const keep = trail.startsWith(')') && url.includes('(') ? 1 : 0
    if (trail.length > keep)
      url = url.slice(0, url.length - (trail.length - keep))
    const start = m.index ?? 0
    if (start > last)
      parts.push({ kind: 'text', text: text.slice(last, start) })
    parts.push({ kind: 'link', text: url, href: url })
    last = start + url.length
  }
  if (last < text.length)
    parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

/** A message as it should go out: trimmed, not empty, not too long. Null when there's nothing to send. */
export function cleanChat(text: string): string | null {
  const t = text.replace(/\r\n?/g, '\n').trim()
  if (!t)
    return null
  return t.length > CHAT_MAX ? t.slice(0, CHAT_MAX) : t
}

/**
 * Sending too fast: at most `burst` messages in any `windowMs`. A pasted list
 * of links is fine; a script flooding the other side isn't.
 */
export function createRateLimit(burst = 6, windowMs = 4000) {
  const times: number[] = []
  return (now: number): boolean => {
    while (times.length && now - times[0] > windowMs)
      times.shift()
    if (times.length >= burst)
      return false
    times.push(now)
    return true
  }
}
