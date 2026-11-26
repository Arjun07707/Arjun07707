Part A: Tagline text
A1. Find every occurrence (5 min)
Search the repo for the old sentence, or a distinctive fragment such as my repos their moons.
Expect it in scripts/build-solar-system.mjs, which is the source of truth. The generated assets/solar-system.svg will update on the next run.
If it also appears in README.md or another workflow, tell me before touching it. You said everything else stays unchanged, so I'd change only the script's text.
A2. Replace the string
Old: I am the sun; my languages are the planets, my repos their moons, and my recent pushes the comets.
New: I am the Sun; my languages orbit as planets, my repositories drift as moons, and my latest commits blaze across the cosmos like comets.
It contains no &, < or quotes, so it needs no XML escaping.
Keep the same <text> element, class, fill, font and position. Change only the string.
A3. Check the width, since the new line is about 45% longer

The new sentence has roughly 135 characters versus about 95. Before regenerating, check whether the SVG width and padding can hold it:

Estimate the width as characters × fontSize × ~0.55 and compare it to the canvas width minus margins.
If it fits, you're done and nothing else changes.
If it overflows or runs into the planets or avatar, the least invasive fix is to split it into two <tspan> lines at the semicolon, using the same font and a small dy. Reducing the font size is the second option.
I won't pick either without your OK, because both change the layout slightly.
Part B: Planet depth fix
Why it happens

SVG has no z-index. Paint order is document order, so a planet drawn before the Sun is behind it for its whole orbit, and one drawn after is in front for the whole orbit. Your back half works because the planets are drawn first. The front half needs them to switch layers mid-orbit.

B1. Audit (10 min)

Find these in the script:

How planets are animated: animateMotion along an elliptical path, a rotating group, or CSS keyframes.
The current layer order: orbit rings, planets, Sun, moons, comets, labels.
Which half of each orbit is "back". Given that it works today, assume the upper half, where y < sunY, is back and the lower half is front. Confirm this from the orbit tilt and path direction.
Whether moons and labels live inside the planet group. They should, so they switch layers together with their planet.
The duration, begin and path start point of each planet.
B2. Target layer order
1. background, stars, orbit rings      (unchanged)
2. BACK planets                        (visible only on the back half)
3. Sun (avatar, ring, glow)            (unchanged)
4. FRONT planets                       (visible only on the front half)
5. comets and anything else            (unchanged position in the order)
B3. Render each planet twice, with exclusive visibility
Define each planet once in <defs> as <g id="planet-TypeScript"> with the sphere, lighting, icon, label and moons untouched. Both copies use <use href="#planet-…">, so the file barely grows and the sphere design stays identical.
Place the back <use> before the Sun and the front <use> after it.
Give both copies the identical animateMotion (same path, dur, begin, repeatCount). This keeps them in lockstep.
Add a discrete visibility animation to each copy:
xml
<!-- back copy: visible during the back half -->
<animate attributeName="visibility" dur="DUR" begin="BEGIN" repeatCount="indefinite"
         calcMode="discrete" keyTimes="0;T1;T2;1" values="…"/>
<!-- front copy: the exact opposite values -->

T1 and T2 are the fractions of the loop when the planet crosses the Sun's depth line. Using visibility rather than opacity avoids any fade or ghosting.

B4. Compute the switch times in the script, not by hand

The front/back boundary is the line through the Sun's centre along the orbit's major axis, which is where y = sunY on an untilted ellipse. For each orbit:

Sample the orbit path in small steps, for example 720 points.
Record where y crosses sunY, then convert those positions to fractions of the total path length.
Use those fractions as T1 and T2, shifted by the planet's starting phase if it doesn't start at the leftmost point.
animateMotion moves at constant speed along path length, so path-length fractions equal time fractions. If you use keyPoints or an easing, account for it.

If planets use CSS keyframes instead of SMIL, use the same two-copy approach with a visibility keyframe at the same percentages.

B5. Safety checks
No visible pop at the switch. The swap happens at the far left and right of the orbit, so the planet must be clear of the Sun's silhouette there. Check that orbitRx > sunRadius + planetRadius for the innermost planet.
No double drawing. At every moment exactly one copy is visible. Check the values strings are exact complements.
Sync. Both copies must share the same begin, or they drift apart.
Labels and moons follow their planet. Moons that pass behind their own planet stay as they are, since you didn't ask for that to change.
B6. Explicitly untouched
Sphere gradient, lighting, colours and sizes
Icons and labels
Orbit paths, speeds, phases and animation timing
Sun, comets, eyebrow and legend
Part C: Regenerate and verify
Commit the script change, then run the Solar System workflow, or run node scripts/build-solar-system.mjs locally and open the SVG in a browser.
Hard-refresh the profile (Ctrl+Shift+R), since GitHub caches the image.
Checklist
[ ] The new tagline reads exactly as given, with a capital "S" in Sun
[ ] The tagline fits without clipping or overlap
[ ] Planets crossing the lower half of the orbit appear fully in front of the Sun avatar and ring, including the CSS planet from your screenshot
[ ] Planets on the upper half are still behind the Sun
[ ] No flicker, jump or double image at the switch points
[ ] Animations, speeds, orbit paths, sphere look, sizes, icons and labels are the same as before
[ ] Moons stay attached to their planets
[ ] SVG size is still reasonable
[ ] git diff shows only the script and assets/solar-system.svg

Rollback: revert the script commit and rerun the workflow. Nothing else needs touching.

To write the exact code

Please paste three things from build-solar-system.mjs:

The planet-building and animation code.
The Sun group and the final SVG assembly, where the layer order is set.
The line containing the old tagline.