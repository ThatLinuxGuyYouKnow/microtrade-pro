# REVIEW.md — "One kilowatt-hour's journey" (draft render)

Review pass on snapshot set d3e94c27 (18 beats, 8 seams, phone sheets). Check: 0 errors.

## What reads
- Story spine is legible in beats-1: hook → tension (148.2 kWh counter) → reveal →
  forecast (P10–P90) → market (clearing curve) → ledger (37 RECs) → Base Sepolia card →
  claim → end card. One idea per shot, real UI throughout.
- Seams 1–8 are straight cuts with cause (packet/UI continuity); seam-03 (reveal→forecast)
  verified clean.

## Fixes applied before this render
- Hook: cropped hero_panel.mp4 (3D topology only) + 1.0→1.07 slow push; caption no longer
  repeats the title ("In Cedar Hollow, nine homes already do.").
- Tension: removed duplicate sub-line; caption carries the "exported for pennies" line.
- Captions: `.cap` pinned to bottom-64 (was riding top on some scenes); video/img clips
  forced to cover full frame.

## Known issues (kept on purpose for the draft)
1. VO tracks are silent placeholders (equal-length) — Deepgram key returns 401; real Thalia
   VO drops in with no re-time (durations were estimated from word counts at 140 wpm).
2. Payoff card shows `forwards 0` — honest testnet state (V2 deployed, no forwards yet);
   update the `forwardCount`/`contractOwner` variables after the lifecycle tx lands.
3. End-card entrance is sparse for ~2 s (logo before wordmark) — tighten if judges' eyes
   glaze; kept because the ring pulse needs a clean stage.
4. Tag + caption occasionally double-say the metric (forecast/market/ledger) — kept: tag is
   the proof label, caption is the VO paraphrase for sound-off viewers.
5. Overall grade runs dark on stills — matches app ink; do not "fix" with CSS filters
   (media-treatment rule); brightness is a capture property.

## Delivery (render 2)
- `renders/film_2026-10-24_19-08-47.mp4` — 1920x1080, 2:13.5, 28.2 MB, h264+aac.
- Real Deepgram Thalia VO (108 s, stream-verified speech peaks, not silence); scenes
  re-timed to VO (12 / 13 / 12.5 / 19 / 19 / 22 / 15 / 5 / 16 = 133.5 s). Superseded
  silent-VO draft deleted. Bed trimmed to 133.5 s with 4 s fade-out.
- f0: hero panel mid-rotation, never black. f~2400: forecast band labels beside UI.
- f~4800: payoff mono text legible at 30 px. Final 90 f: end card CTA readable.
