import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CARD = { w: 960, h: 360, rx: 20 };
const CENTER = { x: 480, y: 180 };
const SUN = { r: 43, image: 86 };
const ORBIT = { base: 130, step: 65, ratio: 0.42, count: 4 };
const PLANET_LIMIT = 4;
const MOON_LIMIT = 12;
const COMET_DAYS = 30;
const COMET_LIMIT = 4;
const COMET_LOOP = 28;

const OUTPUT = fileURLToPath(new URL("../assets/solar-system.svg", import.meta.url));
const LOGIN = process.env.USERNAME || "Arjun07707";
const TOKEN = process.env.GITHUB_TOKEN;
const EXCLUDE = new Set([LOGIN]);

const COLORS = {
  bg: "#05070D",
  bgLift: "#101A2E",
  border: "#202C40",
  ink: "#DCE9F4",
  muted: "#8FA6B8",
  gold: "#F5C46B",
  goldBright: "#FFE3A3",
  moon: "#F5F7FF",
  orbit: "#34465F",
};

const LANGUAGES = {
  TypeScript: { color: "#3984FF", badge: "TS" },
  Python: { color: "#42D9FF", badge: "PY" },
  CSS: { color: "#9270FF", badge: "CSS" },
  JavaScript: { color: "#F1E05A", badge: "JS" },
};
const FALLBACK = { color: "#68758A" };

// Each comet crosses a little of the upper half of the card while visible.
const COMET_PATHS = [
  "M 236,74 L 906,286",
  "M 300,52 L 884,206",
  "M 214,100 L 850,306",
  "M 340,64 L 920,242",
];

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

function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp(((value >> 16) & 255) + amount);
  const g = clamp(((value >> 8) & 255) + amount);
  const b = clamp((value & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

function languageMeta(language) {
  if (LANGUAGES[language]) return LANGUAGES[language];
  const badge = language === "Other" ? "OTH" : language.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "OTH";
  return { color: FALLBACK.color, badge };
}

function shareLabel(share) {
  const pct = share * 100;
  if (pct < 1) return "<1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.floor(pct)}%`;
}

function truncate(value, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "solar-system-card",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    const detail = payload?.message ? `${payload.message}` : `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${detail}`);
  }
  return payload;
}

async function fetchProfile() {
  const profile = await api(`/users/${encodeURIComponent(LOGIN)}`);
  if (!profile?.avatar_url) throw new Error("profile has no avatar_url");

  const separator = profile.avatar_url.includes("?") ? "&" : "?";
  const response = await fetch(`${profile.avatar_url}${separator}s=160`, {
    headers: { "User-Agent": "solar-system-card" },
  });
  if (!response.ok) throw new Error(`avatar download failed: HTTP ${response.status}`);

  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`avatar is not an image (${type || "unknown"})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("avatar download was empty");

  return {
    avatar: `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`,
    name: profile.name || LOGIN,
  };
}

async function fetchRepos() {
  const repos = await api(`/users/${encodeURIComponent(LOGIN)}/repos?per_page=100&sort=pushed&type=owner`);
  if (!Array.isArray(repos)) throw new Error("repository list was not an array");

  const candidates = repos
    .filter((repo) => !repo.fork && !repo.private && !EXCLUDE.has(repo.name))
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) return b.stargazers_count - a.stargazers_count;
      if (a.pushed_at !== b.pushed_at) return String(b.pushed_at).localeCompare(String(a.pushed_at));
      return a.name.localeCompare(b.name);
    });

  if (candidates.length === 0) throw new Error("no public non-fork repositories found");

  const entries = [];
  for (const repo of candidates) {
    const slug = repo.full_name.split("/").map(encodeURIComponent).join("/");
    const languages = await api(`/repos/${slug}/languages`);
    const top = Object.entries(languages)
      .filter(([, bytes]) => Number(bytes) > 0)
      .sort((a, b) => b[1] - a[1])[0];
    entries.push({
      name: repo.name,
      language: top?.[0] || repo.language || "Other",
      languages,
      pushedAt: repo.pushed_at,
      stars: Number(repo.stargazers_count) || 0,
    });
  }

  return entries;
}

async function fetchRecentPushes() {
  const events = await api(`/users/${encodeURIComponent(LOGIN)}/events/public?per_page=100`);
  if (!Array.isArray(events)) throw new Error("events feed was not an array");

  const now = Date.now();
  const cutoff = now - COMET_DAYS * 24 * 60 * 60 * 1000;
  const latest = new Map();

  for (const event of events) {
    if (event.type !== "PushEvent") continue;
    const at = new Date(event.created_at).getTime();
    if (!Number.isFinite(at) || at < cutoff) continue;
    const [owner, name] = String(event.repo?.name || "").split("/");
    if (owner !== LOGIN || !name || EXCLUDE.has(name)) continue;
    if (!latest.has(name) || at > latest.get(name)) latest.set(name, at);
  }

  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COMET_LIMIT)
    .map(([name, at]) => ({
      name,
      ageDays: Math.max(0, (now - at) / (24 * 60 * 60 * 1000)),
    }));
}

function buildPlanets(repos) {
  const totals = {};
  for (const repo of repos) {
    for (const [language, bytes] of Object.entries(repo.languages)) {
      totals[language] = (totals[language] || 0) + (Number(bytes) || 0);
    }
  }

  const totalBytes = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  if (totalBytes <= 0) throw new Error("no language bytes found");

  const languages = Object.entries(totals)
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1]);
  const chosen = languages.filter(([, bytes]) => bytes / totalBytes >= 0.01).slice(0, PLANET_LIMIT);
  if (chosen.length === 0) chosen.push(languages[0]);

  // Two planets sit on opposite sides of the ring stack so they never crowd
  // each other; a single planet takes the middle ring.
  const slots = chosen.length === 1 ? [2] : chosen.length === 2 ? [2, 0] : [0, 1, 2, 3].slice(0, chosen.length);
  const radiusCap = chosen.length === 2 ? 34 : 38;

  const planets = chosen.map(([language, bytes], index) => {
    const share = bytes / totalBytes;
    const meta = languageMeta(language);
    const radius = Math.min(radiusCap, Math.max(12, 14 + 22 * Math.sqrt(share)));
    const slot = slots[index];
    const rx = ORBIT.base + ORBIT.step * slot;
    const ry = rx * ORBIT.ratio;
    const duration = 60 + (hash(`${language}:lap`) % 81);
    const begin = -((hash(`${language}:phase`) % (duration * 10)) / 10);

    return {
      language,
      share,
      color: meta.color,
      badge: meta.badge,
      radius,
      slot,
      rx,
      ry,
      duration,
      begin,
      moons: [],
      label: `${language} ${shareLabel(share)}`,
      gradient: `planet-${index}`,
      moonOffset: radius + 16,
    };
  });

  const byLanguage = new Map(planets.map((planet) => [planet.language, planet]));
  for (const repo of repos) {
    const planet = byLanguage.get(repo.language) || planets[0];
    if (planet.moons.length >= MOON_LIMIT) continue;
    const seed = hash(`${repo.name}:moon`);
    planet.moons.push({
      name: repo.name,
      radius: 2.2 + (seed % 3) * 0.5,
      orbit: planet.moonOffset + 9 * planet.moons.length,
      duration: 10 + (hash(`${repo.name}:lap`) % 11),
      begin: -((hash(`${repo.name}:moonphase`) % 200) / 10),
    });
  }

  return { planets };
}

function starField() {
  const stars = [];
  for (let i = 0; i < 80; i += 1) {
    const h = hash(`star:${i}`);
    const x = 18 + (h % (CARD.w - 36));
    const y = 16 + ((h >>> 10) % (CARD.h - 32));
    const distance = Math.hypot(x - CENTER.x, y - CENTER.y);
    if (distance < 92) continue;
    const r = 0.55 + ((h >>> 20) % 9) * 0.1;
    const group = i % 3;
    const delay = -((h >>> 5) % 90) / 10;
    stars.push(
      `<circle class="star star-${group}" style="--delay:${delay}s" cx="${x}" cy="${y}" r="${r.toFixed(2)}" opacity="${(0.35 + ((h >>> 24) % 40) / 100).toFixed(2)}"/>`,
    );
  }
  return stars.join("\n");
}

function orbitRings() {
  const rings = [];
  for (let i = 0; i < ORBIT.count; i += 1) {
    const rx = ORBIT.base + ORBIT.step * i;
    const ry = rx * ORBIT.ratio;
    rings.push(
      `<ellipse cx="${CENTER.x}" cy="${CENTER.y}" rx="${rx}" ry="${ry.toFixed(1)}" fill="none" stroke="${COLORS.orbit}" stroke-opacity="${(0.62 - i * 0.08).toFixed(2)}" stroke-width="1" stroke-dasharray="4 8"/>`,
    );
  }
  return rings.join("\n");
}

function planetMarkup(planet) {
  const { radius, color, badge, gradient, moons } = planet;
  const badgeSize = Math.max(7, Math.min(11, radius * 0.52));

  const moonRings = moons
    .map(
      (moon) =>
        `<circle r="${moon.orbit}" fill="none" stroke="${color}" stroke-opacity="0.26" stroke-width="0.9" stroke-dasharray="2 7"/>`,
    )
    .join("\n");

  const moonDots = moons
    .map(
      (moon) => `<g class="moon">
        <animateMotion dur="${moon.duration}s" begin="${moon.begin}s" repeatCount="indefinite" path="M ${moon.orbit},0 A ${moon.orbit},${moon.orbit} 0 1,1 -${moon.orbit},0 A ${moon.orbit},${moon.orbit} 0 1,1 ${moon.orbit},0"/>
        <circle r="${moon.radius.toFixed(1)}" fill="${COLORS.moon}"/>
        <circle r="${(moon.radius * 0.55).toFixed(1)}" fill="#A9C4E8" opacity="0.55"/>
      </g>`,
    )
    .join("\n");

  return `<g class="planet">
    <animateMotion dur="${planet.duration}s" begin="${planet.begin}s" repeatCount="indefinite" path="M ${planet.rx},0 A ${planet.rx},${planet.ry.toFixed(1)} 0 1,1 -${planet.rx},0 A ${planet.rx},${planet.ry.toFixed(1)} 0 1,1 ${planet.rx},0"/>
    ${moonRings}
    ${moonDots}
    <circle class="planet-body" r="${radius.toFixed(1)}" fill="url(#${gradient})" stroke="${color}" stroke-opacity="0.6" stroke-width="1"/>
    <ellipse cx="${(-radius * 0.3).toFixed(1)}" cy="${(-radius * 0.34).toFixed(1)}" rx="${(radius * 0.4).toFixed(1)}" ry="${(radius * 0.26).toFixed(1)}" fill="#FFFFFF" opacity="0.13"/>
    <text class="planet-badge" x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${badgeSize.toFixed(1)}">${esc(badge)}</text>
  </g>`;
}

function languageKey(planets) {
  const top = planets.length >= 4 ? 282 : planets.length === 3 ? 288 : 306;
  const gap = planets.length >= 3 ? 18 : 20;
  const items = planets.map((planet, index) => {
    const y = top + gap + index * gap;
    return `<g class="key-row">
      <circle cx="32" cy="${y - 4.5}" r="3.6" fill="${planet.color}"/>
      <text x="42" y="${y}">${esc(planet.language)} ${shareLabel(planet.share)}</text>
    </g>`;
  });

  return `<g class="language-key" aria-hidden="true">
    <text class="key-title" x="30" y="${top}">LANGUAGES</text>
${items.join("\n")}
  </g>`;
}

function cometMarkup(comet, index) {
  const path = COMET_PATHS[index % COMET_PATHS.length];
  const delay = -((hash(`${comet.name}:comet`) % (COMET_LOOP * 10)) / 10);
  const recency = 1 - Math.min(1, comet.ageDays / COMET_DAYS);
  const tail = 42 + recency * 30;
  const name = truncate(comet.name, 20);

  return `<g class="comet" style="--delay:${delay}s">
    <animateMotion dur="${COMET_LOOP}s" begin="${delay}s" repeatCount="indefinite" path="${path}"/>
    <path d="M 0 0 C ${(-tail * 0.34).toFixed(1)} ${(-tail * 0.22).toFixed(1)}, ${(-tail * 0.72).toFixed(1)} ${(-tail * 0.34).toFixed(1)}, ${(-tail).toFixed(1)} ${(-tail * 0.38).toFixed(1)} C ${(-tail * 0.6).toFixed(1)} ${(-tail * 0.16).toFixed(1)}, ${(-tail * 0.24).toFixed(1)} ${(tail * 0.02).toFixed(1)}, 0 0 Z" fill="url(#comet-tail-${index})"/>
    <circle r="5.5" fill="url(#comet-glow)" opacity="0.7"/>
    <circle r="2.5" fill="${COLORS.goldBright}"/>
    <text class="comet-label" x="10" y="4">${esc(name)}</text>
  </g>`;
}

function buildSvg({ profile, planets, comets }) {
  const moonCount = planets.reduce((sum, planet) => sum + planet.moons.length, 0);
  const pushText = comets.length === 1 ? "1 recent push" : `${comets.length} recent pushes`;
  const title = `Solar system \u2014 ${planets.length} languages, ${moonCount} repositories, ${pushText}`;
  const description =
    `${profile.name}'s avatar is the sun. ` +
    planets.map((planet) => `${planet.language} ${shareLabel(planet.share)}`).join(", ") +
    ` orbit as planets. ${moonCount} public repositories orbit as moons, and ` +
    (comets.length === 1 ? "1 recent push crosses as a comet." : `${comets.length} recent pushes cross as comets.`);

  const planetGradients = planets
    .map(
      (planet) => `<radialGradient id="${planet.gradient}" cx="34%" cy="28%" r="78%">
    <stop offset="0" stop-color="${shade(planet.color, 62)}"/>
    <stop offset="0.55" stop-color="${planet.color}"/>
    <stop offset="1" stop-color="${shade(planet.color, -60)}"/>
  </radialGradient>`,
    )
    .join("\n  ");

  const cometGradients = comets
    .map((comet, index) => {
      const recency = 1 - Math.min(1, comet.ageDays / COMET_DAYS);
      const tail = 42 + recency * 30;
      return `<linearGradient id="comet-tail-${index}" x1="0" y1="0" x2="${(-tail).toFixed(1)}" y2="${(-tail * 0.38).toFixed(1)}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${COLORS.goldBright}" stop-opacity="0.95"/>
    <stop offset="0.55" stop-color="${COLORS.gold}" stop-opacity="0.4"/>
    <stop offset="1" stop-color="${COLORS.gold}" stop-opacity="0"/>
  </linearGradient>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}" role="img" aria-labelledby="solar-title solar-desc">
<title id="solar-title">${esc(title)}</title>
<desc id="solar-desc">${esc(description)}</desc>
<defs>
  <radialGradient id="solar-bg" cx="50%" cy="50%" r="76%">
    <stop offset="0" stop-color="${COLORS.bgLift}"/>
    <stop offset="0.55" stop-color="#080D18"/>
    <stop offset="1" stop-color="${COLORS.bg}"/>
  </radialGradient>
  <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${COLORS.gold}" stop-opacity="0.26"/>
    <stop offset="0.45" stop-color="${COLORS.gold}" stop-opacity="0.1"/>
    <stop offset="1" stop-color="${COLORS.gold}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="comet-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${COLORS.goldBright}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${COLORS.gold}" stop-opacity="0"/>
  </radialGradient>
  ${planetGradients}
  ${cometGradients}
  <clipPath id="solar-clip"><rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}"/></clipPath>
  <clipPath id="sun-clip"><circle cx="${CENTER.x}" cy="${CENTER.y}" r="${SUN.r}"/></clipPath>
  <style>
    .solar text { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
    .eyebrow { font-size: 12px; fill: ${COLORS.muted}; letter-spacing: 2.4px; font-weight: 600; }
    .planet-badge { fill: #FFFFFF; font-weight: 700; letter-spacing: 0.4px; paint-order: stroke; stroke: #05070D; stroke-width: 2.4px; stroke-linejoin: round; }
    .language-key text { font-size: 15px; fill: ${COLORS.ink}; paint-order: stroke; stroke: ${COLORS.bg}; stroke-width: 4px; stroke-linejoin: round; }
    .language-key .key-title { font-size: 10px; fill: ${COLORS.muted}; letter-spacing: 2px; font-weight: 600; stroke-width: 3px; }
    .comet-label { font-size: 12.5px; fill: ${COLORS.ink}; paint-order: stroke; stroke: ${COLORS.bg}; stroke-width: 3.5px; stroke-linejoin: round; }
    .legend { font-size: 13px; fill: ${COLORS.muted}; }
    .star { fill: ${COLORS.ink}; animation: solarTwinkle 7s ease-in-out infinite; animation-delay: var(--delay, 0s); }
    .star-1 { animation-duration: 9s; }
    .star-2 { animation-duration: 12s; }
    @keyframes solarTwinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.85; } }
    .comet { opacity: 0; animation: solarComet ${COMET_LOOP}s linear infinite; animation-delay: var(--delay, 0s); }
    @keyframes solarComet {
      0% { opacity: 0; }
      3% { opacity: 0.95; }
      25% { opacity: 0.95; }
      30% { opacity: 0; }
      100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .star, .comet { animation: none !important; }
      .comet { opacity: 0; }
    }
  </style>
</defs>
<g class="solar" clip-path="url(#solar-clip)">
  <rect x="0.5" y="0.5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.rx}" fill="url(#solar-bg)" stroke="${COLORS.border}"/>
  <circle cx="${CENTER.x}" cy="${CENTER.y}" r="132" fill="url(#sun-glow)"/>
${starField()}
  <g class="orbits">
${orbitRings()}
  </g>
${comets.map((comet, index) => cometMarkup(comet, index)).join("\n")}
  <g class="system" transform="translate(${CENTER.x} ${CENTER.y})">
${planets.map((planet) => planetMarkup(planet)).join("\n")}
  </g>
  <g class="sun">
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="52" fill="none" stroke="${COLORS.gold}" stroke-opacity="0.16" stroke-width="1" stroke-dasharray="2 7"/>
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="47" fill="none" stroke="${COLORS.gold}" stroke-opacity="0.3" stroke-width="1"/>
    <image href="${esc(profile.avatar)}" x="${CENTER.x - SUN.image / 2}" y="${CENTER.y - SUN.image / 2}" width="${SUN.image}" height="${SUN.image}" clip-path="url(#sun-clip)" preserveAspectRatio="xMidYMid slice"/>
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="${SUN.r}" fill="none" stroke="${COLORS.gold}" stroke-width="5" stroke-opacity="0.14"/>
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="${SUN.r}" fill="none" stroke="${COLORS.goldBright}" stroke-width="2.2"/>
  </g>
  <text class="eyebrow" x="28" y="34">SOLAR SYSTEM \u00b7 @${esc(LOGIN)}</text>
  ${languageKey(planets)}
  <g class="legend" text-anchor="end">
    <text x="932" y="334">planets = languages \u00b7 moons = repos</text>
    <text x="932" y="352">comets = recent pushes</text>
  </g>
</g>
</svg>
`;
}

try {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is empty");
  const [profile, repos, comets] = await Promise.all([fetchProfile(), fetchRepos(), fetchRecentPushes()]);
  const { planets } = buildPlanets(repos);
  const svg = buildSvg({ profile, planets, comets });
  writeFileSync(OUTPUT, svg);

  console.log(
    `solar-system: wrote assets/solar-system.svg (${planets.length} planets, ${repos.length} repos, ` +
      `${comets.length} comets, ${(svg.length / 1024).toFixed(1)} KB)`,
  );
} catch (error) {
  console.error(`solar-system: ${error.message}`);
  process.exitCode = 1;
}


