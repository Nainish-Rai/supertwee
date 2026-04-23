# supertwee

supertwee is a local-first cli for exploring your x feed.

it syncs your home timeline, saves it to disk, finds repeated topics, and ranks the tweets your feed is rewarding hardest.

## why people use it

- see what your feed is actually amplifying
- catch repeat themes before they feel obvious
- find high-signal tweets without scrolling for hours
- keep your archive and analysis on your own machine

## what it does

- `sync` fetches pages from the x web timeline using the same internal graphql pattern the web app uses
- `search posts` queries x web search using the same logged-in session method
- `user tweets` pulls a user timeline using the same logged-in session method
- `tweet thread` fetches a tweet conversation view using the same logged-in session method
- `trends` extracts recurring topics, phrases, domains, hashtags, and standout tweets
- `export` writes filtered local archive exports as `jsonl` and `markdown`
- `ui` opens an interactive command hub in the terminal, including raw last-sync preview
- `doctor` shows which auth path supertwee can use on this machine

## quick start

run it directly from npm:

```bash
npx supertwee doctor
npx supertwee sync --pages 5 --count 40
npx supertwee search posts --query "ai agents"
npx supertwee user tweets --handle xdevelopers
npx supertwee tweet thread --id 1346889436626259968
npx supertwee trends
npx supertwee export --since 2026-04-01 --format jsonl,md
npx supertwee ui
```

or install it globally:

```bash
npm install -g supertwee
supertwee doctor
supertwee sync --pages 5 --count 40
supertwee search posts --query "ai agents"
supertwee user tweets --handle xdevelopers
supertwee tweet thread --id 1346889436626259968
supertwee trends
supertwee export --since 2026-04-01 --format jsonl,md
supertwee ui
```

if you want to run it from source instead:

```bash
git clone https://github.com/Nainish-Rai/supertwee.git
cd supertwee
npm install
npm link
supertwee doctor
supertwee sync --pages 5 --count 40
supertwee search posts --query "ai agents"
supertwee user tweets --handle xdevelopers
supertwee tweet thread --id 1346889436626259968
supertwee trends
supertwee export --since 2026-04-01 --format jsonl,md
supertwee ui
```

if you do not want to use `npm link`, run the repo-local cli directly:

```bash
node ./bin/supertwee.mjs doctor
node ./bin/supertwee.mjs sync --pages 5 --count 40
node ./bin/supertwee.mjs search posts --query "ai agents"
node ./bin/supertwee.mjs user tweets --handle xdevelopers
node ./bin/supertwee.mjs tweet thread --id 1346889436626259968
node ./bin/supertwee.mjs trends
node ./bin/supertwee.mjs export --limit 100
node ./bin/supertwee.mjs ui
```

you can also run the repo-local cli through npm without linking:

```bash
npm start -- doctor
npm start -- sync --pages 5 --count 40
npm start -- search posts --query "ai agents"
npm start -- user tweets --handle xdevelopers
npm start -- tweet thread --id 1346889436626259968
npm start -- trends
npm start -- export --limit 100
```

## how it works

1. `sync` reads your logged-in x browser session or manual cookies.
2. it fetches timeline pages and stores normalized tweet records in `./data`.
3. `trends` scores repeated patterns across the saved archive.
4. each `sync` also writes the raw records fetched in that run to `last-sync.json` and `last-sync.md`.
5. `export` writes filtered slices as reusable `jsonl` plus a readable markdown report.
6. `trends` highlights both topic momentum and top-performing tweets.

## commands

```bash
supertwee doctor
supertwee sync
supertwee sync --pages 5 --count 40
supertwee sync --ranking
supertwee sync --browser chrome
supertwee sync --browser firefox
supertwee search posts --query "ai agents" --count 20
supertwee user tweets --handle xdevelopers --count 20
supertwee tweet thread --id 1346889436626259968
supertwee trends
supertwee trends --json
supertwee export
supertwee export --since 2026-04-01 --until 2026-04-15 --limit 200
supertwee export --format md --out-dir ./tmp/export
supertwee ui
```

## auth

supertwee tries browser-session auth first.

supported paths:

- chrome-family browser cookie extraction
- firefox cookie extraction
- manual cookie override
- manual env var override

examples:

```bash
supertwee sync --browser chrome
supertwee sync --browser firefox
supertwee sync --chrome-profile-directory "Profile 1"
supertwee sync --firefox-profile-dir "/absolute/profile/path"
supertwee sync --cookies <ct0> <auth_token>
```

manual env vars also work:

```bash
export X_AUTH_TOKEN='...'
export X_CT0='...'
```

the web-session commands also accept manual query id overrides for internal x graphql operations:

```bash
export SUPERTWEE_SEARCH_TIMELINE_QUERY_ID='...'
export SUPERTWEE_USER_BY_SCREEN_NAME_QUERY_ID='...'
export SUPERTWEE_USER_TWEETS_QUERY_ID='...'
export SUPERTWEE_TWEET_DETAIL_QUERY_ID='...'
```

or pass `--query-id` directly for a single command. `user tweets` also supports `--lookup-query-id` for the handle-to-user lookup step.

## output

by default, supertwee writes local data to:

```bash
./data
```

override it with:

```bash
export SUPERTWEE_DATA_DIR=/absolute/path
```

exports are written to `./data/exports/<timestamp>/` unless `--out-dir` is provided.

each sync also refreshes:

```bash
./data/last-sync.json
./data/last-sync.md
```

these files contain the raw records fetched in the current sync run only.

`supertwee ui` opens a dependency-free interactive menu for `sync`, `preview last sync output`, `trends`, `export`, and `doctor`.

when you run `sync` from `supertwee ui`, it automatically drops into a terminal-only preview menu for the latest raw markdown or json output.

## web-session read commands

the new read commands stay on the same web-session path as `sync`. they do not switch to the official x api.

```bash
supertwee search posts --query "founder mode" --count 25
supertwee user tweets --handle xdevelopers --count 20
supertwee tweet thread --id 1346889436626259968
```

these commands print json by default so agents can consume them directly.

## what makes a topic trend

supertwee looks for repeated signal, not just one loud tweet.

it weights:

- recurring phrases
- hashtags and cashtags
- repeated high-signal terms
- repeated domains
- cross-tweet topic overlap

## what makes a tweet a banger

supertwee ranks tweets using engagement and reach signals, including:

- views
- likes
- reposts
- replies
- quotes
- bookmarks
- author follower count

when enough original tweets exist, retweets are pushed down so the list stays useful.

## query id override

x rotates internal graphql query ids sometimes.

if `sync` starts failing after a web app change, override the current `homelatesttimeline` query id:

```bash
export SUPERTWEE_HOME_LATEST_QUERY_ID='CRprHpVA12yhsub-KRERIg'
```

## privacy

- your feed archive stays local
- supertwee does not need a hosted backend
- analysis runs on saved data, not a remote dashboard

## who this is for

supertwee is for people who spend serious time on x and want a faster way to answer:

- what topics are taking over my feed
- which tweets are breaking out
- what kinds of posts keep getting rewarded

## development

```bash
npm test
npm start -- doctor
node ./bin/supertwee.mjs doctor
```

## license

mit
