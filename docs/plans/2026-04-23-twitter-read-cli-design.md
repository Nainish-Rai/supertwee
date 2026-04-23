# Twitter Read CLI Expansion Design

## Summary

Expand `supertwee` into a broader read-only X web-session CLI without switching to the official X API.

The first pass adds:

- `supertwee search posts`
- `supertwee user tweets`
- `supertwee tweet thread`

These commands must use the same browser-session method as `supertwee sync`:

- logged-in browser cookies or manual `ct0` / `auth_token`
- X web GraphQL requests
- normalized local JSON output

## Command Surface

```bash
supertwee search posts --query "<query>" [--count N] [--cursor CURSOR] [--query-id ID] [--json]
supertwee user tweets --handle <handle> [--user-id ID] [--count N] [--cursor CURSOR] [--query-id ID] [--lookup-query-id ID] [--json]
supertwee tweet thread --id <tweetId> [--query-id ID] [--json]
```

Notes:

- JSON is the default output for these new commands.
- `--json` is accepted for consistency but does not change behavior in pass one.
- `user tweets` accepts either `--handle` or `--user-id`.

## Architecture

### Shared Web Transport

Add a reusable X web client layer that handles:

- session resolution and headers
- GraphQL URL construction
- query id lookup
- response validation
- generic timeline parsing
- generic tweet extraction

The existing home timeline sync should reuse this shared transport instead of owning its own fetch logic.

### Resource Operations

Implement four operations behind the transport:

- `HomeLatestTimeline`
- `SearchTimeline`
- `UserByScreenName`
- `UserTweets`
- `TweetDetail`

`HomeLatestTimeline` keeps its current default query id.
The new operations should support environment-variable query ids and `--query-id` overrides because X rotates internal ids.

## Query ID Resolution

Support these environment variables:

- `SUPERTWEE_HOME_LATEST_QUERY_ID`
- `SUPERTWEE_SEARCH_TIMELINE_QUERY_ID`
- `SUPERTWEE_USER_BY_SCREEN_NAME_QUERY_ID`
- `SUPERTWEE_USER_TWEETS_QUERY_ID`
- `SUPERTWEE_TWEET_DETAIL_QUERY_ID`

If a required query id is missing, fail fast with an explicit message naming the expected variable and matching command flag override.

## Data Model

Continue using one normalized tweet record shape for all tweet-like resources.

Add a normalized user shape for `user tweets`:

- `id`
- `handle`
- `name`
- `description`
- `verified`
- follower / following / status counts
- avatar URL

Command outputs:

- `search posts` → `{ query, records, nextCursor, queryId }`
- `user tweets` → `{ handle, userId, user, records, nextCursor, queryIds }`
- `tweet thread` → `{ tweetId, records, queryId }`

## Error Handling

- missing auth → tell the user to run `supertwee doctor`
- missing query id → name the missing env var and flag
- missing `--query` / `--handle` / `--id` → fail fast in CLI
- malformed or changed X payloads → fail with operation-specific guidance
- empty results are valid and should return `records: []`

## Testing

- query id resolution
- search timeline parsing
- user lookup parsing
- user tweets parsing
- tweet detail parsing
- CLI flag validation for new subcommands
- existing sync / trends / export / UI tests stay green
