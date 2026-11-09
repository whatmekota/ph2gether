# Changelog

## 0.2.0

Partner control. Needs playhound 2.2, on both sides.

- Hand your partner the controls of your own session: edges and intensity to start with, and if you tick them, what plays and the stroke generator. Either of you can ask or offer; nothing happens until the device's owner says yes. Both of you can control each other at once.
- The partner gets a small remote in the panel, with your session as it is: intensity, what comes through, the edge's countdown, what's playing.
- While someone has control, a pill at the top of the window says who and what, with **Take back**. Also in the panel and the command palette.
- Your limits hold: the intensity ramps and stops at your limit for plugins, strokes stay under your speed ceiling, and turning the knob yourself wins.
- Take back, panic on either side, leaving or a lost connection end it at once. The knob eases back to where you had it, and the stroke generator goes back to your settings, stopped. After a panic the knob only goes down.
- Commands are rate-limited on the receiving side.
- Only in a verified room: the emoji check is the only proof of who you'd be handing it to.
- An older ph2gether on the other side: together mode works as before, and the panel says partner control needs 0.2 on both.
- **Your name, for your partner**, in the settings: what their side calls you.

## 0.1.1

- A chat beside the sync, mostly for swapping links to a video one of you doesn't have.
- Plainer words on both sides about who leads and what follows.
- No more **Use their script**: swap a link in the chat instead.

## 0.1.0

First release. Needs playhound 2.0.

- Invite with a room code, join by pasting it. Two people per room; reconnects after brief drops.
- Direct, encrypted WebRTC between the two apps. Signalling over public Nostr relays, or BitTorrent trackers or MQTT brokers (settings).
- Five verification emojis from both connection certificates, to compare out loud.
- The guest follows the host: the same file (found by its content), play, pause, seek and speed. Drift over a quarter of a second is put back.
- No file? Use the host's script over a video of your own.
- Optional shared control: the guest can play, pause and seek for both.
- Panic stays local and pauses your partner too. A dropped connection pauses the guest.
