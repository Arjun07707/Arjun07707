What you're building

GitHub strips JavaScript from READMEs, so nothing there can be truly interactive. A "playable signal" is an animated SVG that autoplays. The ship moves along the bottom, fires at lit contribution cells, and the cells pulse and disappear. The real contribution data is baked in when the image is generated.

There are two ways to get it:

Route	How it works	Pros	Cons
A. Hosted template (GitSkins)	Paste an image URL with your username into the README	2 minutes, nothing to maintain	Depends on their service, limited customization
B. Self-generated via GitHub Action	A workflow builds the SVG daily and commits it to your repo	You own it and can restyle it freely	More setup

Start with A. Move to B only if the service is slow or you want custom colors.

Phase 0: Protect what you have
Open your profile repo (the one named exactly your-username/your-username).
Copy your current README.md to a backup. A new branch named add-playable-signal works well.
Don't touch your existing sections. You will only add one block.
Phase 1: Preview before committing
Open the GitSkins template page and enter your GitHub username if it asks.
Confirm the preview shows your real contribution pattern.
Copy the embed snippet it gives you. (This is the part I couldn't verify.) It will be an <img> or Markdown image pointing to their rendered SVG.
Phase 2: Add it to the README
Choose a placement, usually directly under your intro or above the "Currently exploring" section, so it doesn't push your content down.
Paste the block inside a centered wrapper:
html
<div align="center">
  <img src="Playable Signal: GitHub README template | GitSkins" alt="Playable Signal contribution game" width="100%" />
</div>
Add dark and light variants if the template supports them:
html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="DARK_URL">
  <source media="(prefers-color-scheme: light)" srcset="LIGHT_URL">
  <img alt="Playable Signal" src="DARK_URL">
</picture>
Commit to the branch and view the README on that branch. Check it on desktop and mobile width.
Phase 3: Verify
It animates (GitHub caches images, so hard refresh if it looks static).
The width fits without horizontal scroll.
The alt text is present.
Nothing else in the README moved or broke.
It loads in under about 2 seconds. If it's slow, go to Route B.
Phase 4: Merge

Merge the branch into main. Visit github.com/your-username in a private window to confirm what visitors see.

Route B: Self-hosted version (optional)
Create the file .github/workflows/signal.yml in your profile repo.
Trigger it on schedule (daily cron) and workflow_dispatch.
Steps:
Check out the repo.
Fetch your contribution calendar from the GitHub GraphQL API, using the built-in GITHUB_TOKEN.
Run a generator (a small Node script, or a contribution-game action such as the Snake-style ones) that writes dist/signal-dark.svg and dist/signal-light.svg.
Push the output to an output branch.
Point the README <img> at the raw URL of that branch's SVG.
Style it in the SVG's CSS to match your screenshot:
Cell greens from #0e4429 to #39d353.
Dark background #0d1117.
Ship drawn as an SVG path.
@keyframes for ship movement, laser shots, and cell pulse rings.
Common problems
Problem	Fix
Image not animating	Use SVG, not PNG, and hard refresh
Broken image	Check the username spelling and that the URL is public
Stale data	Route A refreshes on their schedule; Route B runs on your cron
Layout shift	Set an explicit width