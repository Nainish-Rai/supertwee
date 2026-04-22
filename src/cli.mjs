import { runInteractiveUi } from './ui.mjs';
import { buildDoctorSummary, runExportCommand, runSyncCommand, runTrendsCommand } from './commands.mjs';

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
  supertwee export [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--limit N]
                   [--format jsonl,md] [--out-dir PATH]
  supertwee ui
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

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (!command || command === 'help' || flags.help) {
    printHelp();
    return;
  }

  if (command === 'doctor') {
    console.log(JSON.stringify(buildDoctorSummary(), null, 2));
    return;
  }

  if (command === 'sync') {
    const result = await runSyncCommand(flags);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'trends') {
    const report = await runTrendsCommand(flags);

    if (flags.json) {
      console.log(JSON.stringify({ topics: report.topics, bangers: report.bangers }, null, 2));
      return;
    }

    console.log(report.text);
    return;
  }

  if (command === 'export') {
    const result = await runExportCommand(flags);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'ui') {
    await runInteractiveUi();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
