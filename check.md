Plan: Big-number stats inside the Contribution City

This adds three large stats to the city card: contributions in the last year, active days, and busiest day. Only the 3D city block changes. snake.yml, the other README sections and your assets stay as they are.

Step 0: Switch to the self-hosted route

GitSkins cards are fixed images, so you can't change their font sizes. If you used Route A from last time, move to Route B (the profile-3d.yml workflow). Then your repo builds the whole card itself, and the stats become part of the same SVG as the animated city.

Step 1: Define the three numbers

These come from your contribution calendar, using GitHub's GraphQL API with the same token the workflow already has.

Stat	How it's computed
Contributions	totalContributions for the last 12 months
Active days	Count of days with contributionCount > 0
Busiest day	Highest single-day contributionCount, with its date as a small sub-label
graphql
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
Day boundaries follow GitHub's calendar (UTC).
This counts public contributions only. Counting private work needs a personal access token and the "Include private contributions" profile setting.
Check the output against your profile's own count before publishing. Your two GitSkins cards disagreed earlier (20 vs 33).
Step 2: Add a card-builder script

Create scripts/build-city-card.mjs (Node 20, no dependencies). It will:

Fetch the calendar and compute the three stats.
Read the generated scene from profile-3d-contrib/ (your recoloured profile-customize.svg, or the animated green one).
Wrap the scene's contents in a card SVG and write assets/contribution-city.svg.
Exit with an error and write nothing if the API call fails, so the last good card stays in place.

Inline the scene instead of linking it, because an SVG shown as an image can't load other files. I haven't seen the generated SVG yet, so two risks need checking on the first run:

Style clashes. The scene's own <style> rules apply across the whole document. Prefix every card class with cc- and avoid duplicate ids.
Built-in text. If the scene includes its own labels or charts, crop to the city only using a viewBox, so the numbers aren't shown twice.
Step 3: Card layout (viewBox 960×400)
Element	Position	Style
Card frame	Full canvas, rounded	Dark teal gradient, thin teal border at low opacity
Eyebrow CONTRIBUTION CITY	Top left	Monospace, 20px, wide letter-spacing
Contributions number	Left, under eyebrow	96px, bold, mint #7DE8D5
Label contributions in the last year	Under the number	24px, teal #2BC9B0
Active days and Busiest day	Left, side by side	64px numbers, 24px labels, busiest date in small text
@Arjun07707 and credit line	Bottom left	18px, muted teal. Credit "3D view: github-profile-3d-contrib (MIT)".
City scene	Right half	Nested <svg>, preserveAspectRatio="xMidYMid meet"

Colour values are sampled by eye from your screenshot, so adjust them.

Fonts. Use system fonts only ('Segoe UI', -apple-system, Helvetica, Arial, sans-serif). Web fonts won't load inside an SVG shown as an image.

Mobile. GitHub scales the whole card to the screen width, so on a phone the numbers shrink proportionally. At roughly 390px wide, the 96px number renders around 39px and the 24px labels around 10px. That's why labels are 24px and not smaller. A stacked layout would keep them larger, at the cost of a taller card. I don't recommend counting on <picture> width breakpoints for a separate mobile version, since GitHub support for that is unreliable.

Number format. Show full numbers with commas (1,516) instead of 4K for accuracy.

Animation. The rising buildings come from the scene and should survive nesting. Verify this. I'd skip count-up effects on the numbers (SVG has no clean way without scripting). A slow fade-in is optional, and add prefers-reduced-motion to calm it.

Step 4: Update only profile-3d.yml

Add a Node step after the 3D action, pass the token and username, and include the new file in the commit:

yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Build stats card
        run: node scripts/build-city-card.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          USERNAME: Arjun07707
      - name: Commit generated files
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add profile-3d-contrib/ assets/contribution-city.svg
          git diff --cached --quiet || git commit -m "chore: update 3D city [skip ci]"
          git push

Keep [skip ci] so the commit doesn't retrigger your snake workflow. snake.yml is untouched.

Step 5: README change (one line)

Inside the 3D-CONTRIBUTION-CITY markers only, change the image source to ./assets/contribution-city.svg. Keep the heading and caption. Nothing outside the markers changes.

Step 6: Verify
[ ] Workflow runs green from the Actions tab
[ ] Opening assets/contribution-city.svg directly shows the card, big numbers, and rising buildings
[ ] The three numbers match your profile's contribution graph
[ ] Labels are readable at phone width
[ ] No duplicated stats from the scene
[ ] Hard-refresh the profile: snake and everything else look the same as before
Lightweight fallback

If nesting causes problems, keep the scene image as is and put the three stats in an HTML table above it using <h1 align="center"> for the numbers. It's simpler but caps out at heading size and needs a script to update the README text between markers.

Order and effort
Generate and inspect the scene SVG (10 min)
Write and test the stats script locally or via a manual run (45 min)
Style the card and check mobile (30 min)
Wire up the workflow and README line (15 min)