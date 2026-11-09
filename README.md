# ph2gether

**18+ only.** Together mode for [playhound](https://github.com/whatmekota/playhound): two people, each with their own playhound and their own device, watch and play in sync over the internet. One of you hosts and picks what plays; the other's app follows: the same video, the same moment, the same pauses and seeks. There's no server of ours in between.

Each of you can also hand the other the controls of your own session: your partner calls your edges and turns your intensity, and you can take it back with one click.

Needs playhound **2.2** or newer, on both sides.

## Install

In playhound: **Settings → Plugins**. Install ph2gether from the plugin list there, then switch it on. To install by hand, download `ph2gether-<version>.zip` from [Releases](https://github.com/whatmekota/ph2gether/releases) and drop it on that page.

It asks to see what plays, play and pause videos, read your library, and connect to the internet. For partner control it also asks to call edges and change your intensity, and to move your device (the stroke generator). It does none of those unless you hand your partner control.

## Use it

Open **Together** on the right-hand rail (or **Invite partner** / **Join partner** in the command palette, Ctrl K).

1. **Host:** click **Invite**. You get a room code like `velvet-otter-4271`. Copy it and send it to your partner however you like.
2. **Guest:** paste the code under **Join**.
3. When you're connected, both of you see **five emojis**. Compare them out loud (a call, a voice message). If they're the same, tap **They match**. Once you both have, it says **Verified**.
4. The host puts on a video. The guest's app finds the same file in the guest's library and plays it in step.

A room takes two people; a third who tries the code is turned away. If the connection drops for a moment, it reconnects by itself. **Leave** closes it.

### What follows what

- The host leads: what plays, play and pause, seeks, playback speed. (Following the speed changes the guest's speed setting while you're together, and puts it back when you leave. **Match my partner's speed** in the settings turns it off.)
- The guest's app finds the video by its content, not its name, so it doesn't matter what either of you called the file. If the guest doesn't have it, the panel says so on both sides: swap a link to it in the chat.
- The guest drifting more than a quarter of a second gets put back in place. Pausing by hand puts the guest on hold rather than dragging them along; **Catch up** joins in again.
- With **Let them control playback too** (host), the guest's play, pause and seek go to the host and from there to both.

## Partner control

One of you hands the other the controls of their own session. Both of you can do it at once.

1. Compare the emojis first: control only works in a **verified** room.
2. Either of you starts it. **Ask…** (under Their session) asks for your partner's controls; **Hand over…** (under Your session) offers yours.
3. Nothing changes until the person whose device it is says yes: their **Offer**, or their **Allow** on an ask. They tick what their partner may do:
   - **Edges**: call an edge, or end one early.
   - **Intensity**: move the intensity knob.
   - **What plays**: pause, play, skip to the next scripted video, or pick one from a list of their scripted videos (so the partner sees those names). Only when the device's owner is the host, since the host picks what plays anyway.
   - **Strokes**: run their stroke generator, at a rate and depth the partner sets.

   Edges and intensity are ticked to start with; the other two you tick yourself.
4. The partner gets a small remote in the Together panel: an **Edge** button, an intensity slider, strokes and what plays if they were given, and how your session is doing (your intensity, what comes through after an edge, the edge's countdown, what's playing).

While someone has control of yours, a pill at the top of the window says who and what, wherever you are in playhound, with **Take back**. It's in the panel too, and in the command palette (**Take back control**).

### What still holds

- **Your limits.** The intensity goes up slowly, never past **Plugins may set intensity up to** (Settings → Plugins; 80% unless you change it), and playhound tells you each time. Strokes stay under your speed ceiling. Your ranges stay yours.
- **Your hand.** Turn the knob yourself and it stays where you put it. Pick another motion source and the strokes are yours again.
- **Take back** ends it at once. So does **panic (Esc)**, on either side: control ends both ways, here, without waiting on the network.
- **Losing the connection** ends it too. Your knob eases back to where it was before (unless you turned it yourself meanwhile), and the stroke generator stops and goes back to your settings. After a panic it only ever eases down, never up.
- Your partner's app can send only so much: one edge every 1.5 seconds, one change to what plays a second, and the latest slider value four times a second. The rest is dropped.
- Strokes wait while a script plays on your side: the script drives the device then.

### Why verified only

The emoji check is the only proof that your partner's app is the one on the other end, and not someone sitting in between. Handing that someone your device isn't something to warn about and let through, so an unverified room can't grant control at all. It takes ten seconds to compare five emojis out loud.

### With an older ph2gether

Both apps say which version of partner control they speak when they connect. If your partner's ph2gether is older than 0.2, together mode works as it did and the panel says partner control needs 0.2 on both sides.

### Names

**Your name, for your partner** (Settings → Plugins → ph2gether) is what their side shows ("Sam has control"). Without one you're "your partner".

### Safety stays yours

- **Panic (Esc) stops your own device**, as always. It also tells your partner's app, which pauses their video and tells them you hit panic. And it ends partner control, both ways.
- Without partner control, nothing your partner sends reaches your device, and your speed limit, ranges and every other device setting stay yours. Their app can only play, pause and seek your video, and send you chat messages (shown as plain text; links open in your browser).
- With it, only what you ticked, only while you let them, and always through playhound's own limits (above).
- If the connection drops, the guest's video pauses, so the device stops following.

## Privacy

- **Your two apps talk directly**, over WebRTC, encrypted end to end (DTLS). Playback state, chat, partner control and everything else go straight between you.
- To find each other, the apps use **public signalling servers**: Nostr relays by default, or BitTorrent trackers or MQTT brokers (Settings → Plugins → ph2gether). They carry only the connection offers, and those are **encrypted with a key made from your room code**. They see a hash of the room, not the code; they don't see what you play. They do see your IP address and when you connect, as any server you talk to does.
- **Public STUN servers** (Google, Cloudflare) tell each app its own public address, so they see your IP too.
- **Your partner sees your IP address**: that's what a direct connection is.
- The room code is the only secret. Anyone who has it can try to join while the room is open, so send it privately. Codes are random and there are about 590 million of them.

### The emoji check

Each app has its own certificate. The emojis come from both certificates' fingerprints, the ones each side actually sees. If someone sat in the middle (a malicious relay swapping the connection offers, say), each of you would be connected to them instead, and your emojis wouldn't match. Matching emojis mean your apps are talking to each other and nobody else. Watching together works unverified; partner control doesn't.

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
