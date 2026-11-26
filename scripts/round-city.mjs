import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../profile-3d-contrib/profile-cosmic-city.svg", import.meta.url);
let svg = readFileSync(file, "utf8");

if (svg.includes('id="city-card-border"')) {
  console.log("city: card frame already applied");
  process.exit(0);
}

const background = /(<rect\b[^>]*\bclass="fill-bg"[^>]*?)(\/?>)/;
if (!background.test(svg)) {
  console.error("city: could not find the background rect");
  process.exit(1);
}

svg = svg.replace(background, (_match, attrs, close) => {
  if (/\brx=/.test(attrs)) return `${attrs}${close}`;
  return `${attrs} rx="18"${close}`;
});

const border =
  '<rect id="city-card-border" x="1" y="1" width="1278" height="848" rx="18" ' +
  'fill="none" stroke="#202C40" stroke-width="2"/>';

if (!svg.includes("</svg>")) {
  console.error("city: could not find the closing svg tag");
  process.exit(1);
}
svg = svg.replace("</svg>", `${border}\n</svg>`);

writeFileSync(file, svg);
console.log(`city: rounded card frame applied (${Buffer.byteLength(svg)} bytes)`);
