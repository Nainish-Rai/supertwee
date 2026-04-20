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
- `trends` extracts recurring topics, phrases, domains, hashtags, and standout tweets
- `doctor` shows which auth path supertwee can use on this machine

## quick start

```bash
git clone https://github.com/Nainish-Rai/supertwee.git
cd supertwee
npm install
npm link
supertwee doctor
supertwee sync --pages 5 --count 40
supertwee trends
```

if you do not want to use `npm link`, run the cli directly:

```bash
node ./bin/supertwee.mjs doctor
node ./bin/supertwee.mjs sync --pages 5 --count 40
node ./bin/supertwee.mjs trends
```

## how it works

1. `sync` reads your logged-in x browser session or manual cookies.
2. it fetches timeline pages and stores normalized tweet records in `./data`.
3. `trends` scores repeated patterns across the saved archive.
4. it highlights both topic momentum and top-performing tweets.

## commands

```bash
supertwee doctor
supertwee sync
supertwee sync --pages 5 --count 40
supertwee sync --ranking
supertwee sync --browser chrome
supertwee sync --browser firefox
supertwee trends
supertwee trends --json
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

## output

by default, supertwee writes local data to:

```bash
./data
```

override it with:

```bash
export SUPERTWEE_DATA_DIR=/absolute/path
```

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
node ./bin/supertwee.mjs doctor
```

## license

mit
