# Changelog

## 0.1.0

First release. Needs playhound 2.0.

- Invite with a room code, join by pasting it. Two people per room; reconnects after brief drops.
- Direct, encrypted WebRTC between the two apps. Signalling over public Nostr relays, or BitTorrent trackers or MQTT brokers (settings).
- Five verification emojis from both connection certificates, to compare out loud.
- The guest follows the host: the same file (found by its content), play, pause, seek and speed. Drift over a quarter of a second is put back.
- No file? Use the host's script over a video of your own.
- Optional shared control: the guest can play, pause and seek for both.
- Panic stays local and pauses your partner too. A dropped connection pauses the guest.
