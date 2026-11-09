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
.p2g-lead-box { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--radius-md, 10px); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); background: color-mix(in srgb, var(--accent) 9%, var(--bg-850)); line-height: 1.4; }
.p2g-lead-box b { color: var(--accent-light, var(--accent)); font-weight: 650; }
.p2g-lead-box span { color: var(--text-muted); }
.p2g-chat-log { display: flex; flex-direction: column; gap: 6px; max-height: 220px; min-height: 44px; overflow-y: auto; overscroll-behavior: contain; padding: 2px; }
.p2g-chat-empty { padding: 4px 2px; }
.p2g-msg { display: flex; flex-direction: column; gap: 1px; max-width: 88%; padding: 5px 9px 6px; border-radius: 10px; border-bottom-left-radius: 3px; background: var(--bg-800); align-self: flex-start; }
.p2g-msg[data-from=me] { align-self: flex-end; background: color-mix(in srgb, var(--accent) 22%, var(--bg-800)); border-bottom-left-radius: 10px; border-bottom-right-radius: 3px; }
.p2g-msg-who { font-size: 10.5px; font-weight: 600; color: var(--text-faint); }
.p2g-msg[data-from=me] .p2g-msg-who { color: var(--accent-light, var(--accent)); text-align: right; }
.p2g-msg-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; user-select: text; }
.p2g-msg-text a { color: var(--accent-light, var(--accent)); text-decoration: underline; text-underline-offset: 2px; }
.p2g-chat-in { font-family: inherit; }
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
.p2g-sub { margin-top: 2px; color: var(--text-faint); font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.p2g-control[data-owned] { border-color: color-mix(in srgb, var(--warn) 55%, transparent); }
.p2g-owned { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--radius-md, 10px); border: 1px solid color-mix(in srgb, var(--warn) 55%, transparent); background: color-mix(in srgb, var(--warn) 10%, var(--bg-850)); }
.p2g-owned-head { display: flex; align-items: center; gap: 7px; }
.p2g-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 25%, transparent); animation: p2g-pulse 1.6s ease-in-out infinite; }
.p2g-ask { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--radius-md, 10px); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 8%, var(--bg-850)); }
.p2g-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.p2g-chip { padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; background: var(--bg-700); color: var(--text); }
.p2g-take { background: var(--warn); border-color: var(--warn); color: #111; font-weight: 650; }
.p2g-take:hover { background: color-mix(in srgb, var(--warn) 85%, #fff); }
.p2g-powers { display: flex; flex-direction: column; gap: 6px; }
.p2g-power { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.p2g-power input { margin: 2px 0 0; accent-color: var(--accent); flex: none; }
.p2g-power-text { display: flex; flex-direction: column; gap: 1px; line-height: 1.35; }
.p2g-tag { align-self: flex-start; padding: 0 6px; border-radius: 99px; font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--info) 18%, transparent); color: var(--info); }
.p2g-stat { display: flex; align-items: baseline; gap: 6px; color: var(--text-muted); }
.p2g-stat .p2g-num { color: var(--text); white-space: normal; text-align: right; overflow-wrap: anywhere; }
.p2g-slider { display: grid; grid-template-columns: 62px 1fr 52px; align-items: center; gap: 8px; }
.p2g-slider .p2g-num { text-align: right; }
.p2g-range { width: 100%; accent-color: var(--accent); margin: 0; }
.p2g-select { font-family: inherit; }
.p2g-refused { color: var(--warn); min-height: 0; }
.p2g-refused:empty { display: none; }
.p2g-pill { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 2147483000; display: flex; align-items: center; gap: 9px; max-width: calc(100vw - 32px); padding: 6px 6px 6px 12px; border-radius: 99px; font-size: 12.5px; color: var(--text); background: color-mix(in srgb, var(--warn) 16%, var(--bg-900, #111)); border: 1px solid color-mix(in srgb, var(--warn) 60%, transparent); box-shadow: 0 6px 24px rgb(0 0 0 / .35); }
.p2g-pill[data-s=asked] { background: color-mix(in srgb, var(--accent) 16%, var(--bg-900, #111)); border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
.p2g-pill-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p2g-pill-text span { color: var(--text-muted); }
.p2g-pill-btn { height: 26px; padding: 0 12px; border-radius: 99px; border: 0; font: inherit; font-weight: 650; cursor: pointer; background: var(--warn); color: #111; flex: none; }
.p2g-pill[data-s=asked] .p2g-pill-btn { background: var(--accent); color: var(--accent-contrast); }
.p2g-pill-btn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .p2g-live-dot { animation: none; } }
`
