Nothing structural changes. The workflow, README markers, snake and every other section stay as they are. You only edit the layout constants in scripts/build-city-card.mjs and regenerate assets/contribution-city.svg.

Step 1: Put the layout in one constants block

Add this at the top of the script so any later tweak is a one-line change. The "new" values are my estimates, so treat them as a starting point to adjust after the first render.

js
const CARD = { w: 960, h: 400 };
const FONT = {
  eyebrow: 18,        // was 20
  total: 80,          // was 96
  totalLabel: 20,     // was 24
  stat: 52,           // was 64  (active days, busiest day)
  statLabel: 20,      // was 24
  statSub: 16,        // busiest-day date
  footer: 16          // was 18
};
const LAYOUT = {
  textColW: 340,      // left column width
  gutter: 24,         // gap between text and city
  cityX: 364,         // was about 480
  cityW: 580,         // was about 460
  cityPad: 0.04       // bbox padding
};

That's about a 17-20% reduction on the text, which is a slight drop. Nothing goes below 16px, because the card scales down on phones.

Step 2: Enlarge the city

The scene is a long diagonal strip, so it is limited by width, not height. To make it bigger you give it more width and trim its empty margins:

Widen its slot. Move the city's left edge from about x=480 to x=364 and widen it to about 580. That is roughly 25% more width, so the buildings come out about 25% bigger, which is "slightly larger".
Trim empty margins. After the first generation, read the scene's real bounding box and set the nested <svg>'s viewBox to that box plus about 4% padding. This removes dead space so the city fills its slot instead of floating in it.
Keep proportions. Leave preserveAspectRatio="xMidYMid meet" so nothing stretches.
Clip safely. Keep overflow="hidden" on the nested svg so taller buildings can't poke outside the card frame.

If the tallest buildings touch the top edge after the resize, increase cityPad or lower the scene about 10px. Don't shrink the city again.

Step 3: Re-space the text column

With a narrower column (340px) the left side needs a quick check:

Element	New size	Check
CONTRIBUTION CITY	18px	Fits on one line
Total (e.g. 1,516)	80px	About 240px wide, fits
contributions in the last year	20px	About 310px, tight. Break into two lines if it clips.
Active days and Busiest day	52px values	Two blocks of about 160px side by side
Labels	20px	Active days and Busiest day fit in 160px
@Arjun07707 and credit	16px	Bottom left, one line each

Keep vertical gaps proportional to the new sizes (roughly 14px between a number and its label, 28px between stat rows).

Step 4: Re-check phone readability

GitHub scales the whole card by width. At a 390px screen the factor is about 0.41, so 20px labels render near 8px and the 80px total near 32px. That's the reason for the 16px floor. If labels feel too small on your phone, either raise statLabel to 22 or use a stacked layout with the city under the text.

Step 5: Regenerate and ship
Edit only the constants (and the viewBox trim) in the script.
Run the workflow from the Actions tab (workflow_dispatch).
The existing commit step updates assets/contribution-city.svg. The README doesn't change.
Hard-refresh your profile (Ctrl+Shift+R). GitHub may cache the image for a few minutes.
Step 6: Verify
[ ] Number sizes are visibly smaller than before, but the total is still clearly the largest
[ ] The city looks larger and fills the right side without touching the text
[ ] The tallest building stays inside the card frame
[ ] No text overlaps or clips (check two-line label)
[ ] The rising-building animation still plays
[ ] The numbers still match your profile
[ ] Phone width is readable
[ ] Snake and everything else look unchanged