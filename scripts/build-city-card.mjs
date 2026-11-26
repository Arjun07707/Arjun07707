import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 400 };
const FONT = {
  eyebrow: 18,
  total: 80,
  totalLabel: 20,
  stat: 52,
  statLabel: 20,
  statSub: 16,
  footer: 16,
};
const LAYOUT = {
  textX: 32,
  textColW: 340,
  gutter: 24,
  cityX: 364,
  cityW: 580,
  cityY: 20,
  cityH: 360,
  cityPad: 0.04,
  statColW: 160,
  eyebrowY: 54,
  totalY: 145,
  totalLabelY: 180,
  ruleY: 200,
  statsY: 268,
  statLabelY: 296,
  statSubY: 320,
  handleY: 352,
  creditY: 376,
};
// Measured with getBBox() on the city group of profile-3d-contrib/profile-cosmic-city.svg.
const SCENE_BOX = { x: 20, y: 143.79, w: 1196, h: 681.95 };
const SCENE_VIEW_BOX = (() => {
  const padX = SCENE_BOX.w * LAYOUT.cityPad;
  const padY = SCENE_BOX.h * LAYOUT.cityPad;
  return [
    SCENE_BOX.x - padX,
    SCENE_BOX.y - padY,
    SCENE_BOX.w + padX * 2,
    SCENE_BOX.h + padY * 2,
  ]
    .map((value) => value.toFixed(2))
    .join(" ");
})();

const OUTPUT = fileURLToPath(new URL("../assets/contribution-city.svg", import.meta.url));
const SCENE = process.env.SCENE_FILE
  ? process.env.SCENE_FILE
  : fileURLToPath(new URL("../profile-3d-contrib/profile-cosmic-city.svg", import.meta.url));

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.USERNAME || "Arjun07707";

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const nf = new Intl.NumberFormat("en-US");

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

function formatDate(iso) {
  if (!iso) return "\u2014";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function fetchCalendar() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is empty");

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "contribution-city-card",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.errors) {
    const detail = payload?.errors ? JSON.stringify(payload.errors) : `HTTP ${response.status}`;
    throw new Error(`GitHub GraphQL failed: ${detail}`);
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar || !Array.isArray(calendar.weeks)) {
    throw new Error("GitHub GraphQL returned no contribution calendar");
  }

  const days = calendar.weeks.flatMap((week) => week.contributionDays || []);
  if (days.length === 0) throw new Error("contribution calendar is empty");

  const sum = days.reduce((total, day) => total + (Number(day.contributionCount) || 0), 0);
  const total = Number(calendar.totalContributions) || sum;
  if (sum !== total) {
    console.warn(`city card: calendar sum ${sum} differs from total ${total}; using total`);
  }

  let activeDays = 0;
  let busiest = { count: 0, date: null };
  for (const day of days) {
    const count = Number(day.contributionCount) || 0;
    if (count > 0) activeDays += 1;
    if (count > busiest.count || (count === busiest.count && count > 0 && day.date > busiest.date)) {
      busiest = { count, date: day.date };
    }
  }

  return { total, activeDays, busiest };
}

function extractScene(svg) {
  const styleStart = svg.indexOf("<style");
  const styleContentStart = svg.indexOf(">", styleStart);
  const styleEnd = svg.indexOf("</style>", styleContentStart);
  if (styleStart < 0 || styleContentStart < 0 || styleEnd < 0) {
    throw new Error("could not find the scene stylesheet");
  }
  const style = svg.slice(styleStart, styleEnd + "</style>".length);

  const backgroundStart = svg.indexOf("<rect", styleEnd);
  if (backgroundStart < 0) throw new Error("could not find the scene background");
  const backgroundOpenEnd = svg.indexOf(">", backgroundStart);
  if (backgroundOpenEnd < 0) throw new Error("could not read the scene background");

  let pos = backgroundOpenEnd + 1;
  if (svg.startsWith("</rect>", pos)) pos += "</rect>".length;
  while (pos < svg.length && /\s/.test(svg[pos])) pos += 1;

  if (!svg.startsWith("<g", pos)) throw new Error("could not find the 3D city group");

  const groups = /<g\b|<\/g>/g;
  groups.lastIndex = pos;
  let depth = 0;
  let end = -1;
  let match;
  while ((match = groups.exec(svg))) {
    if (match[0] === "<g") {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        end = groups.lastIndex;
        break;
      }
    }
  }

  if (end < 0) throw new Error("could not find the end of the 3D city group");
  const group = svg.slice(pos, end);
  if (!group.includes("cont-top-")) throw new Error("the first scene group does not look like the 3D city");

  return { style, group };
}

function buildCard({ total, activeDays, busiest }, scene) {
  const date = formatDate(busiest.date);
  const title = `Contribution City \u2014 ${nf.format(total)} contributions in the last year`;
  const description =
    `${nf.format(total)} contributions, ${nf.format(activeDays)} active days, ` +
    `busiest day ${nf.format(busiest.count)}${busiest.date ? ` on ${date}` : ""}. ` +
    "Animated 3D city where every building is a day.";

  const dividerX = LAYOUT.textColW + LAYOUT.gutter / 2;
  const stat2X = LAYOUT.textX + LAYOUT.statColW;
  const ruleX2 = LAYOUT.textColW - 12;
  const glowX = LAYOUT.cityX + LAYOUT.cityW / 2;
  const glowY = LAYOUT.cityY + LAYOUT.cityH / 2;
  const glowRX = LAYOUT.cityW / 2;
  const glowRY = LAYOUT.cityH / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="cc-title cc-desc">
<title id="cc-title">${esc(title)}</title>
<desc id="cc-desc">${esc(description)}</desc>
<defs>
  <linearGradient id="cc-bg" x1="0" y1="0" x2="${CARD.w}" y2="${CARD.h}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#071B18"/>
    <stop offset="0.55" stop-color="#08241F"/>
    <stop offset="1" stop-color="#040E0D"/>
  </linearGradient>
  <radialGradient id="cc-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#2BC9B0" stop-opacity="0.2"/>
    <stop offset="1" stop-color="#2BC9B0" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="cc-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="22"/></clipPath>
  <style>
    .cc-card text { font-family: 'Segoe UI', -apple-system, Helvetica, Arial, sans-serif; }
    .cc-eyebrow { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.eyebrow}px; letter-spacing: 4.2px; fill: #5FC9BC; }
    .cc-big { font-size: ${FONT.total}px; font-weight: 700; letter-spacing: -2px; fill: #7DE8D5; }
    .cc-label { font-size: ${FONT.totalLabel}px; fill: #2BC9B0; }
    .cc-stat { font-size: ${FONT.stat}px; font-weight: 600; fill: #E8FFFA; }
    .cc-stat-label { font-size: ${FONT.statLabel}px; fill: #2BC9B0; }
    .cc-date { font-size: ${FONT.statSub}px; letter-spacing: 0.3px; fill: #7FA9A0; }
    .cc-handle { font-size: ${FONT.footer}px; fill: #9BA8BD; }
    .cc-credit { font-size: ${FONT.footer}px; letter-spacing: 0.2px; fill: #5F7F7A; }
    .cc-fade { animation: ccFade 0.9s ease-out both; }
    @keyframes ccFade { from { opacity: 0.55; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .cc-fade { animation: none; } }
  </style>
</defs>
<rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="22" fill="url(#cc-bg)" stroke="#2BC9B0" stroke-opacity="0.32"/>
<g class="cc-card" clip-path="url(#cc-clip)">
  <ellipse cx="${glowX}" cy="${glowY}" rx="${glowRX}" ry="${glowRY}" fill="url(#cc-glow)"/>
  <svg class="cc-scene" x="${LAYOUT.cityX}" y="${LAYOUT.cityY}" width="${LAYOUT.cityW}" height="${LAYOUT.cityH}" viewBox="${SCENE_VIEW_BOX}" preserveAspectRatio="xMidYMid meet" overflow="hidden">
${scene.style}
${scene.group}
  </svg>
  <line x1="${dividerX}" y1="44" x2="${dividerX}" y2="356" stroke="#2BC9B0" stroke-opacity="0.14"/>
  <g class="cc-fade">
    <text class="cc-eyebrow" x="${LAYOUT.textX}" y="${LAYOUT.eyebrowY}">CONTRIBUTION CITY</text>
    <text class="cc-big" x="${LAYOUT.textX - 2}" y="${LAYOUT.totalY}">${nf.format(total)}</text>
    <text class="cc-label" x="${LAYOUT.textX}" y="${LAYOUT.totalLabelY}">contributions in the last year</text>
    <line x1="${LAYOUT.textX}" y1="${LAYOUT.ruleY}" x2="${ruleX2}" y2="${LAYOUT.ruleY}" stroke="#2BC9B0" stroke-opacity="0.16"/>
    <text class="cc-stat" x="${LAYOUT.textX}" y="${LAYOUT.statsY}">${nf.format(activeDays)}</text>
    <text class="cc-stat-label" x="${LAYOUT.textX}" y="${LAYOUT.statLabelY}">active days</text>
    <text class="cc-stat" x="${stat2X}" y="${LAYOUT.statsY}">${nf.format(busiest.count)}</text>
    <text class="cc-stat-label" x="${stat2X}" y="${LAYOUT.statLabelY}">busiest day</text>
    <text class="cc-date" x="${stat2X}" y="${LAYOUT.statSubY}">${esc(date)}</text>
    <text class="cc-handle" x="${LAYOUT.textX}" y="${LAYOUT.handleY}">@${esc(USERNAME)}</text>
    <text class="cc-credit" x="${LAYOUT.textX}" y="${LAYOUT.creditY}">3D view: github-profile-3d-contrib (MIT)</text>
  </g>
</g>
</svg>
`;
}

try {
  const scene = extractScene(readFileSync(SCENE, "utf8"));
  const stats = await fetchCalendar();
  const card = buildCard(stats, scene);
  writeFileSync(OUTPUT, card);
  const date = formatDate(stats.busiest.date);
  console.log(
    `city card: wrote assets/contribution-city.svg (${nf.format(stats.total)} contributions, ` +
      `${nf.format(stats.activeDays)} active days, busiest ${nf.format(stats.busiest.count)}${stats.busiest.date ? ` on ${date}` : ""})`,
  );
} catch (error) {
  console.error(`city card: ${error.message}`);
  process.exitCode = 1;
}
