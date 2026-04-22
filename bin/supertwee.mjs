#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (process.env.SUPERTWEE_DEBUG === '1' && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
}
