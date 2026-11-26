#!/usr/bin/env node
/**
 * Generates assets/hero-galaxy.svg from live GitHub repository data.
 *
 * No dependencies: Node 20's built-in fetch and fs only.
 *
 * What the stars encode
 *   position  -> creation date (oldest near the core, newest on the outer arms)
 *   colour    -> primary language
 *   size      -> repository size (log scale)
 *   brightness-> how recently the repository was pushed
 *   ring      -> repositories that have GitHub stars
 *
 * Background dust is decorative; only the named stars are data.
 *
 * Usage:
 *   node scripts/generate-galaxy.mjs [--out <file>] [--fixture <file>]
 *
 * --fixture reads an array of {name, language, size, stars, pushed_at,
 * created_at, archived} objects instead of calling the API. Handy for testing
 * the layout with more repositories than currently exist.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1200;
const H = 420;
const CX = 872;
const CY = 208;
const XS = 0.98; // horizontal radius scale
const YS = 0.62; // vertical radius scale keeps the galaxy inside the frame
const R_MIN = 84;
const R_MAX = 246;
const MAX_REPOS = 12;
const SWEEP = Math.PI * 2 * 1.25;
const STAR_MIN_DIST = 80;
const CORE_CLEAR = 108;
const BOUNDS = { x0: 612, x1: 1160, y0: 54, y1: 376 };

const C = {
  bg0: "#05070D",
  bg1: "#0A0F1C",
  ink: "#F5F7FF",
  muted: "#9BA8BD",
  dim: "#68758A",
  border: "#202C40",
  blue: "#3984FF",
  cyan: "#42D9FF",
  violet: "#9270FF",
};

const LANG_FILL = {
  TypeScript: C.blue,
  CSS: C.violet,
  Python: C.cyan,
  JavaScript: C.ink,
  HTML: C.dim,
  Shell: C.muted,
};
const FALLBACK_FILL = C.muted;

const FONT_SANS =
  "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outFlag = flag("--out", null);
const OUT = outFlag ? resolve(process.cwd(), outFlag) : resolve(repoRoot, "assets/hero-galaxy.svg");
const FIXTURE = flag("--fixture", null);

const LOGIN = process.env.GALAXY_LOGIN || process.env.GITHUB_LOGIN || "Arjun07707";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function hash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function api(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "galaxy-hero-generator",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} responded ${res.status}`);
  return res.json();
}

async function loadLive() {
  const repos = await api(`/users/${encodeURIComponent(LOGIN)}/repos?per_page=100&sort=pushed&direction=desc`);
  if (!Array.isArray(repos)) throw new Error("Unexpected repository payload");

  const live = [];
  for (const repo of repos) {
    if (repo.fork) continue;
    const langs = await api(
      `/repos/${encodeURIComponent(LOGIN)}/${encodeURIComponent(repo.name)}/languages`,
    );
    const language =
      Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      repo.language ||
      "Other";
    live.push({
      name: repo.name,
      language,
      size: repo.size || 0,
      stars: repo.stargazers_count || 0,
      pushed_at: repo.pushed_at,
      created_at: repo.created_at,
      archived: Boolean(repo.archived),
    });
  }
  return live;
}

function loadFixture(file) {
  const rows = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
  if (!Array.isArray(rows)) throw new Error("Fixture must be an array");
  return rows.map((row, index) => ({
    name: row.name || `repo-${index + 1}`,
    language: row.language || "Other",
    size: Number(row.size) || 0,
    stars: Number(row.stars) || 0,
    pushed_at: row.pushed_at || null,
    created_at: row.created_at || null,
    archived: Boolean(row.archived),
  }));
}

const DAY = 86400000;
const now = Date.now();

function recency(repo) {
  if (!repo.pushed_at) return 0;
  const days = (now - Date.parse(repo.pushed_at)) / DAY;
  if (!Number.isFinite(days)) return 0;
  return Math.max(0, Math.min(1, 1 - days / 365));
}

function formatSize(kb) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}

function pickRepos(repos) {
  const ranked = repos.map((repo) => ({
    ...repo,
    recency: recency(repo),
  }));
  for (const repo of ranked) {
    repo.score =
      Math.log2((repo.size || 0) + 8) * (0.7 + 0.6 * repo.recency) +
      Math.min(repo.stars, 50) * 0.5;
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked.slice(0, MAX_REPOS);
}

function layout(picked) {
  const created = (repo) => {
    const value = repo.created_at ? Date.parse(repo.created_at) : NaN;
    return Number.isFinite(value) ? value : null;
  };

  const stamps = picked.map(created).filter((value) => value !== null);
  const minCreated = stamps.length ? Math.min(...stamps) : 0;
  const maxCreated = stamps.length ? Math.max(...stamps) : 0;
  const span = maxCreated - minCreated;

  const ordered = [...picked].sort((a, b) => {
    const ca = created(a);
    const cb = created(b);
    if (ca === null && cb === null) return a.name.localeCompare(b.name);
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca - cb || a.name.localeCompare(b.name);
  });

  const logs = picked.map((repo) => Math.log2((repo.size || 0) + 1));
  const minLog = Math.min(...logs);
  const maxLog = Math.max(...logs);

  const totals = new Map();
  for (const repo of picked) {
    totals.set(repo.language, (totals.get(repo.language) || 0) + (repo.size || 1));
  }
  const languages = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const armCount = Math.max(2, Math.min(3, languages.length));

  const stars = ordered.map((repo, index) => {
    const stamp = created(repo);
    const t =
      ordered.length === 1
        ? 0.62
        : span > 0 && stamp !== null
          ? (stamp - minCreated) / span
          : index / (ordered.length - 1);
    const tClamped = Math.max(0, Math.min(1, t));
    const radius = R_MIN + (R_MAX - R_MIN) * tClamped;

    const languageIndex = languages.indexOf(repo.language);
    const arm =
      languages.length >= 2 && languageIndex >= 0
        ? languageIndex % armCount
        : index % armCount;

    const rand = mulberry32(hash(repo.name) ^ 0x9e3779b9);
    const theta =
      (arm * 2 * Math.PI) / armCount +
      (SWEEP * Math.log(radius / R_MIN)) / Math.log(R_MAX / R_MIN) +
      (rand() - 0.5) * 0.42;

    const sizeT =
      maxLog > minLog
        ? (Math.log2((repo.size || 0) + 1) - minLog) / (maxLog - minLog)
        : 0.5;

    const recencyStep = Math.round((0.45 + 0.55 * repo.recency) * 20) / 20;

    return {
      name: repo.name,
      language: repo.language,
      size: repo.size,
      stars: repo.stars,
      archived: repo.archived,
      radius,
      x: CX + Math.cos(theta) * radius * XS,
      y: CY + Math.sin(theta) * radius * YS,
      r: 3.4 + 5.2 * Math.sqrt(sizeT),
      opacity: Math.max(0.35, repo.archived ? recencyStep * 0.5 : recencyStep),
      fill: LANG_FILL[repo.language] || FALLBACK_FILL,
      meta: `${repo.language} · ${formatSize(repo.size)}`,
    };
  });

  relax(stars);
  const dense = stars.length > 6;
  placeLabels(stars, dense);
  return { stars, armCount, languages, dense };
}

function relax(stars) {
  for (let iteration = 0; iteration < 280; iteration++) {
    let moved = false;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < STAR_MIN_DIST) {
          const shift = (STAR_MIN_DIST - distance) / 2;
          dx /= distance;
          dy /= distance;
          a.x -= dx * shift;
          a.y -= dy * shift;
          b.x += dx * shift;
          b.y += dy * shift;
          moved = true;
        }
      }
    }
    for (const star of stars) {
      const dx = star.x - CX;
      const dy = star.y - CY;
      const distance = Math.hypot(dx, dy) || 0.001;
      if (distance < CORE_CLEAR) {
        star.x = CX + (dx / distance) * CORE_CLEAR;
        star.y = CY + (dy / distance) * CORE_CLEAR;
        moved = true;
      }
    }
    for (const star of stars) {
      star.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, star.x));
      star.y = Math.min(BOUNDS.y1, Math.max(BOUNDS.y0, star.y));
    }
    if (!moved) break;
  }
}

const LABEL_OFFSETS = [
  { dx: 16, dy: 4, anchor: "start" },
  { dx: -16, dy: 4, anchor: "end" },
  { dx: 0, dy: -20, anchor: "middle" },
  { dx: 0, dy: 30, anchor: "middle" },
  { dx: 18, dy: -16, anchor: "start" },
  { dx: -18, dy: -16, anchor: "end" },
  { dx: 18, dy: 28, anchor: "start" },
  { dx: -18, dy: 28, anchor: "end" },
];

function labelBox(star, offset, width, height) {
  const left =
    offset.anchor === "start"
      ? star.x + offset.dx
      : offset.anchor === "end"
        ? star.x + offset.dx - width
        : star.x + offset.dx - width / 2;
  const nameTop = height > 20 ? 12 : 10;
  const nameBottom = height > 20 ? 17 : 6;
  return {
    left,
    right: left + width,
    top: star.y + offset.dy - nameTop,
    bottom: star.y + offset.dy + nameBottom,
  };
}

const overlaps = (a, b) =>
  a.left < b.right + 4 &&
  a.right + 4 > b.left &&
  a.top < b.bottom + 3 &&
  a.bottom + 3 > b.top;

function hitsStar(box, star, own) {
  for (const other of own) {
    if (other === star) continue;
    const cx = Math.max(box.left, Math.min(other.x, box.right));
    const cy = Math.max(box.top, Math.min(other.y, box.bottom));
    if (Math.hypot(other.x - cx, other.y - cy) < other.r + 6) return true;
  }
  return false;
}

function placeLabels(stars, dense) {
  const placed = [
    { left: CX - 64, right: CX + 64, top: CY + 22, bottom: CY + 46 }, // core caption
  ];
  const ordered = [...stars].sort((a, b) => a.radius - b.radius);

  for (const star of ordered) {
    const nameWidth = star.name.length * (dense ? 7.4 : 8.7);
    const metaWidth = dense ? 0 : star.meta.length * 6.5;
    const width = Math.max(nameWidth, metaWidth) + 4;
    const height = dense ? 17 : 28;
    let chosen = null;

    for (const offset of LABEL_OFFSETS) {
      const box = labelBox(star, offset, width, height);
      if (box.left < 500 || box.right > W - 8 || box.top < 8 || box.bottom > H - 8) continue;
      if (placed.some((other) => overlaps(box, other))) continue;
      if (hitsStar(box, star, stars)) continue;
      chosen = { offset, box };
      break;
    }

    if (!chosen) {
      const offset = LABEL_OFFSETS[0];
      chosen = { offset, box: labelBox(star, offset, width, height) };
    }

    star.label = chosen.offset;
    placed.push(chosen.box);
  }
}

function buildSvg({ stars, armCount, languages, dense }) {
  const fills = [...new Set(stars.map((star) => star.fill))];
  const gradientId = (fill) => `glow${fills.indexOf(fill)}`;

  const dustRand = mulberry32(0x51ed270b);
  const armOffsets = Array.from({ length: armCount }, (_, i) => (i * 2 * Math.PI) / armCount);
  const armColor = (index) =>
    LANG_FILL[languages[index % Math.max(1, languages.length)]] || FALLBACK_FILL;

  const armPath = (offset) => {
    const steps = 80;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const radius = R_MIN * 0.62 + (R_MAX - R_MIN * 0.62) * s;
      const theta =
        offset + (SWEEP * Math.log(radius / (R_MIN * 0.62))) / Math.log(R_MAX / (R_MIN * 0.62));
      const x = CX + Math.cos(theta) * radius * XS;
      const y = CY + Math.sin(theta) * radius * YS;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  const arms = armOffsets
    .map(
      (offset, index) => `<path d="${armPath(offset)}" fill="none" stroke="${armColor(index)}" stroke-opacity="0.14" stroke-width="18" stroke-linecap="round"/>
    <path d="${armPath(offset)}" fill="none" stroke="${C.ink}" stroke-opacity="0.05" stroke-width="4" stroke-linecap="round"/>`,
    )
    .join("\n    ");

  const dust = [];
  for (let i = 0; i < 300; i++) {
    const arm = Math.floor(dustRand() * armCount);
    const s = dustRand();
    const radius = R_MIN * 0.5 + (R_MAX - R_MIN * 0.5) * s;
    const theta =
      armOffsets[arm] +
      (SWEEP * Math.log(radius / (R_MIN * 0.5))) / Math.log(R_MAX / (R_MIN * 0.5)) +
      (dustRand() - 0.5) * 0.55;
    const x = CX + Math.cos(theta) * radius * XS;
    const y = CY + Math.sin(theta) * radius * YS;
    const r = (0.5 + dustRand() * 1.1).toFixed(1);
    const opacity = (0.1 + dustRand() * 0.35).toFixed(2);
    const tone = dustRand() < 0.55 ? C.cyan : dustRand() < 0.7 ? C.violet : C.ink;
    dust.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${tone}" opacity="${opacity}"/>`,
    );
  }

  const background = [];
  for (let i = 0; i < 150; i++) {
    const x = (dustRand() < 0.78 ? 540 + dustRand() * 650 : 40 + dustRand() * 480).toFixed(1);
    const y = (24 + dustRand() * 372).toFixed(1);
    const r = (0.5 + dustRand() * 0.9).toFixed(1);
    const twinkle = `t${1 + Math.floor(dustRand() * 3)}`;
    background.push(
      `<circle class="${twinkle}" cx="${x}" cy="${y}" r="${r}" fill="${C.ink}" opacity="0.35"/>`,
    );
  }

  const starMarkup = stars.map((star, index) => {
    const pulse = `p${(index % 3) + 1}`;
    const label = star.label;
    const ring =
      star.stars > 0
        ? `<circle cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(1)}" r="${(star.r + 4.5).toFixed(1)}" fill="none" stroke="${C.cyan}" stroke-opacity="0.55" stroke-width="0.9"/>`
        : "";
    return `<g opacity="${star.opacity.toFixed(2)}">
      <circle class="${pulse}" cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(1)}" r="${(star.r * 3.4).toFixed(1)}" fill="url(#${gradientId(star.fill)})"/>
      ${ring}
      <circle cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(1)}" r="${star.r.toFixed(1)}" fill="${star.fill}"/>
      <circle cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(1)}" r="${(star.r * 0.34).toFixed(1)}" fill="${C.ink}" opacity="0.85"/>
      <text class="lbl${dense ? " small" : ""}" x="${(star.x + label.dx).toFixed(1)}" y="${(star.y + label.dy).toFixed(1)}" text-anchor="${label.anchor}">${esc(star.name)}</text>
      ${dense ? "" : `<text class="meta" x="${(star.x + label.dx).toFixed(1)}" y="${(star.y + label.dy + 12).toFixed(1)}" text-anchor="${label.anchor}">${esc(star.meta)}</text>`}
    </g>`;
  });

  const gradients = fills
    .map(
      (fill, index) =>
        `<radialGradient id="glow${index}"><stop offset="0" stop-color="${fill}" stop-opacity="0.5"/><stop offset="0.55" stop-color="${fill}" stop-opacity="0.12"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></radialGradient>`,
    )
    .join("\n      ");

  const listed = stars.map((star) => `${star.name} (${star.language})`).join(", ");
  const reducedMotion = `
    @media (prefers-reduced-motion: reduce) {
      .arms, .p1, .p2, .p3, .t1, .t2, .t3 { animation: none !important; }
    }`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="galaxyTitle galaxyDesc">
  <title id="galaxyTitle">Subhamita Adhikari — repository galaxy</title>
  <desc id="galaxyDesc">An animated spiral galaxy where each named star is a GitHub repository: ${esc(listed)}. Star colour is the primary language, size is repository size, brightness is push recency, and distance from the core is age. Background dust is decorative.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg0}"/>
      <stop offset="1" stop-color="${C.bg1}"/>
    </linearGradient>
    <radialGradient id="core">
      <stop offset="0" stop-color="${C.ink}" stop-opacity="0.95"/>
      <stop offset="0.28" stop-color="${C.cyan}" stop-opacity="0.6"/>
      <stop offset="0.62" stop-color="${C.blue}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
    </radialGradient>
      ${gradients}
  </defs>
  <style>
    .h1 { font: 700 58px ${FONT_SANS}; fill: ${C.ink}; letter-spacing: 1px; }
    .tag { font: 600 12px ${FONT_SANS}; fill: ${C.cyan}; letter-spacing: 3px; }
    .tagline { font: 400 21px ${FONT_SANS}; fill: ${C.muted}; letter-spacing: 0.3px; }
    .intro { font: 400 15px ${FONT_SANS}; fill: ${C.dim}; letter-spacing: 0.4px; }
    .legend { font: 400 12px ${FONT_SANS}; fill: ${C.dim}; }
    .lbl { font: 600 14px ${FONT_MONO}; fill: ${C.ink}; }
    .lbl.small { font-size: 12px; }
    .meta { font: 400 10.5px ${FONT_MONO}; fill: ${C.muted}; letter-spacing: 0.2px; }
    .arms { transform-box: view-box; transform-origin: ${CX}px ${CY}px; animation: spin 240s linear infinite; }
    .t1 { animation: twinkle 7s ease-in-out infinite; }
    .t2 { animation: twinkle 9s ease-in-out infinite 0.8s; }
    .t3 { animation: twinkle 11s ease-in-out infinite 1.6s; }
    .p1 { animation: pulse 7s ease-in-out infinite; }
    .p2 { animation: pulse 9s ease-in-out infinite 0.9s; }
    .p3 { animation: pulse 11s ease-in-out infinite 1.8s; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes twinkle { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.85; } }
    @keyframes pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }${reducedMotion}
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="url(#bg)" stroke="${C.border}" stroke-width="1"/>
  <g>${background.join("")}</g>
  <g class="arms">
    ${arms}
    ${dust.join("")}
  </g>
  <circle cx="${CX}" cy="${CY}" r="54" fill="url(#core)"/>
  <circle cx="${CX}" cy="${CY}" r="22" fill="none" stroke="${C.blue}" stroke-opacity="0.45" stroke-width="1"/>
  <circle cx="${CX}" cy="${CY}" r="7" fill="${C.ink}"/>
  <text class="tag" x="${CX}" y="${CY + 34}" text-anchor="middle" style="font-size:9px;letter-spacing:1.6px;fill:${C.muted}">SUBHAMITA ADHIKARI</text>
  ${starMarkup.join("\n  ")}
  <text class="tag" x="64" y="96">PORTFOLIO / 2026</text>
  <text class="h1" x="64" y="170">SUBHAMITA</text>
  <text class="h1" x="64" y="230">ADHIKARI</text>
  <text class="tagline" x="64" y="266">Beyond the Code. Into the Cosmos.</text>
  <line x1="64" y1="290" x2="132" y2="290" stroke="${C.blue}" stroke-width="2"/>
  <text class="intro" x="64" y="322">AI/ML · Full-stack · Interface design</text>
  <text class="legend" x="64" y="364">Each star is a repository. Dust is decorative.</text>
</svg>
`;
}

async function main() {
  const repos = FIXTURE ? loadFixture(FIXTURE) : await loadLive();
  if (!repos.length) throw new Error("No repositories to plot");

  const picked = pickRepos(repos);
  const model = layout(picked);
  const svg = buildSvg(model);

  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes > 60 * 1024) {
    throw new Error(`Refusing to write ${bytes} bytes (over the 60 KB budget)`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg, "utf8");

  console.log(
    `Wrote ${OUT} (${(bytes / 1024).toFixed(1)} KB) with ${model.stars.length} starred repos: ${model.stars.map((s) => s.name).join(", ")}`,
  );
}

main().catch((error) => {
  console.error(`galaxy: ${error.message}`);
  process.exit(1); // leave the previous SVG untouched
});
