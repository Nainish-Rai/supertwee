import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir, exportsDir, feedPath, metaPath } from './config.mjs';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureDataDir() {
  await ensureDir(dataDir());
}

export async function ensureExportsDir() {
  await ensureDir(exportsDir());
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function writeJsonLines(filePath, rows) {
  await ensureDir(path.dirname(filePath));
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf8');
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, 'utf8');
}

export async function loadFeed() {
  return readJsonLines(feedPath());
}

export async function saveFeed(rows) {
  return writeJsonLines(feedPath(), rows);
}

export async function loadMeta() {
  return readJson(metaPath(), { syncedAt: null, totalItems: 0, lastCursor: null, pagesFetched: 0 });
}

export async function saveMeta(meta) {
  return writeJson(metaPath(), meta);
}

export async function createExportDir(outDir) {
  if (outDir) {
    const absolute = path.resolve(outDir);
    await ensureDir(absolute);
    return absolute;
  }

  await ensureExportsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const absolute = path.join(exportsDir(), timestamp);
  await ensureDir(absolute);
  return absolute;
}
