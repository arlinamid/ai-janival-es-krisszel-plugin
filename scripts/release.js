#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const zlib = require("zlib");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const RELEASES = path.join(ROOT, "releases");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;
const releaseName = `ai-janival-es-krisszel-plugin-v${version}`;
const releaseDir = path.join(RELEASES, releaseName);
const zipPath = path.join(RELEASES, `${releaseName}.zip`);
const distOnly = process.argv.includes("--dist-only");

const COPY_ENTRIES = [
  "manifest.json",
  "sidepanel.html",
  "styles.css",
  "fb-saver-content.css",
  "icon.png",
  "profile_image.jpg",
  "profile-images",
  "vendor/tailwind.css"
];

function assertInsideRoot(target) {
  const relative = path.relative(ROOT, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside project root: ${target}`);
  }
}

function resetDir(dir) {
  assertInsideRoot(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyEntry(relativePath, destinationRoot) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(destinationRoot, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing release asset: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function runTailwindBuild() {
  const tailwindCli = path.join(
    ROOT,
    "node_modules",
    "@tailwindcss",
    "cli",
    "dist",
    "index.mjs"
  );

  if (!fs.existsSync(tailwindCli)) {
    throw new Error("Tailwind CLI is missing. Run npm install first.");
  }

  execFileSync(process.execPath, [
    tailwindCli,
    "-i",
    path.join(ROOT, "tailwind.input.css"),
    "-o",
    path.join(ROOT, "vendor", "tailwind.css")
  ], { stdio: "inherit" });
}

async function runEsbuildBundle() {
  await esbuild.build({
    entryPoints: [path.join(ROOT, "sidepanel.js")],
    bundle: true,
    outfile: path.join(DIST, "sidepanel.js"),
    platform: "browser",
    format: "iife",
    target: ["chrome120"],
    minify: true,
    sourcemap: false
  });

  await esbuild.build({
    entryPoints: [path.join(ROOT, "background.js")],
    bundle: true,
    outfile: path.join(DIST, "background.js"),
    platform: "browser",
    format: "esm",
    target: ["chrome120"],
    minify: true,
    sourcemap: false
  });

  await esbuild.build({
    entryPoints: [path.join(ROOT, "fb-saver-content.js")],
    bundle: true,
    outfile: path.join(DIST, "fb-saver-content.js"),
    platform: "browser",
    format: "iife",
    target: ["chrome120"],
    minify: true,
    sourcemap: false
  });
}

async function buildDist() {
  runTailwindBuild();
  resetDir(DIST);
  await runEsbuildBundle();
  COPY_ENTRIES.forEach((entry) => copyEntry(entry, DIST));
}

function copyDistToRelease() {
  resetDir(releaseDir);
  fs.cpSync(DIST, releaseDir, { recursive: true });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

function walkFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath, base);
    }

    return [
      {
        fullPath,
        relativePath: path.relative(base, fullPath).replace(/\\/g, "/")
      }
    ];
  });
}

function createZip() {
  if (!fs.existsSync(RELEASES)) {
    fs.mkdirSync(RELEASES, { recursive: true });
  }

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const files = walkFiles(releaseDir);

  files.forEach((file) => {
    const data = fs.readFileSync(file.fullPath);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const name = Buffer.from(`${releaseName}/${file.relativePath}`, "utf8");
    const stat = fs.statSync(file.fullPath);
    const { dosDate, dosTime } = toDosDateTime(stat.mtime);
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  });

  const centralStart = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const endHeader = Buffer.alloc(22);
  endHeader.writeUInt32LE(0x06054b50, 0);
  endHeader.writeUInt16LE(0, 4);
  endHeader.writeUInt16LE(0, 6);
  endHeader.writeUInt16LE(files.length, 8);
  endHeader.writeUInt16LE(files.length, 10);
  endHeader.writeUInt32LE(centralBuffer.length, 12);
  endHeader.writeUInt32LE(centralStart, 16);
  endHeader.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralBuffer, endHeader]));
}

(async () => {
  await buildDist();

  if (!distOnly) {
    if (!fs.existsSync(RELEASES)) {
      fs.mkdirSync(RELEASES, { recursive: true });
    }

    copyDistToRelease();
    createZip();
  }

  const outputPath = distOnly ? DIST : zipPath;
  const sizeKb = fs.statSync(outputPath).isDirectory()
    ? ""
    : ` (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`;

  console.log(`Built ${path.relative(ROOT, outputPath)}${sizeKb}`);
})();
