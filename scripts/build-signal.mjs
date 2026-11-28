import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 260, rx: 20 };
const GRID = { cell: 10, gap: 3, rows: 7, top: 72 };
const PITCH = GRID.cell + GRID.gap;
const GUTTER = 28;
const CYCLE = 9; // seconds per pass
const TAIL = 1.1; // quiet beat before the pass repeats
const SPEED = 215; // px per second while travelling between shots
const SHIP_Y = 208;
const SHIP_OFF = 84; // how far off-canvas the ship starts and ends
// Upper bounds for levels 1-3; a count above the last bound gets level 4.
const LEVELS = [3, 7, 14];
const FONT = { eyebrow: 12, month: 10, footer: 12 };

const PALETTES = {
  dark: {
    bgTop: "#0d1117",
    bgBottom: "#090c10",
    border: "#30363d",
    text: "#8b949e",
    textStrong: "#c9d1d9",
    empty: "#161b22",
    levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
    accent: "#39d353",
    ship: "#7ee787",
    cockpit: "#0d1117",
    beam: "#7ee787",
  },
  light: {
    bgTop: "#ffffff",
    bgBottom: "#f6f8fa",
    border: "#d0d7de",
    text: "#57606a",
    textStrong: "#24292f",
    empty: "#ebedf0",
    levels: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
    accent: "#1a7f37",
    ship: "#1a7f37",
    cockpit: "#ffffff",
    beam: "#1a7f37",
  },
};

const OUTPUT_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const OUTPUTS = { dark: "signal-dark.svg", light: "signal-light.svg" };

const LOGIN = process.env.GITHUB_LOGIN || "Arjun07707";
const TOKEN = process.env.GITHUB_TOKEN;

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

const f = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

const pct = (seconds) => f((seconds / CYCLE) * 100);

function levelFor(count) {
  if (count <= LEVELS[0]) return 1;
  if (count <= LEVELS[1]) return 2;
  if (count <= LEVELS[2]) return 3;
  return 4;
}

function monthName(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
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
      "User-Agent": "playable-signal",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.errors) {
    const detail = payload?.errors ? JSON.stringify(payload.errors) : `HTTP ${response.status}`;
    throw new Error(`GitHub GraphQL failed: ${detail}`);
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar || !Array.isArray(calendar.weeks) || calendar.weeks.length === 0) {
    throw new Error("GitHub GraphQL returned no contribution calendar");
  }

  const weeks = calendar.weeks.map((week) =>
    (week.contributionDays || []).map((day) => ({
      date: day.date,
      count: Number(day.contributionCount) || 0,
    })),
  );

  const days = weeks.flat();
  if (days.length === 0) throw new Error("contribution calendar is empty");

  const sum = days.reduce((total, day) => total + day.count, 0);
  const total = Number(calendar.totalContributions) || sum;
  const activeDays = days.filter((day) => day.count > 0).length;

  return { weeks, total, activeDays, first: days[0].date, last: days[days.length - 1].date };
}

function layout(cols) {
  const gridW = cols * PITCH - GRID.gap;
  const gridH = GRID.rows * PITCH - GRID.gap;
  const x0 = (CARD.w - gridW) / 2;
  const cellX = (col) => x0 + col * PITCH;
  return {
    gridW,
    gridH,
    x0,
    cellX,
    cellY: (row) => GRID.top + row * PITCH,
    noseX: (col) => cellX(col) + GRID.cell / 2,
  };
}

// The ship always starts at the newest week and works backwards through the
// year, so the first shot lands within a second even when the only active days
// are recent. Seconds spent parked on a column are proportional to how much
// happened that week, which keeps a sparse grid from feeling abandoned.
function planSweep(weeks, geo) {
  const actions = [];
  weeks.forEach((days, col) => {
    const lit = days
      .map((day, row) => ({ ...day, row }))
      .filter((day) => day.count > 0);
    if (lit.length > 0) actions.push({ col, lit });
  });
  actions.sort((a, b) => b.col - a.col);

  const stops = [{ t: 0, x: CARD.w + SHIP_OFF }];
  const fire = new Map();
  let t = 0;
  let x = stops[0].x;

  for (const { col, lit } of actions) {
    t += Math.abs(x - geo.noseX(col)) / SPEED;
    x = geo.noseX(col);
    stops.push({ t, x });

    const shot = t + 0.16;
    fire.set(col, shot);

    t = shot + 0.18 + Math.min(lit.length, 5) * 0.22;
    stops.push({ t, x });
  }

  const exitX = -SHIP_OFF;
  t += Math.abs(x - exitX) / SPEED;
  stops.push({ t, x: exitX });

  return { stops, fire, end: t };
}

function buildSvg({ weeks, total, activeDays, first, last }, palette, mode) {
  const cols = weeks.length;
  const geo = layout(cols);
  const { gridW, gridH, x0, cellX, cellY, noseX } = geo;
  const y0 = GRID.top;

  const plan = planSweep(weeks, geo);
  const fit = Math.min(1, (CYCLE - TAIL) / Math.max(plan.end, 0.001));
  const hitTime = (col) => (plan.fire.get(col) ?? 0) * fit;

  // Month labels: one above the first week of each month, with at least three
  // columns of breathing room so they never crowd each other.
  const months = [];
  let lastMonth = "";
  let lastLabelCol = -99;
  weeks.forEach((days, col) => {
    const date = days[0]?.date;
    if (!date) return;
    const month = date.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    const dayOfMonth = Number(date.slice(8, 10));
    if (col === 0 && dayOfMonth > 7) return;
    if (col - lastLabelCol < 3) return;
    lastLabelCol = col;
    months.push(
      `<text class="ps-month" x="${f(cellX(col))}" y="${f(y0 - 9)}">${esc(monthName(date))}</text>`,
    );
  });

  const cells = [];
  const rings = [];
  const beams = [];

  weeks.forEach((days, col) => {
    days.forEach((day, row) => {
      const x = cellX(col);
      const y = cellY(row);
      cells.push(
        `<rect class="ps-cell" x="${f(x)}" y="${f(y)}" width="${GRID.cell}" height="${GRID.cell}" rx="2" fill="${palette.empty}"/>`,
      );
      if (day.count <= 0) return;

      const delay = -(CYCLE - (hitTime(col) + row * 0.05));
      cells.push(
        `<rect class="ps-cell ps-hit" x="${f(x)}" y="${f(y)}" width="${GRID.cell}" height="${GRID.cell}" rx="2" fill="${palette.levels[levelFor(day.count) - 1]}" style="animation-delay:${f(delay)}s"/>`,
      );
      rings.push(
        `<circle class="ps-ring" cx="${f(x + GRID.cell / 2)}" cy="${f(y + GRID.cell / 2)}" r="7" fill="none" stroke="${palette.accent}" stroke-width="1.4" style="animation-delay:${f(delay)}s"/>`,
      );
    });

    const lit = days.map((day, row) => ({ day, row })).filter(({ day }) => day.count > 0);
    if (lit.length === 0) return;

    // The shot is a vertical line from the ship's nose to the topmost lit cell.
    const target = lit.reduce((best, item) => (item.row < best.row ? item : best));
    const cx = noseX(col);
    const cy = cellY(target.row) + GRID.cell / 2;
    const delay = -(CYCLE - (hitTime(col) + target.row * 0.05));
    beams.push(`<g class="ps-beam" style="animation-delay:${f(delay)}s">
      <line x1="${f(cx)}" y1="${f(SHIP_Y - 7)}" x2="${f(cx)}" y2="${f(cy)}" stroke="${palette.beam}" stroke-width="3" stroke-opacity="0.22"/>
      <line x1="${f(cx)}" y1="${f(SHIP_Y - 7)}" x2="${f(cx)}" y2="${f(cy)}" stroke="${palette.beam}" stroke-width="1.1"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="3.2" fill="${palette.beam}"/>
    </g>`);
  });

  const move = plan.stops.map(
    (stop) => `${pct(stop.t * fit)}% { transform: translate(${f(stop.x)}px, 0); }`,
  );
  const finalStop = plan.stops[plan.stops.length - 1];
  if (pct(finalStop.t * fit) < 100) {
    move.push(`100% { transform: translate(${f(finalStop.x)}px, 0); }`);
  }

  const title = `Playable Signal \u2014 ${nf.format(total)} contributions across ${nf.format(activeDays)} active days`;
  const description =
    `Animated contribution grid for @${LOGIN}, ${first} to ${last}. ` +
    `A ship sweeps across the year, firing at the ${nf.format(activeDays)} days with contributions; ` +
    "each hit cell pulses and clears, then the year begins again.";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="ps-title ps-desc">
<title id="ps-title">${esc(title)}</title>
<desc id="ps-desc">${esc(description)}</desc>
<defs>
  <linearGradient id="ps-bg" x1="0" y1="0" x2="0" y2="${CARD.h}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${palette.bgTop}"/>
    <stop offset="1" stop-color="${palette.bgBottom}"/>
  </linearGradient>
  <radialGradient id="ps-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${palette.accent}" stop-opacity="${mode === "dark" ? 0.12 : 0.16}"/>
    <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ps-scan" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${palette.accent}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${palette.accent}" stop-opacity="0.7"/>
    <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="ps-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}"/></clipPath>
  <clipPath id="ps-grid-clip"><rect x="${f(x0)}" y="${f(y0)}" width="${f(gridW)}" height="${f(gridH)}"/></clipPath>
  <style>
    .ps-card text { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
    .ps-eyebrow { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.eyebrow}px; letter-spacing: 2.4px; font-weight: 600; fill: ${palette.text}; }
    .ps-month { font-size: ${FONT.month}px; fill: ${palette.text}; }
    .ps-foot { font-size: ${FONT.footer}px; fill: ${palette.text}; }
    .ps-foot-key { fill: ${palette.textStrong}; font-weight: 600; }
    .ps-cell { transform-box: fill-box; transform-origin: center; }
    .ps-ring { transform-box: fill-box; transform-origin: center; opacity: 0; }
    .ps-glow { animation: ps-glow 5.5s ease-in-out infinite; }
    .ps-hit { animation: ps-hit ${CYCLE}s linear infinite; }
    .ps-ring { animation: ps-ring ${CYCLE}s linear infinite; }
    .ps-beam { opacity: 0; animation: ps-beam ${CYCLE}s linear infinite; }
    .ps-move { animation: ps-move ${CYCLE}s linear infinite; }
    .ps-engine { transform-box: fill-box; transform-origin: center; animation: ps-engine 1.1s ease-in-out infinite; }
    @keyframes ps-hit {
      0% { opacity: 1; transform: scale(1); }
      1.4% { opacity: 1; transform: scale(1.5); }
      4.6% { opacity: 0; transform: scale(0.68); }
      26% { opacity: 0; transform: scale(0.68); }
      36% { opacity: 1; transform: scale(1); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes ps-ring {
      0% { opacity: 0.85; transform: scale(0.55); }
      4% { opacity: 0; transform: scale(2.2); }
      100% { opacity: 0; transform: scale(2.2); }
    }
    @keyframes ps-beam {
      0% { opacity: 0; }
      1.2% { opacity: 1; }
      4% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes ps-move {
      ${move.join("\n      ")}
    }
    @keyframes ps-glow {
      0%, 100% { opacity: 0.55; }
      50% { opacity: 1; }
    }
    @keyframes ps-engine {
      0%, 100% { opacity: 0.35; transform: scale(0.85); }
      50% { opacity: 0.8; transform: scale(1.15); }
    }
    @media (prefers-reduced-motion: reduce) {
      .ps-hit, .ps-ring, .ps-beam, .ps-move, .ps-engine, .ps-glow { animation: none; }
      .ps-ring, .ps-beam, .ps-scan-band { opacity: 0; }
    }
  </style>
</defs>
<rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}" fill="url(#ps-bg)" stroke="${palette.border}"/>
<g class="ps-card" clip-path="url(#ps-clip)">
  <ellipse class="ps-glow" cx="${CARD.w / 2}" cy="${y0 + gridH / 2}" rx="${gridW * 0.62}" ry="${gridH * 1.5}" fill="url(#ps-glow)"/>
  <text class="ps-eyebrow" x="${GUTTER}" y="34">PLAYABLE SIGNAL \u00b7 @${esc(LOGIN)}</text>
  ${months.join("\n  ")}
  <line x1="${f(x0 - 8)}" y1="${SHIP_Y}" x2="${f(x0 + gridW + 8)}" y2="${SHIP_Y}" stroke="${palette.border}" stroke-opacity="0.55" stroke-dasharray="2 7"/>
  <g clip-path="url(#ps-grid-clip)">
    <g class="ps-scan-band ps-move" transform="translate(${f(CARD.w / 2)} 0)" opacity="0.16">
      <rect x="-23" y="${y0}" width="46" height="${gridH}" fill="url(#ps-scan)"/>
    </g>
  </g>
  <g class="ps-grid">
    ${cells.join("\n    ")}
  </g>
  ${rings.join("\n  ")}
  ${beams.join("\n  ")}
  <g transform="translate(0 ${SHIP_Y})">
    <g class="ps-move" transform="translate(${f(CARD.w / 2)} 0)">
      <path class="ps-engine" d="M 33,0 L 45,-4 L 45,4 Z" fill="${palette.accent}" opacity="0.45"/>
      <path d="M 34,-6 L 16,-2 L 0,0 L 16,2 L 34,6 L 28,0 Z" fill="${palette.ship}"/>
      <circle cx="19" cy="0" r="2.2" fill="${palette.cockpit}"/>
    </g>
  </g>
  <text class="ps-foot" x="${GUTTER}" y="239"><tspan class="ps-foot-key">${nf.format(total)}</tspan> contributions \u00b7 <tspan class="ps-foot-key">${nf.format(activeDays)}</tspan> active days</text>
  <text class="ps-foot" x="${CARD.w - GUTTER}" y="239" text-anchor="end">public data \u00b7 one sweep = one year</text>
</g>
</svg>
`;
}

try {
  const calendar = await fetchCalendar();
  const dark = buildSvg(calendar, PALETTES.dark, "dark");
  const light = buildSvg(calendar, PALETTES.light, "light");
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_DIR + OUTPUTS.dark, dark);
  writeFileSync(OUTPUT_DIR + OUTPUTS.light, light);
  console.log(
    `signal: wrote dist/${OUTPUTS.dark} and dist/${OUTPUTS.light} ` +
      `(${nf.format(calendar.total)} contributions, ${nf.format(calendar.activeDays)} active days, ` +
      `${calendar.weeks.length} weeks; ${(dark.length / 1024).toFixed(1)} KB each)`,
  );
} catch (error) {
  console.error(`signal: ${error.message}`);
  process.exitCode = 1;
}
