import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 200, rx: 12 };
const GRID = { cell: 10, gap: 3, rows: 7, top: 62 };
const PITCH = GRID.cell + GRID.gap;
const GUTTER = 28;
const SHIP_Y = 174;
const SHIP_OFF = 100;
const MAX_TARGETS = 8;
const MAX_LOOP = 12;
const FONT = { header: 14, month: 11, hud: 12, read: 11 };

// Every event is written in seconds. The loop is the sum of the real events,
// so tuning speed is a one-line change instead of re-deriving fractions.
const TIMING = {
  intro: 0.4,
  move: 0.5,
  lock: 0.25,
  shotFlight: 0.18,
  shotGap: 0.1,
  impact: 0.45,
  outro: 1.6,
  minLoop: 8,
};

const COLORS = {
  bg: "#05070D",
  border: "#202C40",
  empty: "#10151C",
  text: "#8b949e",
  textDim: "#6e7681",
  levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
  hit: "#d7ffe2",
  mint: "#7de8d5",
  accent: "#39d353",
  ship: "#7ee787",
  cockpit: "#05070D",
  bolt: "#42D9FF",
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

// Key times are fractions of the master loop. Six decimals keep the short
// 0.02s beats distinct; rounded duplicates would make the keyframe invalid.
function keyTimes(times, loop, label = "keyTimes") {
  const out = [];
  for (const time of times) {
    const value = Math.round(Math.min(1, Math.max(0, time / loop)) * 1e6) / 1e6;
    if (out.length > 0 && value <= out[out.length - 1]) {
      throw new Error(`${label} is not strictly increasing at ${time}s`);
    }
    out.push(value);
  }
  if (out.length < 2 || out[0] !== 0 || out[out.length - 1] !== 1) {
    throw new Error(`${label} must start at 0 and end at 1`);
  }
  return out
    .map((value) => value.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""))
    .join(";");
}

// Events may share a timestamp at a move boundary; keep the last one.
function mergeEvents(events, loop) {
  const sorted = events
    .filter((event) => event.t >= 0 && event.t <= loop)
    .sort((a, b) => a.t - b.t);
  const out = [];
  for (const event of sorted) {
    if (out.length > 0 && event.t - out[out.length - 1].t < 1e-6) {
      out[out.length - 1] = event;
    } else {
      out.push(event);
    }
  }
  if (out.length === 0) out.push({ t: 0, v: 0 });
  if (out[0].t !== 0) out.unshift({ t: 0, v: out[0].v });
  if (out[out.length - 1].t !== loop) out.push({ t: loop, v: out[out.length - 1].v });
  return out;
}

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

function shortDate(date) {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

// One compact subpath per cell; bundling many into a single path keeps the
// file small without emitting hundreds of <rect> elements.
function cellPath(x, y, w, h) {
  return `M${f(x)},${f(y)}h${w}v${h}h${-w}z`;
}

function collectLit(weeks) {
  const lit = [];
  weeks.forEach((days, col) => {
    days.forEach((day, row) => {
      if (day.count > 0) lit.push({ col, row, ...day });
    });
  });
  return lit;
}

const byColumn = (a, b) => a.col - b.col || a.row - b.row;
const shotsFor = (level) => Math.min(3, Math.max(1, level || 1));

// The schedule is a list of real seconds. A cell gets one bolt per level so
// dense days take several hits, and the loop is padded up to minLoop.
function scheduleFor(targets, geo) {
  let cursor = TIMING.intro;
  let previousX = -SHIP_OFF;

  const steps = targets.map((target, index) => {
    const x = geo.noseX(target.col);
    const move = index === 0 ? TIMING.intro : Math.abs(x - previousX) < 0.01 ? 0 : TIMING.move;
    const moveStart = index === 0 ? 0 : cursor;
    const arrive = moveStart + move;
    const lockStart = arrive;
    const lockEnd = arrive + TIMING.lock;
    const shots = shotsFor(target.level);
    const hits = [];

    for (let shot = 0; shot < shots; shot += 1) {
      const start = lockEnd + shot * (TIMING.shotFlight + TIMING.shotGap);
      hits.push({ start, end: start + TIMING.shotFlight });
    }

    const impactStart = hits[hits.length - 1].end;
    const impactEnd = impactStart + TIMING.impact;
    cursor = impactEnd;
    previousX = x;

    return {
      target,
      index,
      x,
      move,
      moveStart,
      arrive,
      lockStart,
      lockEnd,
      shots,
      hits,
      impactStart,
      impactEnd,
    };
  });

  const base = cursor + TIMING.outro;
  const idle = Math.max(0, TIMING.minLoop - base);
  const outroStart = cursor + idle;
  const total = outroStart + TIMING.outro;

  return { steps, idle, outroStart, total };
}

// Up to eight busy days, highest counts first, then swept left to right.
// We drop the lowest-valued target until the whole loop fits 12 seconds.
function chooseTargets(weeks, geo) {
  const pool = collectLit(weeks)
    .sort((a, b) => b.count - a.count || b.date.localeCompare(a.date))
    .slice(0, MAX_TARGETS);

  const candidates = pool.slice().sort(byColumn);
  while (candidates.length > 1 && scheduleFor(candidates, geo).total > MAX_LOOP) {
    let drop = 0;
    for (let index = 1; index < candidates.length; index += 1) {
      if (candidates[index].count < candidates[drop].count) drop = index;
    }
    candidates.splice(drop, 1);
  }

  return candidates;
}

function sparkPath() {
  const parts = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = ((-90 + index * 60) * Math.PI) / 180;
    const inner = 7;
    const outer = index % 2 === 0 ? 16 : 20;
    parts.push(
      `M${f(Math.cos(angle) * inner)},${f(Math.sin(angle) * inner)}` +
        `L${f(Math.cos(angle) * outer)},${f(Math.sin(angle) * outer)}`,
    );
  }
  return parts.join("");
}

function buildSvg({ weeks, total, activeDays, first, last }) {
  const cols = weeks.length;
  const geo = layout(cols);
  const { gridW, gridH, x0, cellX, cellY, noseX } = geo;
  const targets = chooseTargets(weeks, geo);
  const plan = scheduleFor(targets, geo);
  const loop = Math.round(plan.total * 1000) / 1000;
  const dur = `${loop}s`;
  const { steps, idle, outroStart } = plan;

  // Ship position in seconds; spline easing gives each move a snappy start
  // and brake, while holds stay linear.
  const shipStops = [{ t: 0, x: -SHIP_OFF }];
  if (steps.length === 0) {
    shipStops.push({ t: TIMING.intro, x: x0 + gridW * 0.15 });
  } else {
    steps.forEach((step) => {
      if (step.arrive > shipStops[shipStops.length - 1].t + 1e-6) {
        shipStops.push({ t: step.arrive, x: step.x });
      }
      shipStops.push({ t: step.impactEnd, x: step.x });
    });
  }

  const cursor = steps.length > 0 ? steps[steps.length - 1].impactEnd : TIMING.intro;
  const lastX = shipStops[shipStops.length - 1].x;

  if (idle > 0.4) {
    shipStops.push(
      { t: cursor + idle * 0.45, x: x0 + gridW * 0.3 },
      { t: outroStart, x: x0 + gridW * 0.65 },
    );
  } else if (outroStart > cursor + 1e-6) {
    shipStops.push({ t: outroStart, x: lastX });
  }
  shipStops.push({ t: loop, x: CARD.w + SHIP_OFF });

  const shipSplines = shipStops
    .slice(1)
    .map((stop, index) => (Math.abs(stop.x - shipStops[index].x) > 0.01 ? ".4 0 .2 1" : "0 0 1 1"))
    .join(";");

  // Bank and trail are driven by the same move windows, so they line up with
  // the ship instead of drifting on an independent loop.
  const bankEvents = [{ t: 0, v: 0 }];
  const trailEvents = [{ t: 0, v: 0 }];
  for (let index = 1; index < shipStops.length; index += 1) {
    const from = shipStops[index - 1];
    const to = shipStops[index];
    if (to.t - from.t > 0.05 && Math.abs(to.x - from.x) > 0.5) {
      bankEvents.push({ t: from.t, v: 0 }, { t: (from.t + to.t) / 2, v: 8 }, { t: to.t, v: 0 });
      trailEvents.push(
        { t: from.t, v: 0 },
        { t: Math.min(to.t, from.t + 0.1), v: 0.3 },
        { t: to.t, v: 0 },
      );
    }
  }
  bankEvents.push({ t: loop, v: 0 });
  trailEvents.push({ t: loop, v: 0 });
  const bank = mergeEvents(bankEvents, loop);
  const trail = mergeEvents(trailEvents, loop);

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

  const cumulative = [];
  steps.reduce((sum, step) => {
    const next = sum + step.target.count;
    cumulative.push(next);
    return next;
  }, 0);

  const targetsSvg = steps.map((step, index) => {
    const { target } = step;
    const x = cellX(target.col);
    const y = cellY(target.row);
    const cx = noseX(target.col);
    const cy = y + GRID.cell / 2;
    const color = COLORS.levels[target.level - 1];
    const resetStart = outroStart + index * 0.05;
    const resetEnd = resetStart + 0.3;
    const sparkEnd = step.impactStart + 0.4;

    const cellTimes = [0, step.impactStart, step.impactStart + 0.06, step.impactStart + 0.24, resetStart, resetEnd, loop];
    const cellKeys = keyTimes(cellTimes, loop);
    const ringTimes = [0, step.impactStart, step.impactStart + 0.08, step.impactEnd, loop];
    const reticleTimes = [0, step.lockStart, step.lockStart + 0.04, step.lockEnd, loop];
    const sparkTimes = [0, step.impactStart, step.impactStart + 0.05, sparkEnd, loop];

    const bolts = step.hits
      .map((hit) => {
        const travelKeys = keyTimes([0, hit.start, hit.end, loop], loop, "bolt travel");
        const fadeKeys = keyTimes(
          [0, hit.start, hit.start + 0.02, hit.end - 0.02, hit.end, loop],
          loop,
          "bolt fade",
        );
        return `<g class="ps-bolt" opacity="0">
        <animateTransform attributeName="transform" type="translate" calcMode="linear" keyTimes="${travelKeys}" values="${f(cx)},${SHIP_Y - 7};${f(cx)},${SHIP_Y - 7};${f(cx)},${f(cy)};${f(cx)},${f(cy)}" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" calcMode="linear" keyTimes="${fadeKeys}" values="0;0;1;1;0;0" dur="${dur}" repeatCount="indefinite"/>
        <use href="#ps-bolt"/>
      </g>`;
      })
      .join("\n      ");

    const scoreEnd = index + 1 < steps.length ? steps[index + 1].arrive : outroStart;
    const scoreKeys = keyTimes([0, step.arrive, scoreEnd, loop], loop, "score");
    const readKeys = keyTimes([0, step.lockStart, step.impactEnd, loop], loop, "readout");
    const score = `SCORE ${String(cumulative[index]).padStart(4, "0")}`;
    const readout =
      `LOCKED \u00b7 ${shortDate(target.date)} \u00b7 ` +
      `${target.count} contribution${target.count === 1 ? "" : "s"}`;

    return `<g class="ps-target">
      <rect x="${f(x)}" y="${f(y)}" width="${GRID.cell}" height="${GRID.cell}" fill="${color}" opacity="1">
        <animate attributeName="fill" keyTimes="${cellKeys}" values="${color};${color};${COLORS.hit};${COLORS.empty};${COLORS.empty};${color};${color}" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" keyTimes="${cellKeys}" values="1;1;1;0;0;1;1" dur="${dur}" repeatCount="indefinite"/>
      </rect>
      <circle class="ps-reticle" cx="${f(cx)}" cy="${f(cy)}" r="9" opacity="0">
        <animate attributeName="r" keyTimes="${keyTimes(reticleTimes, loop, "reticle")}" values="19.8;19.8;9;9;9" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" keyTimes="${keyTimes(reticleTimes, loop, "reticle fade")}" values="0;0;0.85;0;0" dur="${dur}" repeatCount="indefinite"/>
      </circle>
      <circle class="ps-ring" cx="${f(cx)}" cy="${f(cy)}" r="4" opacity="0">
        <animate attributeName="r" keyTimes="${keyTimes(ringTimes, loop, "ring")}" values="4;4;14;14;14" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" keyTimes="${keyTimes(ringTimes, loop, "ring fade")}" values="0;0;0.8;0;0" dur="${dur}" repeatCount="indefinite"/>
      </circle>
      <g transform="translate(${f(cx)} ${f(cy)})">
        <g opacity="0">
          <animate attributeName="opacity" keyTimes="${keyTimes(sparkTimes, loop, "sparks fade")}" values="0;0;0.9;0;0" dur="${dur}" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="scale" keyTimes="${keyTimes(sparkTimes, loop, "sparks scale")}" values="0.2;0.2;1;1;1" dur="${dur}" repeatCount="indefinite"/>
          <use href="#ps-sparks"/>
        </g>
      </g>
      ${bolts}
      <text class="ps-score" x="932" y="30" text-anchor="end" opacity="0">${esc(score)}
        <animate attributeName="opacity" calcMode="discrete" keyTimes="${scoreKeys}" values="0;1;0;0" dur="${dur}" repeatCount="indefinite"/>
      </text>
      <text class="ps-read" x="800" y="30" text-anchor="end" opacity="0">${esc(readout)}
        <animate attributeName="opacity" calcMode="discrete" keyTimes="${readKeys}" values="0;1;0;0" dur="${dur}" repeatCount="indefinite"/>
      </text>
    </g>`;
  });

  const signalClearTimes = [0, outroStart + 0.15, outroStart + 0.9, outroStart + 1.35, loop];
  const scan =
    idle > 0.4 || steps.length === 0
      ? `<g clip-path="url(#ps-grid-area)"><line x1="${f(x0)}" y1="${f(GRID.top - 6)}" x2="${f(x0)}" y2="${f(GRID.top + gridH + 6)}" stroke="${COLORS.accent}" stroke-opacity="0.1" stroke-width="2">
      <animateTransform attributeName="transform" type="translate" values="0,0;${f(gridW)},0" dur="6s" repeatCount="indefinite"/>
    </line></g>`
      : "";

  const title = `Playable Signal \u2014 ${nf.format(total)} contributions across ${nf.format(activeDays)} active days`;
  const description =
    `Animated contribution grid for @${LOGIN}, ${first} to ${last}. ` +
    (steps.length > 0
      ? `A ship sweeps the year and fires at ${nf.format(steps.length)} busy days; each hit brightens, clears and returns. `
      : "A ship patrols an empty grid. ") +
    "Public contributions only.";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="ps-title ps-desc">
<title id="ps-title">${esc(title)}</title>
<desc id="ps-desc">${esc(description)}</desc>
<defs>
  <clipPath id="ps-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx - 0.5}"/></clipPath>
  <clipPath id="ps-grid-area"><rect x="${f(x0)}" y="${f(GRID.top - 6)}" width="${f(gridW)}" height="${f(gridH + 12)}"/></clipPath>
  <radialGradient id="ps-glow">
    <stop offset="0" stop-color="${COLORS.bolt}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${COLORS.bolt}" stop-opacity="0"/>
  </radialGradient>
  <g id="ps-bolt">
    <circle r="4.5" fill="url(#ps-glow)"/>
    <path d="M0,13 L0,2" stroke="${COLORS.bolt}" stroke-width="2" stroke-opacity="0.25" stroke-linecap="round"/>
    <path d="M0,6 L0,0" stroke="${COLORS.bolt}" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <path id="ps-sparks" d="${sparkPath()}" fill="none" stroke="${COLORS.mint}" stroke-width="1.3" stroke-linecap="round"/>
  <style>
    .ps-card text { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
    .ps-header { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.header}px; letter-spacing: 2px; font-weight: 600; fill: ${COLORS.text}; }
    .ps-month { font-size: ${FONT.month}px; fill: ${COLORS.textDim}; }
    .ps-score { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.hud}px; letter-spacing: 1px; font-weight: 600; fill: ${COLORS.accent}; }
    .ps-read { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: ${FONT.read}px; letter-spacing: 0.5px; fill: ${COLORS.mint}; }
    .ps-empty { fill: ${COLORS.empty}; }
    .ps-level-1 { fill: ${COLORS.levels[0]}; }
    .ps-level-2 { fill: ${COLORS.levels[1]}; }
    .ps-level-3 { fill: ${COLORS.levels[2]}; }
    .ps-level-4 { fill: ${COLORS.levels[3]}; }
    .ps-reticle { fill: none; stroke: ${COLORS.mint}; stroke-width: 1.2; }
    .ps-ring { fill: none; stroke: ${COLORS.mint}; stroke-width: 1.4; }
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
  ${scan}
  ${targetsSvg.join("\n  ")}
  <text class="ps-clear" x="${CARD.w / 2}" y="${SHIP_Y - 6}" text-anchor="middle" opacity="0" fill="${COLORS.accent}" font-size="12" letter-spacing="5" font-weight="600" font-family="'Cascadia Mono', 'SFMono-Regular', Consolas, monospace">SIGNAL CLEAR
    <animate attributeName="opacity" keyTimes="${keyTimes(signalClearTimes, loop, "signal clear")}" values="0;0;0.9;0;0" dur="${dur}" repeatCount="indefinite"/>
  </text>
  <g transform="translate(0 ${SHIP_Y})">
    <g class="ps-ship">
      <animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="${shipSplines}" keyTimes="${keyTimes(shipStops.map((stop) => stop.t), loop, "ship")}" values="${shipStops.map((stop) => `${f(stop.x)},0`).join(";")}" dur="${dur}" repeatCount="indefinite"/>
      <g class="ps-ship-bank">
        <animateTransform attributeName="transform" type="rotate" keyTimes="${keyTimes(bank.map((event) => event.t), loop, "bank")}" values="${bank.map((event) => `${f(event.v)} -16 0`).join(";")}" dur="${dur}" repeatCount="indefinite"/>
        <path d="M-30,-6 L-76,0 L-30,6 Z" fill="${COLORS.ship}" opacity="0">
          <animate attributeName="opacity" keyTimes="${keyTimes(trail.map((event) => event.t), loop, "trail")}" values="${trail.map((event) => f(event.v)).join(";")}" dur="${dur}" repeatCount="indefinite"/>
        </path>
        <path class="ps-engine" d="M -33,0 L -45,-4 L -45,4 Z">
          <animate attributeName="opacity" values="0.3;0.75;0.3" keyTimes="0;0.5;1" dur="0.5s" repeatCount="indefinite"/>
        </path>
        <path d="M 0,0 L -16,-3.5 L -32,-6 L -26,0 L -32,6 L -16,3.5 Z" fill="${COLORS.ship}"/>
        <circle cx="-14" cy="0" r="2.2" fill="${COLORS.cockpit}"/>
      </g>
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
  console.log(
    `signal: wrote assets/playable-signal.svg ` +
      `(${nf.format(calendar.total)} contributions, ${nf.format(calendar.activeDays)} active days, ` +
      `${calendar.weeks.length} weeks; ${(svg.length / 1024).toFixed(1)} KB)`,
  );
} catch (error) {
  console.error(`signal: ${error.message}`);
  process.exitCode = 1;
}
