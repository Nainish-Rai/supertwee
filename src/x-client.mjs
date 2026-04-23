import { lastSyncJsonPath, lastSyncMarkdownPath, queryId } from './config.mjs';
import { renderRawSyncMarkdown } from './export.mjs';
import { resolveSession } from './session.mjs';
import { ensureDataDir, loadFeed, saveFeed, saveLastSyncJson, saveLastSyncMarkdown, saveMeta } from './storage.mjs';
import { convertTweetToRecord, extractUserResult, fetchGraphqlOperation, normalizeUserResult, parseTimelineResponse, parseTweetDetailResponse } from './x-web-client.mjs';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordQualityScore(record) {
  let score = 0;
  if (record.text) score += 2;
  if (record.author?.followersCount != null) score += 2;
  if (record.engagement?.viewCount != null) score += 3;
  if ((record.mediaObjects?.length ?? 0) > 0) score += 2;
  if ((record.links?.length ?? 0) > 0) score += 1;
  return score;
}

export { convertTweetToRecord };

export function parseHomeLatestTimelineResponse(json, syncedAt = new Date().toISOString()) {
  return parseTimelineResponse(json, syncedAt);
}

export function mergeFeedRecords(existing, incoming) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) {
    const prev = byId.get(record.id);
    if (!prev) {
      byId.set(record.id, record);
      continue;
    }
    byId.set(record.id, recordQualityScore(record) >= recordQualityScore(prev) ? { ...prev, ...record } : { ...record, ...prev });
  }
  return Array.from(byId.values()).sort((a, b) => String(b.postedAt ?? b.syncedAt).localeCompare(String(a.postedAt ?? a.syncedAt)));
}

function buildHomeLatestVariables(options = {}) {
  const variables = {
    count: options.count ?? 40,
    includePromotedContent: options.includePromotedContent ?? false,
    latestControlAvailable: true,
    requestContext: 'launch',
    seenTweetIds: [],
    withCommunity: true
  };
  if (options.cursor) variables.cursor = options.cursor;
  if (options.enableRanking) variables.enableRanking = true;
  return variables;
}

function buildSearchTimelineVariables(options = {}) {
  const variables = {
    rawQuery: options.query,
    count: Math.max(1, Number(options.count ?? 20)),
    querySource: options.querySource ?? 'typed_query',
    product: options.product ?? 'Latest'
  };
  if (options.cursor) variables.cursor = options.cursor;
  return variables;
}

function buildUserByScreenNameVariables(handle) {
  return {
    screen_name: String(handle).replace(/^@/, ''),
    withSafetyModeUserFields: true
  };
}

function buildUserTweetsVariables(options = {}) {
  const variables = {
    userId: options.userId,
    count: Math.max(1, Number(options.count ?? 20)),
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
    withV2Timeline: true
  };
  if (options.cursor) variables.cursor = options.cursor;
  return variables;
}

function buildTweetDetailVariables(tweetId) {
  return {
    focalTweetId: tweetId,
    referrer: 'tweet',
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true
  };
}

async function fetchTimelinePage(session, options = {}) {
  const response = await fetchGraphqlOperation(session, 'homeLatest', {
    queryId: options.queryId,
    variables: buildHomeLatestVariables(options)
  });
  return parseHomeLatestTimelineResponse(response.json);
}

export async function searchPosts(options = {}) {
  if (!options.query) {
    throw new Error('Expected --query for `supertwee search posts`.');
  }

  const session = resolveSession(options);
  const response = await fetchGraphqlOperation(session, 'searchTimeline', {
    queryId: options.queryId,
    variables: buildSearchTimelineVariables(options)
  });
  const parsed = parseTimelineResponse(response.json);

  return {
    query: options.query,
    records: parsed.records,
    nextCursor: parsed.nextCursor,
    queryId: response.queryId
  };
}

export async function lookupUserByHandle(options = {}) {
  const handle = String(options.handle ?? '').trim().replace(/^@/, '');
  if (!handle) {
    throw new Error('Expected --handle for `supertwee user tweets` when --user-id is not provided.');
  }

  const session = resolveSession(options);
  const response = await fetchGraphqlOperation(session, 'userByScreenName', {
    queryId: options.lookupQueryId,
    variables: buildUserByScreenNameVariables(handle)
  });
  const rawUser = extractUserResult(response.json);
  const user = normalizeUserResult(rawUser);
  if (!user) {
    throw new Error(`Could not resolve @${handle} from X web response.`);
  }

  return {
    handle: user.handle,
    user,
    queryId: response.queryId
  };
}

export async function fetchUserTweets(options = {}) {
  let userId = options.userId ? String(options.userId) : null;
  let user = null;
  let handle = options.handle ? String(options.handle).replace(/^@/, '') : null;
  let lookupQueryId = null;

  if (!userId) {
    const lookup = await lookupUserByHandle(options);
    userId = lookup.user.id;
    user = lookup.user;
    handle = lookup.user.handle;
    lookupQueryId = lookup.queryId;
  }

  const session = resolveSession(options);
  const response = await fetchGraphqlOperation(session, 'userTweets', {
    queryId: options.queryId,
    variables: buildUserTweetsVariables({
      userId,
      count: options.count,
      cursor: options.cursor
    })
  });
  const parsed = parseTimelineResponse(response.json);
  if (!user) {
    const rawUser = extractUserResult(response.json);
    user = normalizeUserResult(rawUser) ?? null;
    handle = user?.handle ?? handle ?? null;
  }

  return {
    handle,
    userId,
    user,
    records: parsed.records,
    nextCursor: parsed.nextCursor,
    queryIds: {
      lookup: lookupQueryId,
      tweets: response.queryId
    }
  };
}

export async function fetchTweetThread(options = {}) {
  const tweetId = String(options.id ?? options.tweetId ?? '').trim();
  if (!tweetId) {
    throw new Error('Expected --id for `supertwee tweet thread`.');
  }

  const session = resolveSession(options);
  const response = await fetchGraphqlOperation(session, 'tweetDetail', {
    queryId: options.queryId,
    variables: buildTweetDetailVariables(tweetId)
  });
  const parsed = parseTweetDetailResponse(response.json);

  return {
    tweetId,
    records: parsed.records,
    queryId: response.queryId
  };
}

export async function syncFeed(options = {}) {
  const session = resolveSession(options);
  await ensureDataDir();

  const existing = await loadFeed();
  let merged = existing;
  const fetchedRecords = [];
  let cursor = options.cursor ?? null;
  let pagesFetched = 0;
  let totalFetched = 0;
  const maxPages = Math.max(1, Number(options.pages ?? 5));
  const delayMs = Math.max(0, Number(options.delayMs ?? 800));

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchTimelinePage(session, {
      count: options.count ?? 40,
      cursor: cursor ?? undefined,
      enableRanking: Boolean(options.enableRanking),
      queryId: options.queryId
    });

    merged = mergeFeedRecords(merged, result.records);
    fetchedRecords.push(...result.records);
    pagesFetched += 1;
    totalFetched += result.records.length;
    cursor = result.nextCursor ?? null;

    if (!cursor) break;
    if (page < maxPages - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  await saveFeed(merged);
  const syncedAt = new Date().toISOString();
  await saveMeta({
    syncedAt,
    totalItems: merged.length,
    lastCursor: cursor,
    pagesFetched,
    queryId: queryId(),
    ranking: Boolean(options.enableRanking)
  });
  await saveLastSyncJson(fetchedRecords);
  await saveLastSyncMarkdown(`${renderRawSyncMarkdown(fetchedRecords, { syncedAt })}\n`);

  return {
    saved: merged.length,
    pagesFetched,
    fetchedThisRun: totalFetched,
    lastCursor: cursor,
    lastSyncFiles: {
      json: lastSyncJsonPath(),
      markdown: lastSyncMarkdownPath()
    }
  };
}
