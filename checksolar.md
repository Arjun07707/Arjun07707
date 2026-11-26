Plan: Remove the outline from the planet name text

I read "others be changes" as "everything else stays unchanged". Only the planet name labels (like TypeScript 97%) lose their outline. The sun, orbits, moons, comets, comet labels, eyebrow and legend text, the README, and every workflow stay as they are.

I haven't seen your generated SVG, so Step 1 finds the exact cause before changing anything.

Step 1: Find where the outline comes from (5 min)

In scripts/build-solar-system.mjs (and in the generated assets/solar-system.svg), search for the planet label's <text> element or its CSS class. An outline on SVG text usually comes from one of these:

Cause	What to look for
Stroke halo	stroke="...", stroke-width, or paint-order="stroke" on the label
CSS halo	A class rule like .sol-label { stroke: ...; paint-order: stroke; }
Glow filter	filter="url(#...)" on the label, which can read as an outline

Note which of these apply, and whether the comet labels, eyebrow and legend share the same class or filter. If they do, you'll split the class in Step 2 so they stay unchanged.

Step 2: Make the change in the script only
Isolate the planet label. If planet labels share a class with other text, give them their own class (for example sol-planet-label), and leave the old class on everything else.
Remove the outline from that class or element only:
Delete stroke, stroke-width, stroke-linejoin and paint-order.
Remove the filter attribute if it's a glow or halo filter.
Keep the fill colour (#F5F7FF), font size, weight and position exactly as they are.
Don't delete shared definitions. Leave any <filter> or style rule in <defs> if another element still uses it. Remove it only if nothing references it.

Example of the intended change:

xml
<!-- before -->
<text class="sol-planet-label" fill="#F5F7FF" stroke="#05070D" stroke-width="3"
      paint-order="stroke" font-size="17">TypeScript 97%</text>

<!-- after -->
<text class="sol-planet-label" fill="#F5F7FF" font-size="17">TypeScript 97%</text>
Step 3: Protect readability without an outline

Without the halo, a label can get busy where a dashed orbit ring or a star crosses it. Check the render first. If it's a problem, use one of these, in this order of preference:

Nudge the label position a few pixels below the planet, away from ring crossings.
Dim the orbit rings slightly where labels sit (lower ring opacity), without changing the rings' look elsewhere.
Raise the text contrast. The text is already near white; a brighter secondary colour isn't needed.
Last resort: a small, soft dark backing behind the label (a rounded rect at low opacity). Use this only if you want some separation back, because it is a different look from an outline.

Don't re-add a stroke.

Step 4: Regenerate and publish
Commit the script change.
Run Solar System from the Actions tab (workflow_dispatch). The existing commit step updates assets/solar-system.svg.
README.md doesn't change, because it already points at that file.
Hard-refresh your profile (Ctrl+Shift+R). GitHub can cache the old image for a few minutes.
Step 5: Verify
[ ] Planet names (TypeScript 97% and the others) show no outline in the live SVG
[ ] Text colour, size, weight and position are unchanged
[ ] Comet labels, the SOLAR SYSTEM · @ARJUN07707 eyebrow and the legend look exactly as before
[ ] No label becomes hard to read as planets and moons move past dashed rings and stars
[ ] Orbits, moons, comets and the sun's avatar are unchanged
[ ] git diff shows only the script and assets/solar-system.svg changed, with no edits to the README or other workflows
Quick rollback

If the labels look worse without the outline, revert that single script commit and rerun the workflow. The README never needs touching.

If you paste the <text> line and any <style> rule for the planet labels from your generated SVG, I can give you the exact before and after lines.