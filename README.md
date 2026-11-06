# ph2gether

**18+ only.** Together mode for [playhound](https://github.com/whatmekota/playhound): two people, each with their own playhound and their own device, watch and play in sync over the internet. One of you hosts and picks what plays; the other's app follows: the same video, the same moment, the same pauses and seeks. There's no server of ours in between.

Needs playhound **2.0** or newer, on both sides.

## Install

In playhound: **Settings → Plugins**. Install ph2gether from the plugin list there, then switch it on. To install by hand, download `ph2gether-<version>.zip` from [Releases](https://github.com/whatmekota/ph2gether/releases) and drop it on that page.

It asks to see what plays, play and pause videos, read your library and scripts, and connect to the internet.

## Use it

Open **Together** on the right-hand rail (or **Invite partner** / **Join partner** in the command palette, Ctrl K).

1. **Host:** click **Invite**. You get a room code like `velvet-otter-4271`. Copy it and send it to your partner however you like.
2. **Guest:** paste the code under **Join**.
3. When you're connected, both of you see **five emojis**. Compare them out loud (a call, a voice message). If they're the same, tap **They match**. Once you both have, it says **Verified**.
4. The host puts on a video. The guest's app finds the same file in the guest's library and plays it in step.

A room takes two people; a third who tries the code is turned away. If the connection drops for a moment, it reconnects by itself. **Leave** closes it.

### What follows what

- The host leads: what plays, play and pause, seeks, playback speed. (Following the speed changes the guest's speed setting while you're together, and puts it back when you leave. **Match my partner's speed** in the settings turns it off.)
- The guest's app finds the video by its content, not its name, so it doesn't matter what either of you called the file. If the guest doesn't have it, the panel says so and offers **Use their script**: the host's script plays over whatever video the guest has open, in step with the host. (playhound needs a video open to play a script, so the guest opens any one first. One at least as long as the host's works best.)
- The guest drifting more than a quarter of a second gets put back in place. Pausing by hand puts the guest on hold rather than dragging them along; **Catch up** joins in again.
- With **Let them control playback too** (host), the guest's play, pause and seek go to the host and from there to both.

### Safety stays yours

- **Panic (Esc) stops your own device**, as always. It also tells your partner's app, which pauses their video and tells them you hit panic.
- Nothing your partner sends reaches your device directly, and your speed limit, ranges and every other device setting stay yours. Their app can only play, pause and seek your video, and load a script when you ask for it.
- If the connection drops, the guest's video pauses, so the device stops following.

## Privacy

- **Your two apps talk directly**, over WebRTC, encrypted end to end (DTLS). Playback state, scripts and everything else go straight between you.
- To find each other, the apps use **public signalling servers**: Nostr relays by default, or BitTorrent trackers or MQTT brokers (Settings → Plugins → ph2gether). They carry only the connection offers, and those are **encrypted with a key made from your room code**. They see a hash of the room, not the code; they don't see what you play. They do see your IP address and when you connect, as any server you talk to does.
- **Public STUN servers** (Google, Cloudflare) tell each app its own public address, so they see your IP too.
- **Your partner sees your IP address**: that's what a direct connection is.
- The room code is the only secret. Anyone who has it can try to join while the room is open, so send it privately. Codes are random and there are about 590 million of them.

### The emoji check

Each app has its own certificate. The emojis come from both certificates' fingerprints, the ones each side actually sees. If someone sat in the middle (a malicious relay swapping the connection offers, say), each of you would be connected to them instead, and your emojis wouldn't match. Matching emojis mean your apps are talking to each other and nobody else. The check is optional, and nothing stops you using it unverified.

### No relay server (TURN)

There's no TURN relay to fall back on, so if the two networks can't reach each other directly, it doesn't connect, and the panel says so. Most home networks are fine. Some office, school, hotel and mobile networks block direct connections; switching one of you to another network (a phone hotspot) usually helps. Two people behind strict networks at once is the case that doesn't work.

## Build

    npm install
    npm run build          # dist/index.js and ph2gether.zip
    npm run build:public   # release/ph2gether-<version>.zip and release/manifest.json
    npm test
    npm run typecheck

There are no keys or secrets in ph2gether; both builds are the same code.

`src/types.ts` is a copy of playhound's `src/plugins/types.ts` (the plugin API).

## Licence

MIT. Bundles [Trystero](https://github.com/dmotz/trystero) (MIT). Use and share it at your own risk; it's adult software that moves a device.
