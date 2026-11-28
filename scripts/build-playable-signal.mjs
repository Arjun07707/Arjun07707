import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 200, rx: 12 };
const GRID = { cell: 10, gap: 3, rows: 7, top: 62 };
const PITCH = GRID.cell + GRID.gap;
const GUTTER = 28;
const SHIP_Y = 174;
const SHIP_OFF = 100;
const CYCLE = 16;
const MAX_TARGETS = 8;
const FONT = { header: 14, month: 11 };

const COLORS = {
  bg: "#05070D",
  border: "#202C40",
  empty: "#10151C",
  text: "#8b949e",
  textDim: "#6e7681",
  levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
  hit: "#d7ffe2",
  accent: "#39d353",
  ship: "#7ee787",
  cockpit: "#05070D",
  pulse: "#7de8d5",
};

// GitHub's contributionLevel enum, with a count fallback for older payloads.
const LEVEL_VALUE = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};
const LEVELS = [3, 7, 14];

const OUTPUT = fileURLToPath(new URL("../assets/playable-signal.svg", import.meta.url));
const LOGIN = process.env.GITHUB_LOGIN || process.env.USERNAME || "Arjun07707";
const TOKEN = process.env.GITHUB_TOKEN;

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
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

// Key times need more precision than coordinates: a 0.02s beat is only
// 0.00125 of the 16s loop, and rounded duplicates break SMIL keyframes.
const key = (seconds) => {
  const value = Math.round(Math.min(1, Math.max(0, seconds / CYCLE)) * 1e6) / 1e6;
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "");
};

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
    (week.contributionDays || []).map((day) => {
      const count = Number(day.contributionCount) || 0;
      return {
        date: day.date,
        count,
        level: count > 0 ? LEVEL_VALUE[day.contributionLevel] || levelFor(count) : 0,
      };
    }),
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

// One compact subpath per cell; bundling many of them into a single path keeps
// the file small without emitting hundreds of <rect> elements.
function cellPath(x, y, w, h) {
  return `M${f(x)},${f(y)}h${w}v${h}h${-w}z`;
}

// The most recent active days, oldest first, so the ship sweeps left to right.
function pickTargets(weeks) {
  const lit = [];
  weeks.forEach((days, col) => {
    days.forEach((day, row) => {
      if (day.count > 0) lit.push({ col, row, ...day });
    });
  });
  lit.sort((a, b) => a.date.localeCompare(b.date));
  return lit.slice(-MAX_TARGETS);
}

function buildSvg({ weeks, total, activeDays, first, last }) {
  const cols = weeks.length;
  const geo = layout(cols);
  const { gridW, gridH, x0, cellX, cellY, noseX } = geo;
  const targets = pickTargets(weeks);

  // One master loop: the ship enters, visits each target, then leaves.
  const slot = targets.length ? Math.min(2.1, (CYCLE - 2.4) / targets.length) : 0;
  const hitTime = (index) => 1.1 + index * slot;
  const reset = CYCLE - 1.2;

  const stops = [
    { t: 0, x: -SHIP_OFF },
    { t: 0.15, x: -SHIP_OFF },
  ];
  if (targets.length === 0) {
    stops.push({ t: CYCLE / 2, x: CARD.w / 2 }, { t: CYCLE, x: CARD.w + SHIP_OFF });
  } else {
    targets.forEach((target, index) => {
      const x = noseX(target.col);
      const hit = hitTime(index);
      stops.push({ t: hit - 0.3, x }, { t: hit + 0.45, x });
    });
    stops.push({ t: CYCLE, x: CARD.w + SHIP_OFF });
  }

  const shipTimes = stops.map((stop) => key(stop.t)).join(";");
  const shipValues = stops.map((stop) => `${f(stop.x)},0`).join(";");

  // Month labels: one above the first week of each month, with breathing room.
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
      `<text class="ps-month" x="${f(cellX(col))}" y="${f(GRID.top - 9)}">${esc(monthName(date))}</text>`,
    );
  });

  const targetKeys = new Set(targets.map((target) => `${target.col}:${target.row}`));
  const levelCells = [[], [], [], []];
  const empty = [];

  weeks.forEach((days, col) => {
    days.forEach((day, row) => {
      const cell = cellPath(cellX(col), cellY(row), GRID.cell, GRID.cell);
      empty.push(cell);
      if (day.count <= 0 || targetKeys.has(`${col}:${row}`)) return;
      levelCells[day.level - 1].push(cell);
    });
  });

  const bundle = (cells, className) =>
    cells.length > 0 ? `<path class="${className}" d="${cells.join("")}"/>` : "";

  const targetsSvg = targets.map((target, index) => {
    const x = cellX(target.col);
    const y = cellY(target.row);
    const cx = noseX(target.col);
    const cy = cellY(target.row) + GRID.cell / 2;
    const hit = hitTime(index);
    const fadeStart = hit + 0.35;
    const faded = hit + 0.8;
    const color = COLORS.levels[target.level - 1];

    const opacityTimes = [0, hit, hit + 0.05, fadeStart, faded, reset, reset + 0.2, CYCLE]
      .map(key)
      .join(";");
    const fillTimes = [0, hit, hit + 0.08, hit + 0.4, CYCLE].map(key).join(";");
    const ringTimes = [0, hit, hit + 0.02, hit + 0.5, CYCLE].map(key).join(";");
    const beamTimes = [0, hit - 0.12, hit - 0.02, hit + 0.16, hit + 0.24, CYCLE]
      .map(key)
      .join(";");

    return `<g class="ps-target">
      <rect x="${f(x)}" y="${f(y)}" width="${GRID.cell}" height="${GRID.cell}" fill="${color}" opacity="1">
        <animate attributeName="opacity" values="1;1;1;1;0;0;1;1" keyTimes="${opacityTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
        <animate attributeName="fill" values="${color};${color};${COLORS.hit};${color};${color}" keyTimes="${fillTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
      </rect>
      <circle class="ps-ring" cx="${f(cx)}" cy="${f(cy)}" r="4" opacity="0">
        <animate attributeName="r" values="4;4;5;14;14" keyTimes="${ringTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0;0.8;0;0" keyTimes="${ringTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
      </circle>
      <g class="ps-beam" opacity="0">
        <line x1="${f(cx)}" y1="${SHIP_Y - 7}" x2="${f(cx)}" y2="${f(cy)}" stroke="${COLORS.pulse}" stroke-width="3" stroke-opacity="0.22"/>
        <line x1="${f(cx)}" y1="${SHIP_Y - 7}" x2="${f(cx)}" y2="${f(cy)}" stroke="${COLORS.pulse}" stroke-width="1.1"/>
        <animate attributeName="opacity" values="0;0;1;0;0;0" keyTimes="${beamTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
      </g>
    </g>`;
  });

  const title = `Playable Signal \u2014 ${nf.format(total)} contributions across ${nf.format(activeDays)} active days`;
  const description =
    `Animated contribution grid for @${LOGIN}, ${first} to ${last}. ` +
    (targets.length > 0
      ? `A ship sweeps across the year and fires at the ${nf.format(targets.length)} most recent active days; each hit cell pulses, clears, and returns. `
      : "A ship patrols an empty grid. ") +
    "Public contributions only.";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="ps-title ps-desc">
<title id="ps-title">${esc(title)}</title>
<desc id="ps-desc">${esc(description)}</desc>
<defs>
  <clipPath id="ps-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx - 0.5}"/></clipPath>
  <style>
    .ps-card text { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
    .ps-header { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.header}px; letter-spacing: 2px; font-weight: 600; fill: ${COLORS.text}; }
    .ps-month { font-size: ${FONT.month}px; fill: ${COLORS.textDim}; }
    .ps-empty { fill: ${COLORS.empty}; }
    .ps-level-1 { fill: ${COLORS.levels[0]}; }
    .ps-level-2 { fill: ${COLORS.levels[1]}; }
    .ps-level-3 { fill: ${COLORS.levels[2]}; }
    .ps-level-4 { fill: ${COLORS.levels[3]}; }
    .ps-ring { fill: none; stroke: ${COLORS.pulse}; stroke-width: 1.4; }
    .ps-engine { fill: ${COLORS.accent}; }
  </style>
</defs>
<rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx - 0.5}" fill="${COLORS.bg}" stroke="${COLORS.border}" stroke-opacity="0.6"/>
<g class="ps-card" clip-path="url(#ps-clip)">
  <text class="ps-header" x="${GUTTER}" y="30">PLAYABLE SIGNAL \u00b7 @${esc(LOGIN)}</text>
  ${months.join("\n  ")}
  <line x1="${f(x0 - 8)}" y1="${SHIP_Y}" x2="${f(x0 + gridW + 8)}" y2="${SHIP_Y}" stroke="${COLORS.border}" stroke-opacity="0.55" stroke-dasharray="2 7"/>
  <g class="ps-grid">
    ${bundle(empty, "ps-empty")}
    ${levelCells.map((cells, index) => bundle(cells, `ps-level-${index + 1}`)).filter(Boolean).join("\n    ")}
  </g>
  ${targetsSvg.join("\n  ")}
  <g transform="translate(0 ${SHIP_Y})">
    <g class="ps-ship">
      <animateTransform attributeName="transform" type="translate" values="${shipValues}" keyTimes="${shipTimes}" dur="${CYCLE}s" repeatCount="indefinite"/>
      <path class="ps-engine" d="M -33,0 L -45,-4 L -45,4 Z" opacity="0.45">
        <animate attributeName="opacity" values="0.35;0.7;0.35" keyTimes="0;0.5;1" dur="${CYCLE}s" repeatCount="indefinite"/>
      </path>
      <path d="M 0,0 L -16,-3.5 L -32,-6 L -26,0 L -32,6 L -16,3.5 Z" fill="${COLORS.ship}"/>
      <circle cx="-14" cy="0" r="2.2" fill="${COLORS.cockpit}"/>
    </g>
  </g>
</g>
</svg>
`;
}

try {
  const calendar = await fetchCalendar();
  const svg = buildSvg(calendar);
  mkdirSync(fileURLToPath(new URL("../assets/", import.meta.url)), { recursive: true });
  writeFileSync(OUTPUT, svg);
  const targets = Math.min(MAX_TARGETS, calendar.weeks.flat().filter((day) => day.count > 0).length);
  console.log(
    `signal: wrote assets/playable-signal.svg ` +
      `(${nf.format(calendar.total)} contributions, ${nf.format(calendar.activeDays)} active days, ` +
      `${calendar.weeks.length} weeks, ${targets} targets; ${(svg.length / 1024).toFixed(1)} KB)`,
  );
} catch (error) {
  console.error(`signal: ${error.message}`);
  process.exitCode = 1;
}
