# Supertwee

Supertwee is a CLI for syncing, ranking, and exploring your X feed locally.

It uses the same family of internal GraphQL requests that X web uses, but stores a local feed archive you can analyze from the terminal.

## What it does

- `supertwee sync`: fetches pages from the Following feed via `HomeLatestTimeline`
- `supertwee trends`: finds repeated topics and top-performing tweets from the saved feed
- `supertwee doctor`: shows detected browser-session config and manual auth fallback state

## Why Supertwee

Supertwee is built for one job: give you a fast terminal-native way to understand what is actually happening in your X feed.

## Auth

Default mode reads your logged-in browser session automatically.

Examples:

```bash
node ./bin/supertwee.mjs sync --browser chrome
node ./bin/supertwee.mjs sync --browser firefox
node ./bin/supertwee.mjs sync --chrome-profile-directory "Profile 1"
node ./bin/supertwee.mjs sync --firefox-profile-dir "/absolute/profile/path"
```

Manual overrides still work:

```bash
node ./bin/supertwee.mjs sync --cookies <ct0> <auth_token>
```

Or:

```bash
export X_AUTH_TOKEN='...'
export X_CT0='...'
```

You can grab those from your logged-in X web session in DevTools.

## Usage

```bash
cd projects/supertwee
node ./bin/supertwee.mjs doctor
node ./bin/supertwee.mjs sync --pages 5 --count 40 --browser chrome
node ./bin/supertwee.mjs trends
```

To bias the feed toward ranked items on the same endpoint:

```bash
node ./bin/supertwee.mjs sync --pages 5 --count 40 --ranking
```

## Query IDs

X rotates internal GraphQL query IDs occasionally. This project defaults `HomeLatestTimeline` to a recent public value, but you can override it:

```bash
export SUPERTWEE_HOME_LATEST_QUERY_ID='CRprHpVA12yhsub-KRERIg'
```

If you get a 400/404 after X changes their web app, capture the latest `HomeLatestTimeline` request from your browser network tab and update the env var.

## Data

By default, the tool writes to `./data` inside the project. Override with:

```bash
export SUPERTWEE_DATA_DIR=/absolute/path
```

## Notes on analysis

- Trending topics are derived from hashtags, cashtags, repeated domains, and recurring high-signal terms.
- Banger tweets are ranked by a normalized score built from views, likes, reposts, replies, quotes, bookmarks, and author follower count.
- This is intentionally local-first. It analyzes your saved feed archive, not live search results.
