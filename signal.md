Plan: Faster, more game-like, more beautiful Playable Signal

Only scripts/build-playable-signal.mjs changes, and it regenerates assets/playable-signal.svg. The black minimal background, the data fetch, playable-signal.yml, the README block and every other section stay as they are.

One honest limit first: GitHub strips JavaScript, so nothing in a README image can respond to hover or clicks. "Interactive" here means an autonomous game that feels responsive, plus real links around it. Step 7 covers the one genuine interactive option.

Step 1: Diagnose the slowness

The master loop converts event times to fractions of the loop length. The placeholder numbers in my earlier example were slow: a ship move spanning 0.10 to 0.50 of a 16-second loop takes 6.4 seconds, and a shot spanning a few percent of the loop takes about a second. Open your script and find where shot and ship timings are defined. If your numbers differ, the cause is still the same: shot flight and ship moves are too large a share of a long loop.

Step 2: Time-based timeline

Write every event in seconds, and let the script derive keyTimes = t / T, where T is the sum of all events. That makes speed a one-line edit.

js
const TIMING = {            // seconds
  intro: 0.4,
  move: 0.50,               // ship slide between targets
  lock: 0.25,               // reticle appears, ship settles
  shotFlight: 0.18,         // laser travel
  shotGap: 0.10,            // between hits on a multi-hit cell
  impact: 0.45,             // ring, sparks, cell fades
  outro: 1.6,               // sweep, "SIGNAL CLEAR", cells return
  minLoop: 8,
};
Event	Before (example values)	After
Ship move	about 6 s	0.5 s
Shot flight	about 1 s	0.18 s
One target, start to finish	about 8 s	about 1.4 s
Loop with 6 targets	16 s	about 10 s
Step 3: Make the shooting feel fast
Projectile: a small bolt about 14px long (cyan #42D9FF core) with a short fading tail, travelling at constant speed (linear, no easing). A grid height of about 100px in 0.18s is roughly 550px/s.
Ship easing: accelerate and brake with calcMode="spline" and keySplines=".4 0 .2 1" so moves feel snappy.
Order: sort targets left to right, so the ship sweeps instead of jumping back and forth.
Target choice: up to 8 days, the highest contribution counts first (ties by recency), then ordered by column. You can switch to "most recent 8" if you prefer.
Multi-hit cells: a cell takes one shot per level, up to 3, with shotGap between them. It's the "health bar" feel from arcade games.
Step 4: Game feel and beauty
Addition	How
Lock-on reticle	A thin mint ring scales from 2.2× to 1× around the next target during lock, giving anticipation
Impact	Expanding ring (4 to 14px, fading) plus 6 tiny sparks flying 14 to 20px outward over 0.4s, and a soft brighten on the cell, then a fade to empty
Ship polish	Slight bank (about ±8°) while moving, a gentle thruster pulse (about 0.5s cycle) and a faint trail streak during moves
HUD, top right	SCORE 0013, counting contributions cleared. Build it from stacked <text> elements that swap with discrete opacity, one per target
Target readout	A one-line LOCKED · Nov 5 · 3 contributions text beside the score, visible only during that target's lock and impact
Reset	After the last target the ship does a victory sweep, SIGNAL CLEAR fades in, and the cleared cells fade back from left to right, 0.05s apart
Idle state	If you have few lit days, a faint scan line sweeps the grid and the ship patrols, so the loop never feels frozen. The loop never drops below minLoop.

Sparse data. With only a few lit cells, the active part of the loop is short and the rest is the idle sweep. That's accurate. I'd rather not fire at empty cells, because that would fake data.

Keep it minimal. Don't bring back a background glow. Fake any glow on bolts and impacts with a small radial-gradient circle instead of a blur filter, which is lighter on phones. Keep green on lit cells and the ship.

No strobing. At most one bright event at a time, each a single soft pulse, with no rapid on-off flicker. SVG animation ignores the reduced-motion setting, so this restraint matters.

Step 5: Sync and size
Every animated element uses the same dur and repeatCount="indefinite", so nothing drifts.
Independent loops (the thruster pulse, the scan line) can run on their own.
Non-target cells stay merged into one path per level.
Target the file at under 80 KB, with a cap of 8 targets so animation count stays manageable.
System fonts only. The HUD at 12px shrinks on a phone, as with your other cards.
Step 6: Ship it
Edit the script, commit, and run Playable Signal from the Actions tab.
The existing steps commit the new SVG. The README doesn't change.
Hard-refresh your profile (Ctrl+Shift+R). GitHub may cache the old image for a few minutes.
Roll back by reverting the commit and rerunning the workflow.
Step 7: Real interactivity (choose what you want)
Links around the image: a text row below the card with your profile and featured repos. Clickable, safe, and no extra work.
Issue-driven play (optional, not recommended for v1): some profiles let visitors click a button that opens a pre-filled issue, and a workflow then updates the README with the new state. One public example does this with a 2048 game. It would need a new workflow, and it brings public issues you'd have to moderate and clean up. Skip it unless you want that commitment.
Step 8: Verify
[ ] Screen-record at 60 fps: a bolt crosses the grid in about 12 frames (0.2s) or less
[ ] One target's full sequence runs in about 1.5s or less, and the loop is 12s or less
[ ] Reticle, impact ring, sparks, score and readout all line up with the same target
[ ] Targets are hit left to right, and multi-hit cells take more than one shot
[ ] Cells fade back at the end, and SIGNAL CLEAR shows once per loop
[ ] Nothing flickers, and the background is still flat near-black
[ ] The SVG opens and animates directly in a browser tab, and also on your live profile after a hard refresh
[ ] The file is under 80 KB, and the README diff is empty
Tuning
If you see	Change
Shots still feel slow	shotFlight to 0.12, move to 0.4
It feels too frantic	move to 0.65, impact to 0.6
Loop feels long	Cap targets at 5
Too sparse to be fun	Increase the idle sweep and keep minLoop at 8 or more