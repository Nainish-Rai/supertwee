import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseMenuSelection, parseOptionalIntegerInput, parsePreviewSelection, parseYesNoInput, runInteractiveUi } from '../src/ui.mjs';

const execFileAsync = promisify(execFile);

function createFakeIo(answers) {
  const queue = [...answers];
  const writes = [];
  return {
    writes,
    ask(prompt) {
      writes.push(prompt);
      if (queue.length === 0) throw new Error(`Missing fake answer for prompt: ${prompt}`);
      return Promise.resolve(queue.shift());
    },
    print(message = '') {
      writes.push(message);
    },
    clear() {
      writes.push('[clear]');
    },
    close() {
      writes.push('[close]');
    }
  };
}

test('parseMenuSelection accepts only known menu items', () => {
  assert.equal(parseMenuSelection('1'), 1);
  assert.equal(parseMenuSelection('6'), 6);
  assert.throws(() => parseMenuSelection('0'), /1 to 6/);
  assert.throws(() => parseMenuSelection('abc'), /1 to 6/);
});

test('parsePreviewSelection accepts only known preview items', () => {
  assert.equal(parsePreviewSelection('1'), 1);
  assert.equal(parsePreviewSelection('3'), 3);
  assert.throws(() => parsePreviewSelection('0'), /1 to 3/);
});

test('input helpers handle blanks and validation', () => {
  assert.equal(parseYesNoInput('', false), false);
  assert.equal(parseYesNoInput('yes', false), true);
  assert.equal(parseOptionalIntegerInput('', 'Limit', 0), undefined);
  assert.equal(parseOptionalIntegerInput('12', 'Limit', 0), '12');
  assert.throws(() => parseOptionalIntegerInput('-1', 'Limit', 0), />= 0/);
});

test('runInteractiveUi routes export input into the export command', async () => {
  const io = createFakeIo(['4', '2026-04-01', '', '50', 'md', './tmp/ui-export', '', '6']);
  const calls = [];

  await runInteractiveUi({
    io,
    commands: {
      doctor: () => ({}),
      previewLastSync: async () => ({ files: {}, json: [], markdown: '' }),
      sync: async () => ({}),
      trends: async () => ({ text: '', topics: [], bangers: [] }),
      export: async (flags) => {
        calls.push(flags);
        return { outputDir: './tmp/ui-export', files: [], formats: ['md'], recordsExported: 50 };
      }
    }
  });

  assert.deepEqual(calls, [
    {
      since: '2026-04-01',
      limit: '50',
      format: 'md',
      'out-dir': './tmp/ui-export'
    }
  ]);
});

test('runInteractiveUi survives action failures and returns to the menu', async () => {
  const io = createFakeIo(['4', '', '', '', '', '', '', '6']);

  await runInteractiveUi({
    io,
    commands: {
      doctor: () => ({}),
      previewLastSync: async () => ({ files: {}, json: [], markdown: '' }),
      sync: async () => ({}),
      trends: async () => ({ text: '', topics: [], bangers: [] }),
      export: async () => {
        throw new Error('bad export');
      }
    }
  });

  assert.ok(io.writes.some((entry) => String(entry).includes('Error: bad export')));
  assert.equal(io.writes.at(-1), '[close]');
});

test('runInteractiveUi automatically enters preview after sync and supports later preview action', async () => {
  const io = createFakeIo([
    '1',
    '',
    '',
    '',
    '',
    '1',
    '',
    '3',
    '2',
    '2',
    '',
    '3',
    '6'
  ]);
  const calls = [];

  await runInteractiveUi({
    io,
    commands: {
      doctor: () => ({}),
      previewLastSync: async () => ({
        files: { markdown: '/tmp/last-sync.md', json: '/tmp/last-sync.json' },
        json: [{ id: '1', text: 'hello' }],
        markdown: '# supertwee last sync\n'
      }),
      sync: async (flags) => {
        calls.push(flags);
        return { fetchedThisRun: 1, lastSyncFiles: { markdown: '/tmp/last-sync.md', json: '/tmp/last-sync.json' } };
      },
      trends: async () => ({ text: '', topics: [], bangers: [] }),
      export: async () => ({})
    }
  });

  assert.equal(calls.length, 1);
  assert.ok(io.writes.some((entry) => String(entry).includes('preview last sync output')));
  assert.ok(io.writes.some((entry) => String(entry).includes('# supertwee last sync')));
  assert.ok(io.writes.some((entry) => String(entry).includes('"id": "1"')));
});

test('bin prints clean error output without stack traces by default', async () => {
  const binPath = path.resolve(process.cwd(), 'bin/supertwee.mjs');

  await assert.rejects(
    execFileAsync(process.execPath, [binPath, 'export', '--since', '2026-04-16', '--until', '2026-04-15']),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Error: `--since` must be before or equal to `--until`\./);
      assert.doesNotMatch(error.stderr, /file:\/\//);
      return true;
    }
  );
});
