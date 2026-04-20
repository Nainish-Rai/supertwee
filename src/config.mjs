import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browserUserDataDir, detectBrowser, getBrowser, listBrowserIds } from './browsers.mjs';

export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export const DEFAULT_HOME_LATEST_QUERY_ID = 'CRprHpVA12yhsub-KRERIg';
export const HOME_LATEST_OPERATION = 'HomeLatestTimeline';

export const GRAPHQL_FEATURES = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_share_attachment_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true
};

export function dataDir() {
  return path.resolve(process.env.SUPERTWEE_DATA_DIR || path.join(process.cwd(), 'data'));
}

export function feedPath() {
  return path.join(dataDir(), 'feed.jsonl');
}

export function metaPath() {
  return path.join(dataDir(), 'feed-meta.json');
}

export function queryId() {
  return process.env.SUPERTWEE_HOME_LATEST_QUERY_ID || process.env.X_HOME_LATEST_QUERY_ID || DEFAULT_HOME_LATEST_QUERY_ID;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadEnv() {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(dataDir(), '.env.local'),
    path.join(dataDir(), '.env')
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

export function loadBrowserSessionConfig(overrides = {}) {
  loadEnv();
  const browserId = overrides.browserId ?? process.env.SUPERTWEE_BROWSER;
  const browser = browserId ? getBrowser(browserId) : detectBrowser();
  const chromeUserDataDir =
    process.env.SUPERTWEE_CHROME_USER_DATA_DIR ??
    browserUserDataDir(browser);

  if (!chromeUserDataDir) {
    throw new Error(
      `Could not detect a browser data directory for ${browser.displayName} on ${os.platform()}.\n` +
        `Set SUPERTWEE_CHROME_USER_DATA_DIR in .env, pass --chrome-user-data-dir, or try --browser <name>.\n` +
        `Supported browsers: ${listBrowserIds().join(', ')}`
    );
  }

  const chromeProfileDirectory =
    process.env.SUPERTWEE_CHROME_PROFILE_DIRECTORY ??
    'Default';

  return { browser, chromeUserDataDir, chromeProfileDirectory };
}

export function buildTimelineVariables(options = {}) {
  const variables = {
    count: options.count ?? 40,
    includePromotedContent: options.includePromotedContent ?? false,
    latestControlAvailable: true,
    requestContext: 'launch',
    seenTweetIds: [],
    withCommunity: true
  };
  if (options.cursor) variables.cursor = options.cursor;
  if (options.enableRanking) variables.enableRanking = true;
  return variables;
}
