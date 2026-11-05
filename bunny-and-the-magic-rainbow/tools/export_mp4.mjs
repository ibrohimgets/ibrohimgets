#!/usr/bin/env node
/**
 * Export "Bunny and the Magic Rainbow" to MP4 (1920x1080, 30 fps, H.264 + AAC, soft English subtitles).
 *
 *   node tools/export_mp4.mjs [--out output/bunny-and-the-magic-rainbow.mp4] [--fps 30] [--workers 4]
 *                             [--scale 1] [--from 0] [--to 120] [--crf 18]
 *
 * How it works: a headless Chromium (Playwright) loads render.html, draws each frame with the exact same
 * code as the preview player (CARTOON.render(ctx, t) is deterministic), and pipes JPEG frames into ffmpeg.
 * Frames are rendered in parallel chunks, then joined and muxed with audio/soundtrack.wav.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg("fps", 30), SCALE = +arg("scale", 1), FROM = +arg("from", 0), TO = +arg("to", 120), CRF = arg("crf", "18");
const WORKERS = +arg("workers", Math.max(1, Math.min(4, os.cpus().length)));
const OUT = path.resolve(ROOT, arg("out", "output/bunny-and-the-magic-rainbow.mp4"));
const TMP = path.join(ROOT, "build", "export-tmp");

let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.error("Playwright is missing. Run:  npm install  &&  npx playwright install chromium"); process.exit(1); }

function run(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
    p.on("exit", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}`))));
  });
}

async function renderChunk(browser, url, f0, f1, file, onFrame) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", CRF, "-pix_fmt", "yuv420p", "-r", String(FPS), file],
    { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ff.on("exit", (c) => (c === 0 ? ok() : fail(new Error("ffmpeg chunk failed")))));
  for (let f = f0; f < f1; f++) {
    const data = await page.evaluate(([t, s]) => window.renderFrame(t, 0.95, s), [f / FPS, SCALE]);
    const buf = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    onFrame();
  }
  ff.stdin.end();
  await done;
  await page.close();
}

(async () => {
  for (const f of ["audio/soundtrack.wav", "src/timeline.js"])
    if (!fs.existsSync(path.join(ROOT, f))) { console.error(`Missing ${f}. Run: python3 tools/build_audio.py`); process.exit(1); }
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/render.html`;
  const browser = await chromium.launch();

  const F0 = Math.round(FROM * FPS), F1 = Math.round(TO * FPS), N = F1 - F0;
  const per = Math.ceil(N / WORKERS);
  let doneFrames = 0; const t0 = Date.now();
  const tick = () => {
    doneFrames++;
    if (doneFrames % 60 === 0 || doneFrames === N) {
      const el = (Date.now() - t0) / 1000, eta = (el / doneFrames) * (N - doneFrames);
      process.stdout.write(`\r  frames ${doneFrames}/${N}  (${(doneFrames / el).toFixed(1)} fps, ~${Math.ceil(eta)}s left)   `);
    }
  };
  console.log(`Rendering ${N} frames at ${Math.round(1920 * SCALE)}x${Math.round(1080 * SCALE)} with ${WORKERS} workers ...`);
  const chunks = [];
  const jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const a = F0 + w * per, b = Math.min(F1, a + per);
    if (a >= b) break;
    const file = path.join(TMP, `chunk_${String(w).padStart(2, "0")}.mp4`);
    chunks.push(file);
    jobs.push(renderChunk(browser, url, a, b, file, tick));
  }
  await Promise.all(jobs);
  await browser.close(); server.close();
  console.log("\nMuxing video + soundtrack + subtitles ...");
  const list = path.join(TMP, "chunks.txt");
  fs.writeFileSync(list, chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  const srt = path.join(ROOT, "subtitles", "bunny-and-the-magic-rainbow.srt");
  const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-ss", String(FROM), "-t", String(TO - FROM), "-i", path.join(ROOT, "audio", "soundtrack.wav")];
  const withSubs = FROM === 0 && fs.existsSync(srt);
  if (withSubs) args.push("-i", srt);
  args.push("-map", "0:v", "-map", "1:a");
  if (withSubs) args.push("-map", "2:s", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng");
  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(TO - FROM),
    "-metadata", "title=Bunny and the Magic Rainbow", "-movflags", "+faststart", OUT);
  await run("ffmpeg", args);
  for (const c of chunks) fs.unlinkSync(c);
  fs.unlinkSync(list);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
