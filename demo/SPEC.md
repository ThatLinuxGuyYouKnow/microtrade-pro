# SPEC.md — "One kilowatt-hour's journey" (~180 s)

GOAL: A judge finishes believing a real neighborhood market ran on screen and on-chain,
and clicks the repo or the Base Sepolia contract next.
OUTPUT: HyperFrames, 1920x1080, 30fps.
TIME: 133.5s x 30 = 4005 frames. VO 108s real Thalia @ ~150wpm. Music 92 BPM low bed (VO is the clock).
layout change every 8 beats (~21s). No beat-locked cuts (VO is the clock).

LOOK: ground #060908 (the app's own ink, flat, 0% grain on UI shots, 2% grain on 3D footage only);
ink #E8F1ED body; accent MINT #34D399 rationed to one word per shot + the travelling kWh packet
(amber #F5B84A, the packet only); flow blue #67B7F7 appears only inside real UI.
Display: Inter 700, 96px, tracking -2%; body: Inter 400 34px; numbers: JetBrains Mono 700.
Medium: the product's own screen at 1:1 (never scaled UI, never tilted), motion footage of the 3D
scene full-bleed; kinetic labels sit beside UI, never over dimmed screenshots.
Light/depth: no shadows on type over footage (4px #000 at 60% only for legibility);
6% vignette on 3D footage only; 0% on UI.

OBJECTS: the kWh packet (12px amber dot + 24px soft halo, the one carrier, on screen in 70% of shots);
the oversized cursor (96px, enters off-screen, click causes the next thing);
the Base Sepolia explorer tx row (real text, mono 30px).

MOTION: enter = power4.out 18f; move = power3.inOut 24f; exit = power4.in 12f; camera push = expo.out 30f.
Cursor click = 6f scale punch + ring. One hero move per shot; secondary travels 60% as far, starts +6f.
Cuts: straight cuts between worlds (5 worlds, 4 cuts max with cause: packet exits frame right → enters
next world frame left); one velocity-matched punch-in per proof beat (26f in, hold, 18f out).

SHOTS (ranges tentative, VO-locked in edit):
1. 0–14s HERO: full-bleed rotating microgrid, packet leaves rooftop, chase. Sound: pulse in, VO hook.
   Hands to 2 via packet exiting frame-right.
2. 14–35s TENSION: same world, dusk grade, packet falls to grid, wasted-solar kWh counter ticks up
   from real KPIs. Hands to 3 via counter digit morphing into the wordmark.
3. 35–50s REVEAL: Overview page at 1:1, cursor clicks Forecast nav. Title "MicroTrade Pro" 1 line.
4. 50–80s PROOF/Forecast: Forecast page, punch-in on P10–P90 band; labels beside, never over.
5. 80–110s PROOF/Market: Market page, clearing curve; cursor clicks slot; forward contract row highlights.
6. 110–140s PROOF/Ledger: Ledger page, block list scrolls, signature/REC rows; punch-in on V2 address.
7. 140–160s PAYOFF: explorer tx (real capture), packet lands in battery; rotating microgrid returns,
   full-bleed, slowest push. Biggest visual moment, played once.
8. 160–170s CLAIM: one line over microgrid: "Sunlight, traded next door." 10 words max on screen.
9. 170–180s END CARD: mark carried in by cursor click, fill rises; repo + contract CTA; hold 3s.

BANNED: black/dark void with small floating elements; glow/bloom/neon/particles; purple-blue gradients,
glass cards; cream-paper-serif look; everything fading/sliding up; text moving while read; drifting titles;
corner labels/brackets/HUD; three cards in a row; KPI grids; title over dimmed screenshot; docked logo;
typing-into-prompt opener; bullets; narrator repeating on-screen text word for word.
QA: f0 = microgrid mid-rotation, never black; f~2400 band punch-in labels beside UI; f~4800 explorer
text legible at 30px mono; final 90f end card holds with CTA readable.
