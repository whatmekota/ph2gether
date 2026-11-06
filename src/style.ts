/** Panel CSS. Only the app's CSS custom properties, so it follows the theme. */
export const CSS = `
.p2g { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px; font-size: 12.5px; color: var(--text); }
.p2g * { box-sizing: border-box; }
.p2g p { margin: 0; }
.p2g-lead { color: var(--text-muted); line-height: 1.45; }
.p2g-fine { color: var(--text-faint); font-size: 11.5px; line-height: 1.4; }
.p2g-hint { color: var(--text); line-height: 1.4; }
.p2g-label { color: var(--text-muted); font-size: 11px; font-weight: 600; letter-spacing: .02em; }
.p2g-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.p2g-end { margin-top: 2px; }
.p2g-grow { flex: 1; min-width: 0; }
.p2g-num { font-variant-numeric: tabular-nums; color: var(--text-muted); font-size: 11.5px; white-space: nowrap; }
.p2g-btn { height: 28px; padding: 0 12px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-strong); background: var(--bg-800); color: var(--text); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; transition: background var(--dur-fast, 120ms), border-color var(--dur-fast, 120ms); align-self: flex-start; }
.p2g-btn:hover { background: var(--bg-700); }
.p2g-btn:focus-visible, .p2g-in:focus-visible, .p2g-code:focus-visible, .p2g-switch input:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-soft); border-color: var(--accent); }
.p2g-btn:disabled { opacity: .5; cursor: default; }
.p2g-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
.p2g-primary:hover { background: var(--accent-strong); }
.p2g-wide { align-self: stretch; height: 32px; }
.p2g-in { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-strong); background: var(--bg-900); color: var(--text); font: inherit; font-family: var(--font-mono, ui-monospace, monospace); }
.p2g-in::placeholder { color: var(--text-faint); }
.p2g-or { display: flex; align-items: center; gap: 8px; color: var(--text-faint); font-size: 11px; }
.p2g-or::before, .p2g-or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.p2g-codebox { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 10px; border-radius: var(--radius-md, 10px); background: var(--bg-850); border: 1px solid var(--border); }
.p2g-code { flex: 1; min-width: 0; font-family: var(--font-mono, ui-monospace, monospace); font-size: 14px; font-weight: 600; color: var(--text); user-select: all; overflow-wrap: anywhere; border-radius: 4px; }
.p2g-status { display: flex; align-items: center; gap: 7px; color: var(--text-muted); line-height: 1.4; }
.p2g-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); flex: none; }
.p2g-dot[data-s=ok] { background: var(--ok); }
.p2g-dot[data-s=busy] { background: var(--info); animation: p2g-pulse 1.4s ease-in-out infinite; }
.p2g-dot[data-s=warn] { background: var(--warn); }
.p2g-dot[data-s=bad] { background: var(--danger); }
@keyframes p2g-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .p2g-dot[data-s=busy] { animation: none; } }
.p2g-card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--radius-md, 10px); background: var(--bg-850); border: 1px solid var(--border); }
.p2g-title { font-weight: 600; overflow-wrap: anywhere; }
.p2g-emojis { display: flex; justify-content: space-between; gap: 4px; padding: 4px 2px; font-size: 30px; line-height: 1.15; font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif; user-select: none; }
.p2g-emojis span { flex: 1; text-align: center; }
.p2g-badge { padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; background: var(--bg-700); color: var(--text-muted); }
.p2g-badge[data-s=ok] { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
.p2g-badge[data-s=warn] { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.p2g-badge[data-s=busy] { background: color-mix(in srgb, var(--info) 18%, transparent); color: var(--info); }
.p2g-note { padding: 8px 10px; border-radius: var(--radius-sm, 6px); line-height: 1.4; background: var(--bg-850); border: 1px solid var(--border); color: var(--text-muted); }
.p2g-note[data-tone=warn] { border-color: color-mix(in srgb, var(--warn) 45%, transparent); color: var(--text); }
.p2g-note[data-tone=error] { border-color: color-mix(in srgb, var(--danger) 50%, transparent); background: color-mix(in srgb, var(--danger) 8%, var(--bg-850)); color: var(--text); }
.p2g-switch { display: inline-flex; align-items: center; gap: 7px; color: var(--text-muted); cursor: pointer; user-select: none; }
.p2g-switch input { appearance: none; width: 26px; height: 15px; border-radius: 99px; background: var(--bg-600); position: relative; margin: 0; cursor: pointer; flex: none; transition: background var(--dur-fast, 120ms); }
.p2g-switch input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--text); transition: transform var(--dur-fast, 120ms); }
.p2g-switch input:checked { background: var(--accent); }
.p2g-switch input:checked::after { transform: translateX(11px); background: var(--accent-contrast); }
`
