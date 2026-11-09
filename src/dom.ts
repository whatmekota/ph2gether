/** A tiny element builder: text goes in as text, never as HTML. */

export type Kid = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
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
