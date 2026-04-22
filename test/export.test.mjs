import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportFeedArchive, filterExportRecords, parseExportFormats, renderMarkdownExport, buildExportReport } from '../src/export.mjs';
import { parseFlags } from '../src/cli.mjs';

const sampleRecords = [
  {
    id: '3',
    tweetId: '3',
    url: 'https://x.com/carol/status/3',
    text: 'Builders still buying $NVDA and #AI tools https://docs.example.com/post',
    postedAt: '2026-04-16T09:30:00.000Z',
    syncedAt: '2026-04-16T10:00:00.000Z',
    authorHandle: 'carol',
    authorName: 'Carol',
    links: ['https://docs.example.com/post'],
    engagement: { likeCount: 400, repostCount: 50, replyCount: 12, quoteCount: 4, bookmarkCount: 9, viewCount: 12000 },
    mediaObjects: []
  },
  {
    id: '2',
    tweetId: '2',
    url: 'https://x.com/bob/status/2',
    text: 'AI infra is eating software #AI https://example.com/thread',
    postedAt: '2026-04-15T12:00:00.000Z',
    syncedAt: '2026-04-15T13:00:00.000Z',
    authorHandle: 'bob',
    authorName: 'Bob',
    links: ['https://example.com/thread'],
    engagement: { likeCount: 250, repostCount: 40, replyCount: 18, quoteCount: 6, bookmarkCount: 7, viewCount: 9000 },
    mediaObjects: []
  },
  {
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'Fresh notes on local-first analysis #AI',
    postedAt: '2026-04-14T08:00:00.000Z',
    syncedAt: '2026-04-14T08:30:00.000Z',
    authorHandle: 'alice',
    authorName: 'Alice',
    links: [],
    engagement: { likeCount: 100, repostCount: 10, replyCount: 5, quoteCount: 1, bookmarkCount: 2, viewCount: 3000 },
    mediaObjects: []
  },
  {
    id: '0',
    tweetId: '0',
    url: 'https://x.com/ghost/status/0',
    text: 'No timestamp here',
    postedAt: null,
    syncedAt: '2026-04-13T08:30:00.000Z',
    authorHandle: 'ghost',
    links: [],
    engagement: { likeCount: 5, repostCount: 1, replyCount: 0, quoteCount: 0, bookmarkCount: 0, viewCount: 50 },
    mediaObjects: []
  }
];

test('parseExportFormats supports comma-separated values', () => {
  assert.deepEqual(parseExportFormats('jsonl, md'), ['jsonl', 'md']);
  assert.deepEqual(parseExportFormats(undefined), ['jsonl', 'md']);
});

test('parseFlags supports export filters', () => {
  const flags = parseFlags(['--since', '2026-04-01', '--until', '2026-04-15', '--limit', '50', '--format', 'md']);
  assert.equal(flags.since, '2026-04-01');
  assert.equal(flags.until, '2026-04-15');
  assert.equal(flags.limit, '50');
  assert.equal(flags.format, 'md');
});

test('filterExportRecords applies date range and limit after filtering', () => {
  const result = filterExportRecords(sampleRecords, {
    since: '2026-04-15',
    until: '2026-04-16',
    limit: 1
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, '3');
});

test('filterExportRecords rejects invalid date ranges', () => {
  assert.throws(
    () => filterExportRecords(sampleRecords, { since: '2026-04-16', until: '2026-04-15' }),
    /--since/
  );
});

test('renderMarkdownExport includes empty-state note when no rows match', () => {
  const report = buildExportReport(sampleRecords, { since: '2027-01-01' });
  report.formats = ['jsonl', 'md'];
  const markdown = renderMarkdownExport(report, {
    dataDir: '/tmp/supertwee-data',
    meta: { syncedAt: '2026-04-16T10:00:00.000Z' },
    since: '2027-01-01'
  });

  assert.match(markdown, /no records matched the requested filters/i);
  assert.match(markdown, /records exported: 0/);
});

test('exportFeedArchive writes jsonl and markdown outputs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'supertwee-export-'));
  const outDir = path.join(tempRoot, 'run');

  const result = await exportFeedArchive(sampleRecords, {
    since: '2026-04-15',
    formats: ['jsonl', 'md'],
    outDir,
    meta: { syncedAt: '2026-04-16T10:00:00.000Z' },
    dataDir: '/tmp/supertwee-data',
    generatedAt: '2026-04-22T10:00:00.000Z'
  });

  assert.equal(result.recordsExported, 2);
  const jsonl = await fs.readFile(path.join(outDir, 'feed.jsonl'), 'utf8');
  const markdown = await fs.readFile(path.join(outDir, 'report.md'), 'utf8');

  assert.equal(jsonl.trim().split('\n').length, 2);
  assert.match(markdown, /## top authors/);
  assert.match(markdown, /@carol \(1\)/);
  assert.match(markdown, /example\.com/);
});
