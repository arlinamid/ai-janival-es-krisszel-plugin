#!/usr/bin/env node
// Builds a release ZIP for the Chrome extension.
// Usage: node scripts/release.js
//        npm run build:release

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;
const zipName = `ai-janival-es-krisszel-plugin-v${version}.zip`;
const releasesDir = path.join(ROOT, "releases");
const zipPath = path.join(releasesDir, zipName);

const INCLUDE = [
  "manifest.json",
  "background.js",
  "sidepanel.html",
  "sidepanel.js",
  "styles.css",
  "fb-saver-content.js",
  "fb-saver-content.css",
  "icon.png",
  "profile_image.jpg",
  "database/posts-categorized.json",
  "vendor/react.production.min.js",
  "vendor/react-dom.production.min.js",
  "vendor/lucide.min.js",
  "vendor/marked.min.js",
  "vendor/tailwind.css",
];

if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Build PowerShell compress command
const psItems = INCLUDE.map((f) => `"${path.join(ROOT, f).replace(/\\/g, "\\\\")}"`).join(",");
const psCmd = `Compress-Archive -Path ${psItems} -DestinationPath "${zipPath.replace(/\\/g, "\\\\")}"`;

console.log(`Building release v${version}...`);
execSync(`powershell -Command "${psCmd}"`, { stdio: "inherit" });

const size = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`Done: releases/${zipName} (${size} KB)`);
