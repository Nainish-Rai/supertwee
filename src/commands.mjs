import { loadFeed, loadMeta } from './storage.mjs';
import { formatTrendReport } from './analyze.mjs';
import { syncFeed } from './x-client.mjs';
import { dataDir, lastSyncJsonPath, lastSyncMarkdownPath, loadEnv } from './config.mjs';
import { diagnoseSessionOptions } from './session.mjs';
import { exportFeedArchive } from './export.mjs';
import { loadLastSyncJson, loadLastSyncMarkdown } from './storage.mjs';

export function buildDoctorSummary() {
  loadEnv();
  return {
    dataDir: dataDir(),
    hasCookieHeader: Boolean(process.env.X_COOKIE_HEADER),
    hasAuthToken: Boolean(process.env.X_AUTH_TOKEN),
    hasCt0: Boolean(process.env.X_CT0),
    queryId: process.env.SUPERTWEE_HOME_LATEST_QUERY_ID || process.env.X_HOME_LATEST_QUERY_ID || 'default',
    session: diagnoseSessionOptions()
  };
}

export async function runSyncCommand(flags = {}) {
  return syncFeed({
    pages: flags.pages,
    count: flags.count,
    delayMs: flags['delay-ms'],
    enableRanking: Boolean(flags.ranking),
    cookies: flags.cookies,
    browser: flags.browser ? String(flags.browser) : undefined,
    chromeUserDataDir: flags['chrome-user-data-dir'] ? String(flags['chrome-user-data-dir']) : undefined,
    chromeProfileDirectory: flags['chrome-profile-directory'] ? String(flags['chrome-profile-directory']) : undefined,
    firefoxProfileDir: flags['firefox-profile-dir'] ? String(flags['firefox-profile-dir']) : undefined
  });
}

export async function runTrendsCommand(flags = {}) {
  const feed = await loadFeed();
  if (feed.length === 0) {
    throw new Error('No feed data found. Run `supertwee sync` first.');
  }

  return formatTrendReport(feed, {
    topicLimit: Number(flags['topic-limit'] ?? 12),
    tweetLimit: Number(flags['tweet-limit'] ?? 10)
  });
}

export async function runExportCommand(flags = {}) {
  const feed = await loadFeed();
  if (feed.length === 0) {
    throw new Error('No feed data found. Run `supertwee sync` first.');
  }

  return exportFeedArchive(feed, {
    since: flags.since,
    until: flags.until,
    limit: flags.limit,
    format: flags.format,
    outDir: flags['out-dir'] ? String(flags['out-dir']) : undefined,
    meta: await loadMeta(),
    dataDir: dataDir()
  });
}

export async function loadLastSyncPreview() {
  const [json, markdown] = await Promise.all([loadLastSyncJson(), loadLastSyncMarkdown()]);
  if (!json && !markdown) {
    throw new Error('No last sync output found. Run `supertwee sync` first.');
  }

  return {
    files: {
      json: lastSyncJsonPath(),
      markdown: lastSyncMarkdownPath()
    },
    json,
    markdown
  };
}
