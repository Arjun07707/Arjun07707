import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 400, rx: 22 };
const TANK = {
  top: 0,
  floor: 344,
  weedX1: 40,
  weedX2: 700,
  weedMax: 76,
  weedMin: 16,
  bubbleCount: 30,
};
const FONT = {
  label: 16,
  badge: 10,
  legend: 15,
};
const LANES = [112, 194, 276];
const FISH = {
  base: 72,
  perStar: 22,
  cap: 150,
  minGap: 26,
};

const COLORS = {
  waterTop: "#0A0F1C",
  waterMid: "#0A1830",
  waterBottom: "#061020",
  border: "#202C40",
  teal: "#2BC9B0",
  ink: "#DCE9F4",
  muted: "#8FA6B8",
  sandTop: "#123033",
  sandBottom: "#081A1D",
  bubble: "#6FE3D2",
  fishInk: "#07111F",
};

// Main language -> fish colour and badge, as specified in the plan.
const LANGUAGES = {
  TypeScript: { color: "#3984FF", badge: "TS" },
  JavaScript: { color: "#F1E05A", badge: "JS" },
  Python: { color: "#42D9FF", badge: "PY" },
  CSS: { color: "#9270FF", badge: "CSS" },
};
const FALLBACK_LANGUAGE = { color: "#8B98AB" };

const OUTPUT = fileURLToPath(new URL("../assets/aquarium.svg", import.meta.url));
const LOGIN = process.env.USERNAME || "Arjun07707";
const TOKEN = process.env.GITHUB_TOKEN;

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays { date contributionCount }
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

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "repo-aquarium-card",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    const detail = payload?.message ? `${payload.message}` : `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${detail}`);
  }
  return payload;
}

async function fetchRepos() {
  const repos = await api(`/users/${encodeURIComponent(LOGIN)}/repos?per_page=100&sort=pushed&type=owner`);
  if (!Array.isArray(repos)) throw new Error("repository list was not an array");

  const candidates = repos
    .filter((repo) => !repo.fork && !repo.private)
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) return b.stargazers_count - a.stargazers_count;
      if (a.pushed_at !== b.pushed_at) return String(b.pushed_at).localeCompare(String(a.pushed_at));
      return a.name.localeCompare(b.name);
    })
    .slice(0, 10);

  if (candidates.length === 0) throw new Error("no public non-fork repositories found");

  const fish = [];
  for (const repo of candidates) {
    const slug = repo.full_name.split("/").map(encodeURIComponent).join("/");
    const languages = await api(`/repos/${slug}/languages`);
    const top = Object.entries(languages)
      .filter(([, bytes]) => Number(bytes) > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const language = top || repo.language || "Other";
    const meta = LANGUAGES[language] || {
      color: FALLBACK_LANGUAGE.color,
      badge: language === "Other" ? "OTH" : language.slice(0, 3).toUpperCase(),
    };

    fish.push({
      name: repo.name,
      stars: Number(repo.stargazers_count) || 0,
      language,
      color: meta.color,
      badge: meta.badge,
      pushedAt: repo.pushed_at,
    });
  }

  return fish;
}

async function fetchCalendar() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is empty");

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "repo-aquarium-card",
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

  const weeks = calendar.weeks.map((week) => {
    const days = Array.isArray(week.contributionDays) ? week.contributionDays : [];
    return {
      start: days[0]?.date || "",
      total: days.reduce((sum, day) => sum + (Number(day.contributionCount) || 0), 0),
    };
  });

  const days = calendar.weeks.flatMap((week) => week.contributionDays || []);
  if (days.length === 0) throw new Error("contribution calendar is empty");

  // The current week includes future days as zero; keep the last 30 real days.
  const today = new Date().toISOString().slice(0, 10);
  const pastDays = days.filter((day) => day.date <= today);
  const last30 = (pastDays.length > 0 ? pastDays : days)
    .slice(-TANK.bubbleCount)
    .map((day) => ({
      date: day.date,
      count: Number(day.contributionCount) || 0,
    }));

  return { weeks, last30 };
}

// Rough system-font width, used only for label collision checks and centring.
function textWidth(text, size) {
  let width = 0;
  for (const ch of String(text)) {
    if (ch === "…") width += size * 0.9;
    else if (ch === "_" || ch === " ") width += size * 0.52;
    else if (/[A-Z0-9]/.test(ch)) width += size * 0.62;
    else if (/[il.,'|:;!]/.test(ch)) width += size * 0.3;
    else width += size * 0.52;
  }
  return width;
}

function truncateLabel(name) {
  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
}

function createFish(repo) {
  const size = Math.min(FISH.cap, Math.round(FISH.base + FISH.perStar * Math.log2(1 + repo.stars)));
  const label = truncateLabel(repo.name);
  const badgeW = 12 + repo.badge.length * 6.5;
  const nameW = textWidth(label, FONT.label);
  // Reserve room for the name and the language tag on the fish's right flank.
  const half = Math.max(size / 2, nameW / 2 + 2, size / 2 + 6 + badgeW + 2) + 12;
  const duration = 40 + (hash(`${repo.name}:swim`) % 31);
  const delay = -((hash(`${repo.name}:phase`) % (duration * 10)) / 10);

  return {
    ...repo,
    size,
    label,
    badgeW,
    nameW,
    half,
    labelBaseline: size * 0.3 + 20,
    duration,
    delay,
  };
}

function layoutFish(repos) {
  // Keep some room for the swim cycle; small tanks get less so ten fish still fit.
  const swimMargin = repos.length <= 6 ? 108 : repos.length <= 8 ? 50 : 20;
  const fish = repos.map(createFish);

  if (fish.length <= 6) {
    // An even horizontal grid keeps the tank balanced; the hash picks the lane
    // and adds a small jitter, so the school keeps its shape between runs.
    const maxHalf = Math.max(...fish.map((item) => item.half));
    const minX = maxHalf + swimMargin;
    const maxX = CARD.w - maxHalf - swimMargin;
    const step = (maxX - minX) / fish.length;
    const laneOffset = hash(fish.map((item) => item.name).join("|")) % LANES.length;

    return fish.map((item, index) => {
      const lane = (index + laneOffset) % LANES.length;
      const jitter = ((hash(`${item.name}:x`) >>> 9) % 31) - 15;
      const x = Math.min(maxX, Math.max(minX, minX + step * (index + 0.5) + jitter));
      return withPosition(item, x, LANES[lane]);
    });
  }

  // Larger schools fall back to seeded collision-free slots per lane.
  const placed = LANES.map(() => []);
  return fish.map((item) => {
    const minX = item.half + swimMargin;
    const maxX = CARD.w - item.half - swimMargin;
    const seed = minX + (hash(item.name) >>> 7) % Math.max(1, Math.floor(maxX - minX));
    const preferred = hash(item.name) % LANES.length;

    let lane = -1;
    let x = -1;
    let load = Infinity;
    for (let attempt = 0; attempt < LANES.length; attempt += 1) {
      const index = (preferred + attempt) % LANES.length;
      const slot = findSlot(placed[index], seed, item.half, minX, maxX);
      if (slot === null) continue;
      if (placed[index].length < load) {
        lane = index;
        x = slot;
        load = placed[index].length;
      }
      if (load === 0) break;
    }

    if (x < 0) {
      lane = preferred;
      x = Math.min(maxX, Math.max(minX, seed));
    }

    placed[lane].push([x - item.half, x + item.half]);
    return withPosition(item, x, LANES[lane]);
  });
}

function withPosition(item, x, y) {
  const amp = Math.max(
    36,
    Math.min(200, x - item.half - 14, CARD.w - x - item.half - 14),
  );
  return { ...item, x, y, amp };
}

function findSlot(occupied, seed, half, minX, maxX) {
  for (let offset = 0; offset <= CARD.w; offset += 8) {
    for (const x of [seed + offset, seed - offset]) {
      if (x < minX || x > maxX) continue;
      const left = x - half;
      const right = x + half;
      const clashes = occupied.some(
        ([otherLeft, otherRight]) => left < otherRight + FISH.minGap && right + FISH.minGap > otherLeft,
      );
      if (!clashes) return x;
    }
  }
  return null;
}

function seaweed(weeks) {
  const max = Math.max(1, ...weeks.map((week) => week.total));
  const span = TANK.weedX2 - TANK.weedX1;

  return weeks
    .map((week, index) => {
      const h = hash(`${week.start}:${index}`);
      const progress = weeks.length > 1 ? index / (weeks.length - 1) : 0.5;
      const x = TANK.weedX1 + progress * span + ((h >>> 5) % 7) - 3;
      const rootY = TANK.floor + (h % 7) - 3;
      const height = TANK.weedMin + Math.sqrt(week.total / max) * (TANK.weedMax - TANK.weedMin);
      const width = 2 + (h % 10) / 10;
      const duration = 4 + (h % 30) / 10;
      const delay = -((h % 70) / 10);
      const drift = (h >>> 11) % 5;
      const tipX = x + 1 + drift * 0.4;

      return `<path class="aq-weed" style="--dur:${duration}s;--delay:${delay}s" d="M ${x.toFixed(1)} ${rootY} C ${(x - 3).toFixed(1)} ${(rootY - height * 0.35).toFixed(1)}, ${(x + 5).toFixed(1)} ${(rootY - height * 0.7).toFixed(1)}, ${tipX.toFixed(1)} ${(rootY - height).toFixed(1)}" fill="none" stroke="url(#aq-weed)" stroke-width="${width.toFixed(1)}" stroke-linecap="round"/>`;
    })
    .join("\n");
}

function bubbles(days) {
  return days
    .map((day, index) => {
      const h = hash(`${day.date}:${index}`);
      const x = 50 + (h % 860);
      const startY = 300 + ((h >>> 6) % 48);
      const r = Math.min(7, 2.4 + Math.sqrt(day.count) * 1.15);
      const duration = 8 + (h % 6);
      const delay = -((h % (duration * 10)) / 10);

      return `<circle class="aq-bubble" style="--dur:${duration}s;--delay:${delay}s" cx="${x}" cy="${startY}" r="${r.toFixed(1)}" fill="none" stroke="${COLORS.bubble}" stroke-width="${(0.8 + r * 0.12).toFixed(2)}" opacity="0.5"/>`;
    })
    .join("\n");
}

function fishMarkup(fish) {
  return fish
    .map((item) => {
      const { x, y, size, label, nameW, badgeW, labelBaseline, color, badge, amp, duration, delay } = item;
      const labelX = -nameW / 2;
      const badgeX = size / 2 + 6;
      const badgeY = -7;

      return `<g transform="translate(${x} ${y})">
  <g class="aq-swim" style="--amp:${amp}px;--dur:${duration}s;--delay:${delay}s">
    <g class="aq-body" style="--dur:${duration * 2}s;--delay:${delay}s">
      <g transform="scale(${(size / 100).toFixed(3)})">
        <use href="#aq-fish" style="color:${color}"/>
      </g>
    </g>
    <text class="aq-label" x="${labelX.toFixed(1)}" y="${labelBaseline.toFixed(1)}">${esc(label)}</text>
    <g transform="translate(${badgeX.toFixed(1)} ${badgeY})">
      <rect width="${badgeW.toFixed(1)}" height="14" rx="4" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.5"/>
      <text class="aq-badge" x="${(badgeW / 2).toFixed(1)}" y="10.8" text-anchor="middle" fill="${color}">${esc(badge)}</text>
    </g>
  </g>
</g>`;
    })
    .join("\n");
}

function buildSvg({ repos, weeks, last30 }) {
  const fish = layoutFish(repos);
  const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);
  const title = `Repo aquarium \u2014 ${fish.length} repositories, ${nf.format(totalStars)} stars`;
  const description =
    `${fish.length} fish, one per public repository, sized by stars. ` +
    `${weeks.length} seaweed strands show weekly contributions; ${last30.length} bubbles show the last 30 days.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="aq-title aq-desc">
<title id="aq-title">${esc(title)}</title>
<desc id="aq-desc">${esc(description)}</desc>
<defs>
  <linearGradient id="aq-water" x1="0" y1="0" x2="0" y2="${CARD.h}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${COLORS.waterTop}"/>
    <stop offset="0.55" stop-color="${COLORS.waterMid}"/>
    <stop offset="1" stop-color="${COLORS.waterBottom}"/>
  </linearGradient>
  <linearGradient id="aq-ray" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8BE9DC" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#8BE9DC" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="aq-weed" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#14564B"/>
    <stop offset="0.55" stop-color="#197267"/>
    <stop offset="1" stop-color="${COLORS.teal}"/>
  </linearGradient>
  <linearGradient id="aq-sand" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${COLORS.sandTop}"/>
    <stop offset="1" stop-color="${COLORS.sandBottom}"/>
  </linearGradient>
  <radialGradient id="aq-light" cx="50%" cy="0%" r="75%">
    <stop offset="0" stop-color="${COLORS.teal}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="${COLORS.teal}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="aq-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}"/></clipPath>
  <g id="aq-fish" transform="scale(-1 1)">
    <path d="M -47 0 C -39 -19, 1 -25, 25 -7 C 28 -4, 31 0, 35 0 C 31 0, 28 4, 25 7 C 1 25, -39 19, -47 0 Z" fill="currentColor"/>
    <path d="M 27 0 L 47 -15 L 43 0 L 47 15 Z" fill="currentColor" opacity="0.72"/>
    <path d="M -4 -14 C 6 -30, 20 -26, 24 -14 Z" fill="currentColor" opacity="0.62"/>
    <path d="M -18 -9 C -11 -10, -10 10, -18 9" fill="none" stroke="${COLORS.fishInk}" stroke-opacity="0.22" stroke-width="2"/>
    <ellipse cx="-12" cy="7" rx="15" ry="4.5" fill="#E8FFFA" opacity="0.09"/>
    <circle cx="-32" cy="-3.5" r="3.4" fill="${COLORS.fishInk}"/>
    <circle cx="-33" cy="-4.6" r="1.2" fill="#E8FFFA" opacity="0.9"/>
  </g>
  <style>
    .aq-card text { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
    .aq-label { font-size: ${FONT.label}px; fill: ${COLORS.ink}; paint-order: stroke; stroke: #061020; stroke-width: 3px; stroke-linejoin: round; }
    .aq-badge { font-size: ${FONT.badge}px; font-weight: 700; letter-spacing: 0.5px; }
    .aq-legend { font-size: ${FONT.legend}px; fill: ${COLORS.muted}; }
    .aq-swim { animation: aqSwim var(--dur, 52s) ease-in-out infinite alternate; animation-delay: var(--delay, 0s); }
    @keyframes aqSwim { from { transform: translateX(0); } to { transform: translateX(var(--amp, 0px)); } }
    .aq-body { transform-box: fill-box; transform-origin: 50% 50%; animation: aqFlip var(--dur, 104s) steps(1, end) infinite; animation-delay: var(--delay, 0s); }
    @keyframes aqFlip { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }
    .aq-weed { transform-box: fill-box; transform-origin: 50% 100%; animation: aqSway var(--dur, 6s) ease-in-out infinite; animation-delay: var(--delay, 0s); }
    @keyframes aqSway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
    .aq-bubble { animation: aqRise var(--dur, 11s) linear infinite; animation-delay: var(--delay, 0s); }
    @keyframes aqRise {
      0% { transform: translateY(0); opacity: 0; }
      8% { opacity: 0.5; }
      85% { opacity: 0.32; }
      100% { transform: translateY(-330px); opacity: 0; }
    }
    .aq-ray { animation: aqRay var(--dur, 11s) ease-in-out infinite alternate; animation-delay: var(--delay, 0s); }
    @keyframes aqRay { from { opacity: 0.16; } to { opacity: 0.44; } }
    @media (prefers-reduced-motion: reduce) {
      .aq-swim, .aq-body, .aq-weed, .aq-bubble, .aq-ray { animation: none !important; }
    }
  </style>
</defs>
<rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}" fill="url(#aq-water)" stroke="${COLORS.border}"/>
<g class="aq-card" clip-path="url(#aq-clip)">
  <ellipse cx="${CARD.w / 2}" cy="0" rx="${CARD.w * 0.62}" ry="300" fill="url(#aq-light)"/>
  <g fill="url(#aq-ray)">
    <path class="aq-ray" style="--dur:12s;--delay:-3s" d="M 96 -20 L 176 -20 L 356 350 L 236 350 Z" opacity="0.35"/>
    <path class="aq-ray" style="--dur:10s;--delay:-7s" d="M 364 -20 L 430 -20 L 540 350 L 430 350 Z" opacity="0.26"/>
    <path class="aq-ray" style="--dur:13s;--delay:-1s" d="M 646 -20 L 706 -20 L 806 350 L 704 350 Z" opacity="0.3"/>
  </g>
${seaweed(weeks)}
  <path d="M 0 344 C 110 334, 210 350, 330 343 C 450 336, 540 352, 660 344 C 770 336, 870 350, 960 340 L 960 ${CARD.h} L 0 ${CARD.h} Z" fill="url(#aq-sand)"/>
  <path d="M 0 344 C 110 334, 210 350, 330 343 C 450 336, 540 352, 660 344 C 770 336, 870 350, 960 340" fill="none" stroke="${COLORS.teal}" stroke-opacity="0.16"/>
  <ellipse cx="128" cy="365" rx="20" ry="5" fill="#1B3A3C" opacity="0.85"/>
  <ellipse cx="292" cy="376" rx="12" ry="4" fill="#193638" opacity="0.8"/>
  <ellipse cx="512" cy="363" rx="16" ry="4.5" fill="#1B3A3C" opacity="0.75"/>
  <ellipse cx="828" cy="372" rx="22" ry="5" fill="#193638" opacity="0.8"/>
${fishMarkup(fish)}
${bubbles(last30)}
  <g class="aq-legend" text-anchor="end">
    <text x="928" y="368">fish = repos, by stars · seaweed = contributions</text>
    <text x="928" y="388">bubbles = the last 30 days</text>
  </g>
</g>
</svg>
`;
}

try {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is empty");
  const repos = await fetchRepos();
  const calendar = await fetchCalendar();
  const svg = buildSvg({ repos, weeks: calendar.weeks, last30: calendar.last30 });
  writeFileSync(OUTPUT, svg);

  const stars = repos.reduce((sum, repo) => sum + repo.stars, 0);
  console.log(
    `aquarium: wrote assets/aquarium.svg (${repos.length} fish, ${nf.format(stars)} stars, ` +
      `${calendar.weeks.length} seaweed weeks, ${calendar.last30.length} bubbles, ${(svg.length / 1024).toFixed(1)} KB)`,
  );
} catch (error) {
  console.error(`aquarium: ${error.message}`);
  process.exitCode = 1;
}
