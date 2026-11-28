Plan: Radar chart in the Contribution City's upper right corner

This adds a five-axis radar (Commit, Issue, PullReq, Review, Repo) with log-scale rings, like your reference image. The change is only in scripts/build-city-card.mjs, which regenerates assets/contribution-city.svg. The city scene, the big stats, the legend, the README and every workflow stay as they are.

Step 1: Get the data

Add five fields to the GraphQL query you already run for the stats, using the same token:

graphql
contributionsCollection {
  totalCommitContributions
  totalIssueContributions
  totalPullRequestContributions
  totalPullRequestReviewContributions
  totalRepositoryContributions
  contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
}
Axis	Field
Commit	totalCommitContributions
Issue	totalIssueContributions
PullReq	totalPullRequestContributions
Review	totalPullRequestReviewContributions
Repo	totalRepositoryContributions (repositories you created)

These cover the last year and public activity only. Log the five numbers in the workflow output so you can check them against your profile. They can add up to a different figure than the calendar total in your stats panel, so don't present them as the same number.

Step 2: Scale and geometry

Use four fixed log rings labelled 10, 100, 1K and 10K, as in your reference. A value of 0 or 1 sits at the centre.

js
const RADAR = { cx: 824, cy: 124, R: 60, scale: 1 };
const AXES = [
  ['Commit',  'totalCommitContributions',            -90],
  ['Issue',   'totalIssueContributions',             -18],
  ['PullReq', 'totalPullRequestContributions',        54],
  ['Review',  'totalPullRequestReviewContributions', 126],
  ['Repo',    'totalRepositoryContributions',       198],
];
const rad = d => (d * Math.PI) / 180;
const r = c => RADAR.R * Math.min(1, Math.log10(Math.max(c, 1)) / 4);
const pt = (value, deg) => [r(value) * Math.cos(rad(deg)), r(value) * Math.sin(rad(deg))];
Ring k (1 to 4): a dashed pentagon at radius R·k/4, labelled 10, 100, 1K, 10K along the top axis.
Axes: dashed lines from the centre to each vertex at radius R.
Polygon: the five pt() points joined.
All zeros: draw a small dot at the centre instead of a polygon.
Step 3: Placement

On the 960×400 card, centre the radar at about (824, 124) with R = 60. That puts it in the empty upper right, since the city strip runs diagonally from upper left to lower right.

Element	Position
Commit	Above the top vertex
Issue	Right of its vertex, ends near x=925, leaving about 35px of margin
PullReq / Review	Below their vertices
Repo	Left of its vertex
Ticks (10 / 100 / 1K / 10K)	Along the top axis, 12px, muted

The radar plus labels occupy roughly x 722 to 925 and y 36 to 200.

Step 4: Style

Keep the existing teal scheme (colours sampled by eye, so adjust as needed):

Polygon: fill teal #2BC9B0 at about 35% opacity, stroke mint #7DE8D5, 2px.
Rings and axes: dashed, low-opacity grey-teal, 1px.
Axis labels: 16px, near-white, system fonts, no outline.
Ticks: 12px, muted teal.
Naming: prefix every class and id with cc- so nothing clashes with the city scene's styles.
Step 5: Animation

Grow the polygon out from the centre to match the rising buildings. Put the translate on an outer group and animate an inner one, otherwise the animation would replace the translate and send the radar to the corner:

xml
<g transform="translate(824,124)">
  <g>
    <animateTransform attributeName="transform" type="scale"
      from="0" to="1" begin="0s" dur="1.6s" fill="freeze"/>
    <polygon class="cc-radar-shape" points="…"/>
  </g>
</g>

Grid, labels and ticks are static, so only the shape moves. If a viewer doesn't run SVG animation, the shape just shows at full size. The grow-in may finish before you scroll down to the card, the same as the buildings.

Step 6: Clearance check

After the first render, measure the nearest building to the radar's box and keep at least 10px between them. If tall buildings get close, shrink the radar with RADAR.scale (for example 0.85) and leave the city where it is. With your current sparse data there is plenty of room, but this matters as your contributions grow.

Step 7: Ship and verify
Commit the script change.
Run GitHub-Profile-3D-Contrib from the Actions tab. The existing steps rebuild assets/contribution-city.svg and commit it.
Hard-refresh your profile (Ctrl+Shift+R). GitHub may cache the old image for a few minutes.

Checklist:

[ ] The radar sits in the top right corner, inside the card frame
[ ] Polygon vertices match the five numbers in the workflow log
[ ] Rings, labels and ticks don't overlap each other or the city
[ ] The city scene, big stats, legend and README are unchanged
[ ] Looks tidy at phone width

Roll back by reverting the script commit and rerunning the workflow.

Things to know
Sparse data. With about 20 contributions a year, the shape will be a small sliver near the centre, and zero axes sit exactly at the centre. That's accurate. The fixed rings match your reference. If you'd prefer the rings scaled to your data so the shape reads more clearly, that's a one-line change, but the ring labels would then stop meaning 10, 100, 1K.
Phone view. The 12px tick labels shrink to about 5px on a phone, while the 16px axis names stay legible. You can drop the ticks if they look cluttered.
Why not reuse the engine's radar. The 3D contrib action may draw a similar chart itself, but I haven't verified that, and its position and colours wouldn't be controllable. Drawing your own keeps it in the corner and in your palette.