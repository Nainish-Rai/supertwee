---
name: supertwee-twitter-read
description: Use the supertwee CLI to read and analyze X/Twitter data through the repo's browser-session web client. Trigger when a task asks for the current home feed, raw latest sync records, feed trends, filtered feed exports, post search, user tweets, or tweet thread/detail, and the work should stay read-only and use the same session or cookie method as `supertwee sync`.
---

# Supertwee Twitter Read

Prefer package usage first when the package is available:

```bash
npx supertwee doctor
```

Global install is also valid:

```bash
supertwee doctor
```

Use this order of preference:

1. `npx supertwee ...`
2. installed `supertwee` binary if it is already available
3. `node ./bin/supertwee.mjs ...` from the repo root
4. `npm start -- ...` from the repo root

If you use the repo-local forms, run them from the `supertwee` repo root.

## Rules

- Treat `supertwee` as read-only.
- Do not post, like, follow, mute, bookmark, or otherwise mutate X state.
- Do not switch to the official X API for tasks this CLI can handle.
- Do not bypass the CLI with ad hoc X web requests if the CLI already supports the task.
- Prefer JSON-producing commands for agent consumption.

## First Step

Run:

```bash
npx supertwee doctor
```

Equivalent forms:

```bash
npm install -g supertwee && supertwee doctor
npm start -- doctor
node ./bin/supertwee.mjs doctor
```

If `npx supertwee` fails because the package is not published or not reachable, fall back to the repo-local forms:

```bash
npm start -- doctor
node ./bin/supertwee.mjs doctor
```

Use the doctor output to confirm whether browser-session auth or manual cookies are available before attempting feed or search commands.

If auth is broken, stop and surface the exact doctor or cookie problem instead of guessing.

## Command Selection

Use these commands based on the task:

### Current home feed

Refresh the logged-in home feed:

```bash
npx supertwee sync --pages 5 --count 40
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee sync --pages 5 --count 40
npm start -- sync --pages 5 --count 40
node ./bin/supertwee.mjs sync --pages 5 --count 40
```

Use a smaller sync when the user asks for a quick look:

```bash
node ./bin/supertwee.mjs sync --pages 1 --count 20
```

After sync, the raw records fetched in that run are available at:

- `data/last-sync.json`
- `data/last-sync.md`

Use `data/last-sync.json` when the task needs the raw current-run feed records.

### Feed trend analysis

Use:

```bash
npx supertwee trends --json
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee trends --json
npm start -- trends --json
node ./bin/supertwee.mjs trends --json
```

Use this when the task asks for repeated themes, standout tweets, momentum, or "what is my feed amplifying?"

### Filtered archive export

Use:

```bash
npx supertwee export --since 2026-04-01 --until 2026-04-15 --limit 200 --format jsonl,md
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee export --since 2026-04-01 --until 2026-04-15 --limit 200 --format jsonl,md
npm start -- export --since 2026-04-01 --until 2026-04-15 --limit 200 --format jsonl,md
node ./bin/supertwee.mjs export --since 2026-04-01 --until 2026-04-15 --limit 200 --format jsonl,md
```

Use this when the task needs a reusable slice of the local archive or a human-readable markdown report.

### Search posts

Use:

```bash
npx supertwee search posts --query "ai agents" --count 20
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee search posts --query "ai agents" --count 20
npm start -- search posts --query "ai agents" --count 20
node ./bin/supertwee.mjs search posts --query "ai agents" --count 20
```

Use this for keyword, phrase, or topic search on X through the same logged-in web-session method.

### User tweets

Use:

```bash
npx supertwee user tweets --handle xdevelopers --count 20
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee user tweets --handle xdevelopers --count 20
npm start -- user tweets --handle xdevelopers --count 20
node ./bin/supertwee.mjs user tweets --handle xdevelopers --count 20
```

Use this when the task is about a specific account's recent posts.

### Tweet thread or detail

Use:

```bash
npx supertwee tweet thread --id 1346889436626259968
```

Equivalent npm form:

```bash
npm install -g supertwee && supertwee tweet thread --id 1346889436626259968
npm start -- tweet thread --id 1346889436626259968
node ./bin/supertwee.mjs tweet thread --id 1346889436626259968
```

Use this when the task needs a conversation view, thread reconstruction, or reply context around a specific tweet.

## Query ID Handling

Some X web GraphQL operations rotate query ids. If a command fails with a query-id error, use the matching environment variable or command flag:

- `SUPERTWEE_SEARCH_TIMELINE_QUERY_ID`
- `SUPERTWEE_USER_BY_SCREEN_NAME_QUERY_ID`
- `SUPERTWEE_USER_TWEETS_QUERY_ID`
- `SUPERTWEE_TWEET_DETAIL_QUERY_ID`

Command flags:

- `--query-id` for `search posts`
- `--query-id` and `--lookup-query-id` for `user tweets`
- `--query-id` for `tweet thread`

Do not invent query ids. If they are missing, report that clearly.

## Browser And Cookie Overrides

If needed, use the same overrides as `sync`:

```bash
npx supertwee sync --browser chrome
npx supertwee sync --browser firefox
npx supertwee sync --cookies <ct0> <auth_token>
```

The same session options can be passed to `search posts`, `user tweets`, and `tweet thread`.

## Output Guidance

- Prefer raw JSON output for analysis.
- Use `data/last-sync.json` for current-run home-feed records.
- Use `export --format md` only when the task explicitly benefits from a markdown artifact.
- In your answer, state which `supertwee` command you used and whether the result came from a fresh sync, local archive, search, user timeline, or thread detail.

## Failure Handling

- If there is no local feed archive, run `sync` before `trends` or `export`.
- If auth fails, stop and surface the exact session problem.
- If a search, user, or thread command returns an empty record set, report that plainly.
- If the CLI supports the task, stay inside the CLI instead of building a parallel workflow.
