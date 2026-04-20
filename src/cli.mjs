import { loadFeed } from './storage.mjs';
import { formatTrendReport } from './analyze.mjs';
import { syncFeed } from './x-client.mjs';
import { dataDir, loadEnv } from './config.mjs';
import { diagnoseSessionOptions } from './session.mjs';

function printHelp() {
  console.log(`supertwee

Usage:
  supertwee sync [--pages 5] [--count 40] [--delay-ms 800] [--ranking]
                 [--browser chrome|brave|firefox]
                 [--cookies <ct0> [auth_token]]
                 [--chrome-user-data-dir <path>]
                 [--chrome-profile-directory <name>]
                 [--firefox-profile-dir <path>]
  supertwee trends [--topic-limit 12] [--tweet-limit 10] [--json]
  supertwee doctor

Auth:
  Automatic by default: reads your logged-in browser session
  Manual override:
  export X_COOKIE_HEADER='auth_token=...; ct0=...'
  or
  export X_AUTH_TOKEN='...'
  export X_CT0='...'

Notes:
  - Default feed source is X's internal HomeLatestTimeline GraphQL endpoint.
  - Override query id with SUPERTWEE_HOME_LATEST_QUERY_ID if X rotates it.
  - Data is stored in ${dataDir()}
`);
}

export function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'cookies') {
      const values = [];
      let cursor = i + 1;
      while (cursor < argv.length && !argv[cursor].startsWith('--')) {
        values.push(argv[cursor]);
        cursor += 1;
      }
      flags[key] = values;
      i = cursor - 1;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

function envSummary() {
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

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (!command || command === 'help' || flags.help) {
    printHelp();
    return;
  }

  if (command === 'doctor') {
    console.log(JSON.stringify(envSummary(), null, 2));
    return;
  }

  if (command === 'sync') {
    const result = await syncFeed({
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
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'trends') {
    const feed = await loadFeed();
    if (feed.length === 0) {
      throw new Error('No feed data found. Run `supertwee sync` first.');
    }

    const report = formatTrendReport(feed, {
      topicLimit: Number(flags['topic-limit'] ?? 12),
      tweetLimit: Number(flags['tweet-limit'] ?? 10)
    });

    if (flags.json) {
      console.log(JSON.stringify({ topics: report.topics, bangers: report.bangers }, null, 2));
      return;
    }

    console.log(report.text);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
