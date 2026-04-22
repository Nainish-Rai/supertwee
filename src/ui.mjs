import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseExportFormats, validateExportOptions } from './export.mjs';
import { buildDoctorSummary, runExportCommand, runSyncCommand, runTrendsCommand } from './commands.mjs';

const MENU = [
  '1. sync feed',
  '2. show trends',
  '3. export archive',
  '4. doctor',
  '5. exit'
];

function trimOrUndefined(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

export function parseMenuSelection(value) {
  const normalized = String(value ?? '').trim();
  const choice = Number(normalized);
  if (!Number.isInteger(choice) || choice < 1 || choice > 5) {
    throw new Error('Select a number from 1 to 5.');
  }
  return choice;
}

export function parseYesNoInput(value, defaultValue = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === 'y' || normalized === 'yes') return true;
  if (normalized === 'n' || normalized === 'no') return false;
  throw new Error('Enter yes or no.');
}

export function parseOptionalIntegerInput(value, label, minimum = 0) {
  const normalized = trimOrUndefined(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
  return String(parsed);
}

function createNodeIo() {
  const rl = readline.createInterface({ input, output });
  return {
    ask(prompt) {
      return rl.question(prompt);
    },
    print(message = '') {
      console.log(message);
    },
    clear() {
      if (output.isTTY) console.clear();
    },
    close() {
      rl.close();
    }
  };
}

async function pause(io) {
  await io.ask('\nPress Enter to continue...');
}

function renderMenu() {
  return ['supertwee ui', '', ...MENU, ''].join('\n');
}

async function runSyncFlow(io, commands) {
  const pages = parseOptionalIntegerInput(await io.ask('Pages [default 5]: '), 'Pages', 1);
  const count = parseOptionalIntegerInput(await io.ask('Count per page [default 40]: '), 'Count', 1);
  const browser = trimOrUndefined(await io.ask('Browser [chrome|brave|firefox|blank]: '));
  const ranking = parseYesNoInput(await io.ask('Enable ranking? [y/N]: '), false);
  const result = await commands.sync({
    ...(pages ? { pages } : {}),
    ...(count ? { count } : {}),
    ...(browser ? { browser } : {}),
    ...(ranking ? { ranking: true } : {})
  });
  io.print(JSON.stringify(result, null, 2));
}

async function runTrendsFlow(io, commands) {
  const topicLimit = parseOptionalIntegerInput(await io.ask('Topic limit [default 12]: '), 'Topic limit', 1);
  const tweetLimit = parseOptionalIntegerInput(await io.ask('Tweet limit [default 10]: '), 'Tweet limit', 1);
  const json = parseYesNoInput(await io.ask('Output JSON? [y/N]: '), false);
  const report = await commands.trends({
    ...(topicLimit ? { 'topic-limit': topicLimit } : {}),
    ...(tweetLimit ? { 'tweet-limit': tweetLimit } : {})
  });
  if (json) {
    io.print(JSON.stringify({ topics: report.topics, bangers: report.bangers }, null, 2));
    return;
  }
  io.print(report.text);
}

async function runExportFlow(io, commands) {
  const since = trimOrUndefined(await io.ask('Since [YYYY-MM-DD|blank]: '));
  const until = trimOrUndefined(await io.ask('Until [YYYY-MM-DD|blank]: '));
  const limit = parseOptionalIntegerInput(await io.ask('Limit [blank for all]: '), 'Limit', 0);
  const formatInput = trimOrUndefined(await io.ask('Format [jsonl,md]: '));
  const outDir = trimOrUndefined(await io.ask('Output directory [blank for default]: '));
  const format = formatInput ? parseExportFormats(formatInput).join(',') : undefined;
  validateExportOptions({ since, until, limit });
  const result = await commands.export({
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    ...(limit ? { limit } : {}),
    ...(format ? { format } : {}),
    ...(outDir ? { 'out-dir': outDir } : {})
  });
  io.print(JSON.stringify(result, null, 2));
}

async function runDoctorFlow(io, commands) {
  io.print(JSON.stringify(commands.doctor(), null, 2));
}

export async function runInteractiveUi(options = {}) {
  const io = options.io ?? createNodeIo();
  const commands = options.commands ?? {
    doctor: buildDoctorSummary,
    sync: runSyncCommand,
    trends: runTrendsCommand,
    export: runExportCommand
  };

  try {
    let running = true;
    while (running) {
      io.clear();
      io.print(renderMenu());

      try {
        const selection = parseMenuSelection(await io.ask('Choose an action: '));
        if (selection === 1) {
          await runSyncFlow(io, commands);
          await pause(io);
          continue;
        }
        if (selection === 2) {
          await runTrendsFlow(io, commands);
          await pause(io);
          continue;
        }
        if (selection === 3) {
          await runExportFlow(io, commands);
          await pause(io);
          continue;
        }
        if (selection === 4) {
          await runDoctorFlow(io, commands);
          await pause(io);
          continue;
        }
        running = false;
      } catch (error) {
        io.print(`Error: ${error.message}`);
        await pause(io);
      }
    }
  } finally {
    io.close();
  }
}
