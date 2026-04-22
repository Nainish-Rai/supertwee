# UI Command And Error Handling Design

## Summary

Add an explicit `supertwee ui` command that opens a dependency-free terminal menu for the existing command set:

- sync
- trends
- export
- doctor

Also patch the CLI entrypoint so failures print a clean error line instead of a full stack trace by default.

## Command Surface

```bash
supertwee ui
```

Behavior:

- `supertwee` stays unchanged
- `supertwee ui` opens a looped menu
- the menu returns to the hub after each action
- `exit` closes the interface cleanly

## Interaction Flow

The UI is a thin prompt shell over existing command logic:

1. render header and numbered actions
2. read one selection
3. ask for optional inputs
4. run the existing command path
5. print the result
6. wait for enter
7. return to the main menu

Blank answers use current defaults.

## Architecture

- add a reusable command module for `doctor`, `sync`, `trends`, and `export`
- keep `src/cli.mjs` as the command dispatcher
- add `src/ui.mjs` for prompt logic and menu flow
- keep all storage and export behavior unchanged

## Error Handling

- `bin/supertwee.mjs` catches top-level errors
- default output: `Error: ...`
- set non-zero exit code on failure
- `SUPERTWEE_DEBUG=1` prints the full stack
- UI action failures print the message, pause, and return to the menu

## Testing

- menu selection parsing
- yes/no and numeric input helpers
- export flow passes collected options into the existing export command
- UI survives action failures
- top-level CLI errors suppress stack traces by default
