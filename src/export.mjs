import path from 'node:path';
import { rankBangers } from './analyze.mjs';
import { createExportDir, writeJsonLines, writeText } from './storage.mjs';

const DEFAULT_EXPORT_FORMATS = ['jsonl', 'md'];
const ALLOWED_EXPORT_FORMATS = new Set(DEFAULT_EXPORT_FORMATS);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASHTAG_RE = /(^|[^\w])#([a-z0-9_]{1,30})/gi;
const CASHTAG_RE = /(^|[^\w])\$([a-z]{1,10})/gi;

function parseDateValue(value, { endOfDay = false, flagName = 'date' } = {}) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const normalized = DATE_ONLY_RE.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : raw;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${flagName}: ${raw}`);
  }
  return parsed;
}

function parseLimit(value) {
  if (value == null || value === '') return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('`--limit` must be a non-negative integer.');
  }
  return limit;
}

function getRecordTimestamp(record) {
  if (!record?.postedAt) return null;
  const parsed = new Date(record.postedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function incrementCounter(map, key, seed) {
  const current = map.get(key);
  if (current) {
    current.count += 1;
    return current;
  }
  const created = { ...seed, count: 1 };
  map.set(key, created);
  return created;
}

function sortByCount(items, limit = 10) {
  return Array.from(items)
    .sort((a, b) => b.count - a.count || String(a.label ?? a.handle ?? a.domain).localeCompare(String(b.label ?? b.handle ?? b.domain)))
    .slice(0, limit);
}

function extractMatches(text, regex, prefix) {
  const values = new Set();
  for (const match of String(text ?? '').matchAll(regex)) {
    if (match[2]) values.add(`${prefix}${String(match[2]).toLowerCase()}`);
  }
  return Array.from(values);
}

function summarizeAuthors(records) {
  const authors = new Map();
  for (const record of records) {
    const handle = record?.authorHandle ?? 'unknown';
    const label = handle === 'unknown' ? 'unknown' : `@${handle}`;
    const entry = incrementCounter(authors, handle, { handle, label, name: record?.authorName ?? null });
    if (!entry.name && record?.authorName) entry.name = record.authorName;
  }
  return sortByCount(authors.values());
}

function summarizeDomains(records) {
  const domains = new Map();
  for (const record of records) {
    for (const link of record?.links ?? []) {
      try {
        const url = new URL(link);
        const domain = url.hostname.replace(/^www\./, '');
        incrementCounter(domains, domain, { domain, label: domain });
      } catch {
        continue;
      }
    }
  }
  return sortByCount(domains.values());
}

function summarizeTopics(records, kind) {
  const source = new Map();
  const prefix = kind === 'hashtag' ? '#' : '$';
  const regex = kind === 'hashtag' ? HASHTAG_RE : CASHTAG_RE;
  for (const record of records) {
    for (const topic of extractMatches(record?.text, regex, prefix)) {
      incrementCounter(source, topic, { topic, label: topic });
    }
  }
  return sortByCount(source.values());
}

function summarizeBangers(records, limit = 10) {
  return rankBangers(records, Math.min(limit, records.length)).map((item) => ({
    handle: item.record.authorHandle ? `@${item.record.authorHandle}` : '@unknown',
    url: item.record.url,
    score: item.score.normalized,
    text: String(item.record.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
  }));
}

function formatDateRange(records) {
  const timestamps = records.map(getRecordTimestamp).filter(Boolean).sort((a, b) => a - b);
  if (timestamps.length === 0) return { start: null, end: null };
  return {
    start: timestamps[0].toISOString(),
    end: timestamps[timestamps.length - 1].toISOString()
  };
}

function formatValue(value, fallback = 'none') {
  return value == null || value === '' ? fallback : String(value);
}

export function parseExportFormats(value) {
  if (value == null || value === '' || value === true) return [...DEFAULT_EXPORT_FORMATS];
  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const formats = [];
  for (const item of rawValues) {
    const normalized = String(item).trim().toLowerCase();
    if (!normalized) continue;
    if (!ALLOWED_EXPORT_FORMATS.has(normalized)) {
      throw new Error(`Unknown export format: ${normalized}. Allowed values: ${DEFAULT_EXPORT_FORMATS.join(', ')}`);
    }
    if (!formats.includes(normalized)) formats.push(normalized);
  }
  return formats.length > 0 ? formats : [...DEFAULT_EXPORT_FORMATS];
}

export function filterExportRecords(records, options = {}) {
  const { since, until, limit } = validateExportOptions(options);

  let filtered = records.filter((record) => {
    if (!since && !until) return true;
    const timestamp = getRecordTimestamp(record);
    if (!timestamp) return false;
    if (since && timestamp < since) return false;
    if (until && timestamp > until) return false;
    return true;
  });

  if (limit != null) {
    filtered = filtered.slice(0, limit);
  }

  return { records: filtered, since, until, limit };
}

export function validateExportOptions(options = {}) {
  const since = parseDateValue(options.since, { flagName: '`--since`' });
  const until = parseDateValue(options.until, {
    endOfDay: typeof options.until === 'string' && DATE_ONLY_RE.test(options.until.trim()),
    flagName: '`--until`'
  });
  if (since && until && since > until) {
    throw new Error('`--since` must be before or equal to `--until`.');
  }
  const limit = parseLimit(options.limit);
  return { since, until, limit };
}

export function buildExportReport(records, options = {}) {
  const filters = filterExportRecords(records, options);
  const summary = {
    recordCount: filters.records.length,
    dateRange: formatDateRange(filters.records),
    topAuthors: summarizeAuthors(filters.records),
    topDomains: summarizeDomains(filters.records),
    topHashtags: summarizeTopics(filters.records, 'hashtag'),
    topCashtags: summarizeTopics(filters.records, 'cashtag'),
    notableTweets: summarizeBangers(filters.records)
  };

  return {
    records: filters.records,
    filters,
    summary
  };
}

export function renderMarkdownExport(report, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const lines = [
    '# supertwee export',
    '',
    '## metadata',
    `- generated at: ${generatedAt}`,
    `- records exported: ${report.summary.recordCount}`,
    `- last sync: ${formatValue(options.meta?.syncedAt)}`,
    `- source data dir: ${formatValue(options.dataDir)}`,
    ''
  ];

  lines.push('## filters');
  lines.push(`- since: ${formatValue(options.since)}`);
  lines.push(`- until: ${formatValue(options.until)}`);
  lines.push(`- limit: ${formatValue(report.filters.limit)}`);
  lines.push(`- formats: ${report.formats.join(', ')}`);
  lines.push('');

  lines.push('## time range');
  lines.push(`- first tweet: ${formatValue(report.summary.dateRange.start)}`);
  lines.push(`- last tweet: ${formatValue(report.summary.dateRange.end)}`);
  lines.push('');

  lines.push('## top authors');
  if (report.summary.topAuthors.length === 0) {
    lines.push('- none');
  } else {
    for (const author of report.summary.topAuthors) {
      lines.push(`- ${author.label} (${author.count})`);
    }
  }
  lines.push('');

  lines.push('## top domains');
  if (report.summary.topDomains.length === 0) {
    lines.push('- none');
  } else {
    for (const domain of report.summary.topDomains) {
      lines.push(`- ${domain.domain} (${domain.count})`);
    }
  }
  lines.push('');

  lines.push('## top hashtags');
  if (report.summary.topHashtags.length === 0) {
    lines.push('- none');
  } else {
    for (const topic of report.summary.topHashtags) {
      lines.push(`- ${topic.topic} (${topic.count})`);
    }
  }
  lines.push('');

  lines.push('## top cashtags');
  if (report.summary.topCashtags.length === 0) {
    lines.push('- none');
  } else {
    for (const topic of report.summary.topCashtags) {
      lines.push(`- ${topic.topic} (${topic.count})`);
    }
  }
  lines.push('');

  lines.push('## notable tweets');
  if (report.summary.notableTweets.length === 0) {
    lines.push('- none');
  } else {
    for (const tweet of report.summary.notableTweets) {
      lines.push(`- ${tweet.handle} score=${tweet.score.toFixed(1)} ${tweet.url}`);
      lines.push(`  ${tweet.text || '(no text)'}`);
    }
  }
  lines.push('');

  if (report.summary.recordCount === 0) {
    lines.push('## notes');
    lines.push('- no records matched the requested filters');
    lines.push('');
  }

  return lines.join('\n');
}

export async function exportFeedArchive(records, options = {}) {
  const formats = parseExportFormats(options.formats ?? options.format);
  const report = buildExportReport(records, options);
  report.formats = formats;

  const outputDir = await createExportDir(options.outDir);
  const files = [];

  if (formats.includes('jsonl')) {
    const filePath = path.join(outputDir, 'feed.jsonl');
    await writeJsonLines(filePath, report.records);
    files.push(filePath);
  }

  if (formats.includes('md')) {
    const filePath = path.join(outputDir, 'report.md');
    const content = renderMarkdownExport(report, {
      generatedAt: options.generatedAt,
      meta: options.meta,
      dataDir: options.dataDir,
      since: options.since,
      until: options.until
    });
    await writeText(filePath, `${content}\n`);
    files.push(filePath);
  }

  return {
    outputDir,
    files,
    formats,
    recordsExported: report.summary.recordCount
  };
}
