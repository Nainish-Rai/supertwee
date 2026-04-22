import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseMenuSelection, parseOptionalIntegerInput, parseYesNoInput, runInteractiveUi } from '../src/ui.mjs';

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
  assert.equal(parseMenuSelection('5'), 5);
  assert.throws(() => parseMenuSelection('0'), /1 to 5/);
  assert.throws(() => parseMenuSelection('abc'), /1 to 5/);
});

test('input helpers handle blanks and validation', () => {
  assert.equal(parseYesNoInput('', false), false);
  assert.equal(parseYesNoInput('yes', false), true);
  assert.equal(parseOptionalIntegerInput('', 'Limit', 0), undefined);
  assert.equal(parseOptionalIntegerInput('12', 'Limit', 0), '12');
  assert.throws(() => parseOptionalIntegerInput('-1', 'Limit', 0), />= 0/);
});

test('runInteractiveUi routes export input into the export command', async () => {
  const io = createFakeIo(['3', '2026-04-01', '', '50', 'md', './tmp/ui-export', '', '5']);
  const calls = [];

  await runInteractiveUi({
    io,
    commands: {
      doctor: () => ({}),
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
  const io = createFakeIo(['3', '', '', '', '', '', '', '5']);

  await runInteractiveUi({
    io,
    commands: {
      doctor: () => ({}),
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
