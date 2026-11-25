// news-image-20261124: "The World in One Day: Tuesday 24 November 2026"
// A one-page newspaper front page drawn entirely in code (Node 22+, stdlib only).
// 32 verified stories: 3 heroes + 23 regional modules + 6 ALSO ON.
// Lead: IRGC says 3 tankers hit mines in Hormuz (attributed claim, never fact).
// All facts from the refreshed DOSSIER.md (full UTC day, final US closes).
// Text comes from a pre-rendered DejaVu font atlas (font-atlas.bin, a data asset).
// The program writes <outDir>/entry.png (MAKEFUN_OUTPUT_DIR or ./out).
// Deterministic: two runs write byte-identical output. No network, no writes
// outside the output directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

// ---------------------------------------------------------------- constants
const W = 1024;
const H = 1024;
const MARGIN = 12;
const CONTENT_W = W - MARGIN * 2;
const RIGHT = W - MARGIN;

const PAPER: [number, number, number] = [247, 239, 216];
const NAVY: [number, number, number] = [22, 38, 76];
const NAVY_PANEL: [number, number, number] = [30, 47, 87];
const RED: [number, number, number] = [178, 32, 40];
const INK: [number, number, number] = [32, 32, 32];
const GREY: [number, number, number] = [96, 100, 110];
const GREEN: [number, number, number] = [46, 125, 50];
const AMBER: [number, number, number] = [183, 121, 31];
const TEAL: [number, number, number] = [15, 118, 110];
const SEA: [number, number, number] = [214, 228, 238];
const LAND: [number, number, number] = [203, 186, 138];
const WHITE: [number, number, number] = [255, 255, 255];
const CREAM_LINE: [number, number, number] = [214, 203, 170];
const SKY: [number, number, number] = [26, 48, 84];
const HORIZON: [number, number, number] = [232, 150, 70];
const WATER: [number, number, number] = [38, 84, 110];
const SHIP: [number, number, number] = [16, 22, 34];

const REGION_COLORS: Record<string, [number, number, number]> = {
  EUROPE: [31, 58, 110],
  "MIDDLE EAST": [168, 30, 40],
  AFRICA: [46, 125, 50],
  "ASIA-PACIFIC": [183, 121, 31],
  AMERICAS: [15, 118, 110],
  GLOBAL: [91, 100, 112],
};
const TAG_COLORS: Record<string, [number, number, number]> = {
  CONFIRMED: [46, 125, 50],
  CLAIM: [198, 40, 40],
};

// ------------------------------------------------------------ font atlas
// File layout: one JSON header line, then raw grayscale coverage bytes.
// Header: {"v":1,"glyphs":{"family|scale|char":{"o":offset,"w":w,"h":h,
// "adv":advance,"bx":bearingX,"by":bearingY}}}. Offsets are relative to the
// first byte after the header newline. Families: serif, serifr, sansb, sans.
// Glyph bitmaps are row-major, one coverage byte per pixel (0 clear, 255 ink).
// Placement: for a font whose capital A is capH tall, a glyph sits with its
// top at baseline - capH + by and its left at x + bx.

function findAtlas(): string {
  const fromEnv = process.env.MAKEFUN_BOT_DIR;
  const candidates = [
    fromEnv ? path.join(fromEnv, "font-atlas.bin") : "",
    path.join(path.dirname(fileURLToPath(import.meta.url)), "font-atlas.bin"),
    path.join(process.cwd(), "font-atlas.bin"),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("font-atlas.bin not found");
}

const atlasBuf = fs.readFileSync(findAtlas());
const headerEnd = atlasBuf.indexOf(10);
const atlasHeader = JSON.parse(atlasBuf.subarray(0, headerEnd).toString("utf8")) as {
  v: number;
  glyphs: Record<string, { o: number; w: number; h: number; adv: number; bx: number; by: number }>;
};
const DATA_START = headerEnd + 1;
const GLYPHS = atlasHeader.glyphs;

type FontKey = string;

function glyphFor(font: FontKey, ch: string) {
  const g = GLYPHS[font + "|" + ch];
  if (!g) throw new Error("missing glyph " + font + " " + JSON.stringify(ch));
  return g;
}

function capHeight(font: FontKey): number {
  return glyphFor(font, "A").h;
}

function measure(font: FontKey, text: string): number {
  let w = 0;
  for (const ch of text.toUpperCase()) {
    if (ch === "+") {
      w += Math.round(capHeight(font) * 0.6);
      continue;
    }
    w += glyphFor(font, ch).adv;
  }
  return w;
}

// ---------------------------------------------------------------- canvas
const px = new Uint8ClampedArray(W * H * 4);

function fillAll(c: [number, number, number]): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = c[0];
    px[i * 4 + 1] = c[1];
    px[i * 4 + 2] = c[2];
    px[i * 4 + 3] = 255;
  }
}

function setPixel(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const k = (y * W + x) * 4;
  px[k] = c[0];
  px[k + 1] = c[1];
  px[k + 2] = c[2];
}

function blendPixel(x: number, y: number, c: [number, number, number], a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a >= 1) {
    setPixel(x, y, c);
    return;
  }
  const k = (y * W + x) * 4;
  px[k] = Math.round(px[k] * (1 - a) + c[0] * a);
  px[k + 1] = Math.round(px[k + 1] * (1 - a) + c[1] * a);
  px[k + 2] = Math.round(px[k + 2] * (1 - a) + c[2] * a);
}

function rect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      const k = (j * W + i) * 4;
      px[k] = c[0];
      px[k + 1] = c[1];
      px[k + 2] = c[2];
    }
  }
}

function hline(x: number, y: number, w: number, c: [number, number, number]): void {
  rect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: [number, number, number]): void {
  rect(x, y, 1, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(ax, ay, c);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

function filledCircle(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const rr = Math.round(r);
  for (let j = -rr; j <= rr; j++) {
    const half = Math.floor(Math.sqrt(rr * rr - j * j));
    for (let i = -half; i <= half; i++) setPixel(Math.round(cx) + i, Math.round(cy) + j, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const rr = Math.round(r);
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    setPixel(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
  }
}

// Scanline polygon fill. Points are [x, y] pairs.
function polygon(points: Array<[number, number]>, c: [number, number, number]): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.ceil(xs[k]);
      const xb = Math.floor(xs[k + 1]);
      for (let x = xa; x <= xb; x++) setPixel(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- text
function drawPlus(cx: number, cy: number, size: number, c: [number, number, number]): void {
  const t = Math.max(2, Math.round(size / 4));
  rect(cx - Math.round(size / 2), cy - Math.round(t / 2), size, t, c);
  rect(cx - Math.round(t / 2), cy - Math.round(size / 2), t, size, c);
}

function drawText(font: FontKey, x: number, baseline: number, text: string, c: [number, number, number]): number {
  const capH = capHeight(font);
  let cx = Math.round(x);
  const by0 = Math.round(baseline);
  for (const ch of text.toUpperCase()) {
    if (ch === "+") {
      // The atlas has no plus glyph; draw one from bars.
      const size = Math.max(6, Math.round(capH * 0.55));
      const adv = Math.round(capH * 0.6);
      drawPlus(cx + Math.round(adv / 2), by0 - Math.round(capH / 2), size, c);
      cx += adv;
      continue;
    }
    const g = glyphFor(font, ch);
    const gx = cx + g.bx;
    const gy = by0 - capH + g.by;
    for (let row = 0; row < g.h; row++) {
      for (let col = 0; col < g.w; col++) {
        const cov = atlasBuf[DATA_START + g.o + row * g.w + col];
        if (cov) blendPixel(gx + col, gy + row, c, cov / 255);
      }
    }
    cx += g.adv;
  }
  return cx;
}

function drawTextCentered(font: FontKey, cx: number, baseline: number, text: string, c: [number, number, number]): void {
  const w = measure(font, text);
  drawText(font, cx - Math.round(w / 2), baseline, text, c);
}

function drawTextRight(font: FontKey, rightX: number, baseline: number, text: string, c: [number, number, number]): void {
  drawText(font, rightX - measure(font, text), baseline, text, c);
}

// Greedy word wrap to maxWidth. Returns lines of at most maxWidth.
function wrapText(font: FontKey, text: string, maxWidth: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur === "" ? word : cur + " " + word;
    if (measure(font, trial) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text, up to maxLines lines, at (x, firstBaseline) with lineHeight.
function drawWrapped(font: FontKey, x: number, firstBaseline: number, lineHeight: number, text: string, maxWidth: number, maxLines: number, c: [number, number, number]): number {
  const lines = wrapText(font, text, maxWidth).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(font, x, firstBaseline + i * lineHeight, ln, c));
  return lines.length;
}

// Small status tag pill. Returns the pill width.
function drawTag(x: number, y: number, label: string, bg: [number, number, number], h = 15): number {
  const font = "sansb|1";
  const tw = measure(font, label);
  const w = tw + 12;
  rect(x, y, w, h, bg);
  drawText(font, x + 6, y + 11, label, WHITE);
  return w;
}

// ---------------------------------------------------------------- png
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- stories
// 32 verified stories: 3 heroes + 23 modules + 6 ALSO ON.
// Module stories are split into a short headline plus a one-line body so the
// full wording from the dossier stays on the page without shrinking type.
// The atlas has no "&" glyph, so "S&P" is written "S AND P" everywhere.

type ModuleStory = { headline: string; body: string };

const MODULES: Array<{ region: string; stories: ModuleStory[] }> = [
  {
    region: "EUROPE",
    stories: [
      { headline: "Ukraine confirms Sparta II strike", body: "Russian cargo ship, Gulf of Finland" },
      { headline: "US delays about 60 Patriot interceptors", body: "For Ukraine, FT reports" },
      { headline: "Hungary PM Magyar meets Zelensky", body: "In Uzhhorod, first visit as PM" },
      { headline: "Sweden to vote on Kristersson as PM", body: "Vote planned 30 Nov" },
    ],
  },
  {
    region: "MIDDLE EAST",
    stories: [
      { headline: "Gaza: Hamas security chief killed", body: "At least 7 dead Tuesday" },
      { headline: "Gaza meningitis alert", body: "272 cases in Oct" },
      { headline: "Riyadh PIF Tower hit again", body: "11 wounded" },
      { headline: "UK sanctions Houthis", body: "4 senior figures listed" },
    ],
  },
  {
    region: "AFRICA",
    stories: [
      { headline: "DRC Ebola team evacuated from Akwe", body: "After 3 days sheltering in hospital" },
      { headline: "DRC military aircraft missing", body: "Rebels claim shootdown" },
      { headline: "Somalia and Uganda step up vs al-Shabaab", body: "Operations to intensify" },
    ],
  },
  {
    region: "ASIA-PACIFIC",
    stories: [
      { headline: "Shanghai party chief Chen Jining probed", body: "4th Politburo member since 2025" },
      { headline: "Indonesia factory fire toll rises to 26", body: "Saturday fire, toll rose Tuesday" },
      { headline: "Bangladesh garment workers clash", body: "Demand 30,000 taka wage" },
      { headline: "India pledges $1.6B to Nepal", body: "As PM Balen Shah visits Delhi" },
    ],
  },
  {
    region: "AMERICAS",
    stories: [
      { headline: "Colombia car bomb Monday night", body: "23 injured in Villavicencio" },
      { headline: "Cartagena hostage standoff ends", body: "All hostages freed" },
      { headline: "Venezuela debt $237.5B", body: "Economy plan published" },
      { headline: "Oregon and Virginia sue SpaceX", body: "Over Grok abuse images, filed Monday" },
    ],
  },
  {
    region: "GLOBAL",
    stories: [
      { headline: "Sanofi to buy Insmed for $41B", body: "Biggest pharma deal of 2026" },
      { headline: "Trump tariffs expected", body: "After Section 301 probe" },
      { headline: "China extends gallium export-ban pause", body: "Suspension to 27 Jan 2027" },
      { headline: "EU car registrations +2.6% in Oct", body: "9th straight month of growth" },
    ],
  },
];

const ALSO_ON: string[] = [
  "Zelensky seeks more US aid if no acceptable peace deal",
  "Russia warns Estonia moves verge on open war",
  "NATO chief vows defence vs space threat",
  "EU leaders debate Ukraine financing 26-27 Nov",
  "Qatar PM seeks to revive US-Iran talks",
  "South Korea offers up to $375,000 to catch AI cheats",
];

const MARKET_ITEMS: Array<{ value: string; label: string }> = [
  { value: "+3.9%", label: "NIKKEI" },
  { value: "+6.3%", label: "KOSPI" },
  { value: "+9.0%", label: "TAIEX" },
  { value: "-0.7%", label: "HANG SENG" },
  { value: "$91.40", label: "BRENT" },
  { value: "+0.3%", label: "SHANGHAI" },
];

// ---------------------------------------------------------------- illustrations
// All scenes are drawn in code: original flat illustrations, no photos.

// Lead illustration: the Strait of Hormuz at dusk, drawn flat. Land closes in
// on both sides, three tanker silhouettes cross the channel, small spiked
// mine markers sit in the water. No explosion, no fire, no realism: the lead
// is an unverified claim, so the picture stays illustrative.
function drawHormuz(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  // Pale dusk sun, kept small and high so it never reads as an explosion.
  filledCircle(x + w - 42, y + 26, 12, [240, 200, 130]);
  // Horizon glow band.
  rect(x, y + 58, w, 10, HORIZON);
  // Sea.
  rect(x, y + 68, w, h - 68, WATER);
  // Land closing in from both sides of the strait (flat tan shapes).
  polygon(
    [
      [x, y + 68],
      [x + 62, y + 68],
      [x + 78, y + 100],
      [x + 66, y + h],
      [x, y + h],
    ],
    LAND
  );
  polygon(
    [
      [x + w - 58, y + 68],
      [x + w, y + 68],
      [x + w, y + h],
      [x + w - 70, y + h],
      [x + w - 84, y + 102],
    ],
    LAND
  );
  // Calm water lines in the channel.
  for (let i = 0; i < 4; i++) {
    const wy = y + 92 + i * 18;
    line(x + 92, wy, x + 150, wy, [150, 175, 210]);
    line(x + 168, wy + 8, x + 216, wy + 8, [150, 175, 210]);
  }
  // Three tanker silhouettes, different sizes, crossing the channel.
  const tanker = (tx: number, ty: number, s: number) => {
    const hw = Math.round(64 * s);
    const hh = Math.round(12 * s);
    polygon(
      [
        [tx, ty],
        [tx + hw, ty],
        [tx + hw - Math.round(8 * s), ty + hh],
        [tx + Math.round(4 * s), ty + hh],
      ],
      SHIP
    );
    rect(tx + Math.round(8 * s), ty - Math.round(10 * s), Math.round(20 * s), Math.round(10 * s), SHIP);
    rect(tx + Math.round(44 * s), ty - Math.round(14 * s), Math.round(6 * s), Math.round(14 * s), SHIP);
    rect(tx + Math.round(52 * s), ty - Math.round(8 * s), Math.round(8 * s), Math.round(8 * s), SHIP);
  };
  tanker(x + 96, y + 96, 1.0);
  tanker(x + 150, y + 128, 0.8);
  tanker(x + 92, y + 150, 0.65);
  // Spiked mine markers in the water: small dark circles with eight spikes.
  const mine = (mx: number, my: number) => {
    for (let a = 0; a < 8; a++) {
      const rad = (a * Math.PI) / 4;
      line(mx, my, Math.round(mx + 9 * Math.cos(rad)), Math.round(my + 9 * Math.sin(rad)), SHIP);
    }
    filledCircle(mx, my, 5, SHIP);
  };
  mine(x + 128, y + 118);
  mine(x + 196, y + 104);
  mine(x + 178, y + 158);
}

// Small numbered world map (the one distinctive accent, fix 7): coarse flat
// continents with six numbered pins for the day's anchor stories:
// 1 Hormuz, 2 Tokyo, 3 Zaporizhzhia, 4 Gaza, 5 Shanghai, 6 Cartagena.
function drawMiniMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SEA);
  const lonToX = (lon: number) => x + ((lon + 170) / 360) * w;
  const latToY = (lat: number) => y + ((78 - lat) / 136) * h;
  const poly = (pts: Array<[number, number]>) =>
    polygon(
      pts.map(([lon, lat]) => [lonToX(lon), latToY(lat)] as [number, number]),
      LAND
    );
  poly([[-168, 66], [-140, 70], [-120, 71], [-100, 68], [-85, 66], [-80, 58], [-75, 45], [-80, 35], [-85, 30], [-95, 28], [-105, 22], [-115, 28], [-125, 42], [-135, 58], [-155, 60]]);
  poly([[-78, 8], [-62, 2], [-50, -5], [-40, -15], [-48, -28], [-58, -35], [-66, -48], [-72, -38], [-72, -18], [-80, -5]]);
  poly([[-16, 15], [-10, 32], [0, 36], [10, 37], [20, 32], [32, 31], [43, 12], [51, 10], [44, -2], [38, -18], [32, -29], [24, -34], [16, -32], [12, -18], [9, 4], [-8, 4]]);
  poly([[-10, 36], [-8, 43], [-2, 48], [2, 51], [6, 54], [10, 58], [18, 56], [22, 60], [28, 62], [30, 70], [24, 71], [16, 69], [10, 64], [4, 58], [-2, 54], [-6, 48]]);
  poly([[30, 70], [45, 68], [60, 69], [75, 72], [90, 75], [105, 77], [120, 73], [135, 72], [150, 70], [160, 62], [158, 52], [142, 50], [140, 40], [135, 34], [128, 36], [122, 30], [118, 24], [110, 20], [106, 10], [100, 6], [96, 12], [90, 21], [84, 18], [78, 10], [74, 20], [68, 24], [60, 25], [54, 26], [48, 29], [42, 30], [36, 36], [30, 36], [28, 41], [30, 45], [30, 55]]);
  poly([[114, -22], [120, -34], [130, -32], [138, -35], [146, -39], [152, -32], [150, -22], [144, -15], [140, -11], [134, -12], [128, -14], [122, -17]]);
  poly([[-5, 50], [-3, 53], [-5, 57], [-1, 58], [1, 52]]);
  const pins: Array<{ n: number; lon: number; lat: number; col: [number, number, number]; dx: number; dy: number }> = [
    { n: 1, lon: 56, lat: 26, col: RED, dx: 6, dy: 0 },
    { n: 2, lon: 139, lat: 35, col: AMBER, dx: 0, dy: -5 },
    { n: 3, lon: 35, lat: 48, col: NAVY, dx: 0, dy: 0 },
    { n: 4, lon: 34, lat: 31, col: RED, dx: -7, dy: 4 },
    { n: 5, lon: 121, lat: 31, col: AMBER, dx: 0, dy: 5 },
    { n: 6, lon: -75, lat: 10, col: TEAL, dx: 0, dy: 0 },
  ];
  for (const p of pins) {
    const px = lonToX(p.lon) + p.dx;
    const py = latToY(p.lat) + p.dy;
    filledCircle(px, py, 6, p.col);
    circleOutline(px, py, 6, WHITE);
    const label = String(p.n);
    drawText("sansb|1", px - Math.round(measure("sansb|1", label) / 2), py + 3, label, WHITE);
  }
}

// ---------------------------------------------------------------- layout
const LEAD_Y = 156;
const LEAD_H = 166;
const HERO2_Y = 328;
const HERO2_H = 150;
const MODULES_Y = 484;
const ROW_H = 204;
const ALSO_Y = 898;
const DATECHECK_Y = 972;
const DATECHECK_H = 28;

function drawMasthead(): void {
  rect(0, 0, W, 28, NAVY);
  drawText("sansb|2", MARGIN + 2, 19, "THE WORLD IN ONE DAY", WHITE);
  drawTextRight("sansb|2", RIGHT, 19, "32 STORIES", WHITE);
  drawTextCentered("serif|5", 512, 76, "TUESDAY 24 NOVEMBER 2026", NAVY);
  rect(MARGIN, 88, CONTENT_W, 3, NAVY);
  rect(MARGIN, 93, CONTENT_W, 1, NAVY);
}

function drawMarketStrip(): void {
  const y = 98;
  const h = 52;
  // Navy label block on the left.
  rect(MARGIN, y, 146, h, NAVY);
  drawTextCentered("sansb|1", MARGIN + 73, y + 21, "TUESDAY", WHITE);
  drawTextCentered("sansb|1", MARGIN + 73, y + 38, "MARKETS", WHITE);
  const cellX0 = MARGIN + 146;
  const cellW = (RIGHT - cellX0) / MARKET_ITEMS.length;
  MARKET_ITEMS.forEach((it, i) => {
    const cx = cellX0 + cellW * i + cellW / 2;
    drawTextCentered("serif|3", cx, y + 24, it.value, RED);
    drawTextCentered("sansb|1", cx, y + 41, it.label, NAVY);
    if (i + 1 < MARKET_ITEMS.length) vline(Math.round(cellX0 + cellW * (i + 1)), y + 8, h - 16, CREAM_LINE);
  });
  hline(MARGIN, y + h, CONTENT_W, CREAM_LINE);
}

function drawLeadHero(): void {
  const y = LEAD_Y;
  drawHormuz(MARGIN, y, 300, LEAD_H);
  const tx = MARGIN + 316;
  const tw = RIGHT - tx;
  drawText("sansb|2", tx, y + 22, "1 • STRAIT OF HORMUZ", RED);
  // Headline line 1: "IRGC SAYS" + CLAIM pill (same cap height as the headline
  // words, immediately beside "IRGC SAYS") + "3 TANKERS". Line 2: the rest.
  const headFont = "serif|3";
  const base1 = y + 58;
  const base2 = y + 85;
  let cx = tx;
  cx = drawText(headFont, cx, base1, "IRGC SAYS", NAVY);
  const capH = capHeight(headFont);
  const pillX = cx + 10;
  const pillW = measure(headFont, "CLAIM") + 16;
  const pillH = capH + 10;
  const pillY = base1 - capH - 5;
  rect(pillX, pillY, pillW, pillH, TAG_COLORS.CLAIM);
  drawText(headFont, pillX + 8, base1, "CLAIM", WHITE);
  drawText(headFont, pillX + pillW + 10, base1, "3 TANKERS", NAVY);
  drawText(headFont, tx, base2, "HIT MINES IN HORMUZ", NAVY);
  // Sub: full attribution, two lines.
  drawWrapped(
    "serifr|1",
    tx,
    y + 112,
    14,
    "Iran claims tankers struck mines and caught fire. No names, no flags, no casualties named. JMIC: not confirmed by any official authority.",
    tw,
    2,
    INK
  );
  drawText("sans|1", tx, y + 156, "IRNA / TASNIM / JMIC", GREY);
}

function drawHeroSecond(
  hx: number,
  kicker: string,
  headlineLines: string[],
  body: string,
  source: string
): void {
  const y = HERO2_Y;
  const w = 492;
  drawText("sansb|2", hx, y + 20, kicker, RED);
  const tagW = measure("sansb|1", "CONFIRMED") + 12;
  drawTag(hx + w - tagW, y + 8, "CONFIRMED", TAG_COLORS.CONFIRMED);
  headlineLines.forEach((ln, i) => drawText("serif|3", hx, y + 48 + i * 27, ln, NAVY));
  const bodyY = y + 48 + (headlineLines.length - 1) * 27 + 25;
  const bodyLines = drawWrapped("serifr|1", hx, bodyY, 13, body, w, 3, INK);
  drawText("sans|1", hx, bodyY + bodyLines * 13 + 10, source, GREY);
}

function drawModuleCell(x: number, y: number, w: number, h: number, region: string, stories: ModuleStory[]): void {
  rect(x, y, w, 20, REGION_COLORS[region]);
  drawText("sansb|1", x + 8, y + 14, region + " " + stories.length, WHITE);
  const slotH = Math.floor((h - 20) / stories.length);
  stories.forEach((s, idx) => {
    const top = y + 20 + idx * slotH;
    const hx = x + 18;
    const hw = w - 26;
    filledCircle(x + 7, top + 10, 4, REGION_COLORS[region]);
    const headLines = wrapText("sansb|2", s.headline, hw).slice(0, 2);
    headLines.forEach((ln, i) => drawText("sansb|2", hx, top + 15 + i * 16, ln, NAVY));
    drawText("serifr|1", hx, top + 15 + (headLines.length - 1) * 16 + 13, s.body, INK);
  });
}

function drawModules(): void {
  const colW = 328;
  const xs = [MARGIN, MARGIN + colW + 8, MARGIN + 2 * (colW + 8)];
  const row0 = [MODULES[0], MODULES[1], MODULES[2]];
  const row1 = [MODULES[3], MODULES[4], MODULES[5]];
  row0.forEach((cell, i) => drawModuleCell(xs[i], MODULES_Y, colW, ROW_H, cell.region, cell.stories));
  row1.forEach((cell, i) => drawModuleCell(xs[i], MODULES_Y + ROW_H, colW, ROW_H, cell.region, cell.stories));
}

function drawAlsoOn(): void {
  const y = ALSO_Y;
  drawText("sansb|2", MARGIN, y + 14, "ALSO ON", NAVY);
  drawTextRight("sansb|1", 756, y + 14, "6 MORE STORIES", GREY);
  hline(MARGIN, y + 20, 744, CREAM_LINE);
  const colW = 368;
  ALSO_ON.forEach((text, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawText("sans|1", MARGIN + col * (colW + 8), y + 38 + row * 16, text, INK);
  });
  // The one distinctive accent: small numbered world map, right of ALSO ON.
  drawText("sansb|1", 768, y + 14, "WHERE THE DAY HAPPENED", NAVY);
  drawMiniMap(768, y + 20, RIGHT - 768, 50);
}

function drawDateCheck(): void {
  const y = DATECHECK_Y;
  rect(MARGIN, y, CONTENT_W, 2, RED);
  rect(MARGIN, y + DATECHECK_H - 2, CONTENT_W, 2, RED);
  rect(MARGIN, y, 2, DATECHECK_H, RED);
  rect(MARGIN + CONTENT_W - 2, y, 2, DATECHECK_H, RED);
  const base = y + 19;
  drawText("sansb|1", MARGIN + 8, base, "DATE CHECK", RED);
  drawText(
    "sans|1",
    MARGIN + 96,
    base,
    "Nikkei +3.9% is TUESDAY, Tokyo closed Monday. Monday's Nvidia +31.5% was Monday, not today. COP31 ended Sunday.",
    INK
  );
}

function drawSources(): void {
  drawText(
    "sans|1",
    MARGIN,
    1012,
    "SOURCES: REUTERS, AP, WSJ, BLOOMBERG, FT, XINHUA, UN NEWS, AL JAZEERA.",
    GREY
  );
}

// ---------------------------------------------------------------- main
function main(): void {
  // Self-check: the claimed story count must match the stories drawn.
  const moduleCount = MODULES.reduce((a, m) => a + m.stories.length, 0);
  const totalStories = 3 + moduleCount + ALSO_ON.length;
  if (totalStories !== 32 || moduleCount !== 23 || ALSO_ON.length !== 6) {
    throw new Error("story count mismatch: total=" + totalStories + " modules=" + moduleCount);
  }
  for (const m of MODULES) {
    if (m.stories.length > 4) throw new Error("module overfull: " + m.region);
  }

  fillAll(PAPER);
  drawMasthead();
  drawMarketStrip();
  drawLeadHero();
  drawHeroSecond(
    MARGIN,
    "2 • ASIA MARKETS",
    ["ASIA SURGES ON", "NVIDIA REBOUND"],
    "Taiex +9.0%, Kospi +6.3%, Nikkei +3.9% after Monday's rally. Hang Seng -0.7%. Wall St faded: S AND P -0.5%, Nasdaq -1.5%, Dow +0.9% to 50,021, Nvidia -5.9%.",
    "REUTERS / AP"
  );
  drawHeroSecond(
    520,
    "3 • ZAPORIZHZHIA",
    ["RUSSIAN DRONES HIT", "ZAPORIZHZHIA"],
    "2 KILLED, 40 WOUNDED. 96 drones overnight, 73 shot down.",
    "REUTERS"
  );
  drawModules();
  drawAlsoOn();
  drawDateCheck();
  drawSources();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "./out";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePng();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log("stories=" + totalStories + " png_bytes=" + png.length);
}

main();
