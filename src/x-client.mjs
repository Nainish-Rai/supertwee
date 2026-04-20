import { HOME_LATEST_OPERATION, GRAPHQL_FEATURES, buildTimelineVariables, queryId } from './config.mjs';
import { buildHeaders, resolveSession } from './session.mjs';
import { ensureDataDir, loadFeed, saveFeed, saveMeta } from './storage.mjs';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function timelineInstructions(json) {
  return (
    json?.data?.home?.home_timeline_urt?.instructions ??
    json?.data?.home?.home_timeline?.instructions ??
    []
  );
}

function flattenTimelineEntries(instructions) {
  const entries = [];
  for (const instruction of instructions) {
    if (instruction?.type === 'TimelineAddEntries' && Array.isArray(instruction.entries)) {
      entries.push(...instruction.entries);
    }
    if (instruction?.type === 'TimelinePinEntry' && instruction.entry) {
      entries.push(instruction.entry);
    }
  }
  return entries;
}

function collectTweetResults(entry, output = []) {
  if (!entry || typeof entry !== 'object') return output;

  const directResult = entry?.content?.itemContent?.tweet_results?.result;
  if (directResult) output.push(directResult);

  const items = entry?.content?.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      collectTweetResults(item, output);
    }
  }

  return output;
}

function replaceDisplayUrls(text, urlEntities) {
  let result = text;
  for (const entity of urlEntities) {
    if (typeof entity?.url === 'string' && typeof entity?.display_url === 'string') {
      result = result.split(entity.url).join(entity.display_url);
    }
  }
  return result;
}

export function convertTweetToRecord(tweetResult, syncedAt = new Date().toISOString()) {
  const tweet = tweetResult?.tweet ?? tweetResult;
  const legacy = tweet?.legacy;
  if (!legacy) return null;

  const tweetId = legacy.id_str ?? tweet?.rest_id;
  if (!tweetId) return null;

  const userResult = tweet?.core?.user_results?.result;
  const userLegacy = userResult?.legacy;
  const userCore = userResult?.core;
  const urlEntities = legacy?.entities?.urls ?? [];
  const mediaEntities = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const baseText = noteText ?? legacy.full_text ?? legacy.text ?? '';
  const text = replaceDisplayUrls(baseText, urlEntities);

  return {
    id: tweetId,
    tweetId,
    url: `https://x.com/${userCore?.screen_name ?? userLegacy?.screen_name ?? '_'}/status/${tweetId}`,
    text,
    postedAt: legacy.created_at ? new Date(legacy.created_at).toISOString() : null,
    syncedAt,
    conversationId: legacy.conversation_id_str,
    language: legacy.lang,
    sourceApp: legacy.source,
    authorHandle: userCore?.screen_name ?? userLegacy?.screen_name,
    authorName: userCore?.name ?? userLegacy?.name,
    authorProfileImageUrl:
      userResult?.avatar?.image_url ?? userLegacy?.profile_image_url_https ?? userLegacy?.profile_image_url,
    author: userResult
      ? {
          id: userResult.rest_id,
          handle: userCore?.screen_name ?? userLegacy?.screen_name,
          name: userCore?.name ?? userLegacy?.name,
          profileImageUrl:
            userResult?.avatar?.image_url ?? userLegacy?.profile_image_url_https ?? userLegacy?.profile_image_url,
          description: userLegacy?.description,
          verified: Boolean(userResult?.is_blue_verified ?? userLegacy?.verified),
          followersCount: asNumber(userLegacy?.followers_count),
          followingCount: asNumber(userLegacy?.friends_count),
          statusesCount: asNumber(userLegacy?.statuses_count)
        }
      : undefined,
    engagement: {
      likeCount: asNumber(legacy.favorite_count),
      repostCount: asNumber(legacy.retweet_count),
      replyCount: asNumber(legacy.reply_count),
      quoteCount: asNumber(legacy.quote_count),
      bookmarkCount: asNumber(legacy.bookmark_count),
      viewCount: asNumber(tweet?.views?.count)
    },
    mediaObjects: mediaEntities.map((media) => ({
      type: media?.type,
      mediaUrl: media?.media_url_https ?? media?.media_url,
      expandedUrl: media?.expanded_url,
      previewUrl: media?.media_url_https ?? media?.media_url,
      altText: media?.ext_alt_text,
      width: media?.original_info?.width,
      height: media?.original_info?.height,
      videoVariants: Array.isArray(media?.video_info?.variants)
        ? media.video_info.variants
            .filter((variant) => variant?.content_type === 'video/mp4')
            .map((variant) => ({
              url: variant.url,
              contentType: variant.content_type,
              bitrate: asNumber(variant.bitrate)
            }))
        : undefined
    })),
    links: urlEntities.map((entity) => entity?.expanded_url ?? entity?.url).filter(Boolean),
    ingestedVia: 'graphql'
  };
}

export function parseHomeLatestTimelineResponse(json, syncedAt = new Date().toISOString()) {
  const instructions = timelineInstructions(json);
  const entries = flattenTimelineEntries(instructions);
  const seen = new Set();
  const records = [];
  let nextCursor;

  for (const entry of entries) {
    const cursorType = entry?.content?.cursorType;
    if (cursorType === 'Bottom') {
      nextCursor = entry?.content?.value;
    }

    const tweetResults = collectTweetResults(entry);
    for (const tweetResult of tweetResults) {
      const record = convertTweetToRecord(tweetResult, syncedAt);
      if (!record || seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    }
  }

  return { records, nextCursor, errors: json?.errors ?? [] };
}

function buildTimelineUrl(options = {}) {
  const variables = buildTimelineVariables(options);
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES)
  });
  return `https://x.com/i/api/graphql/${queryId()}/${HOME_LATEST_OPERATION}?${params.toString()}`;
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

async function fetchTimelinePage(session, options = {}) {
  const response = await fetch(buildTimelineUrl(options), {
    method: 'GET',
    headers: buildHeaders(session)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HomeLatestTimeline returned HTTP ${response.status}. ` +
        `Response: ${text.slice(0, 300)}. ` +
        'If X rotated queryIds or required features, update X_HOME_LATEST_QUERY_ID or refresh feature flags from live browser traffic.'
    );
  }

  return parseHomeLatestTimelineResponse(await response.json());
}

export async function syncFeed(options = {}) {
  const session = resolveSession(options);
  await ensureDataDir();

  const existing = await loadFeed();
  let merged = existing;
  let cursor = options.cursor ?? null;
  let pagesFetched = 0;
  let totalFetched = 0;
  const maxPages = Math.max(1, Number(options.pages ?? 5));
  const delayMs = Math.max(0, Number(options.delayMs ?? 800));

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchTimelinePage(session, {
      count: options.count ?? 40,
      cursor: cursor ?? undefined,
      enableRanking: Boolean(options.enableRanking)
    });

    merged = mergeFeedRecords(merged, result.records);
    pagesFetched += 1;
    totalFetched += result.records.length;
    cursor = result.nextCursor ?? null;

    if (!cursor) break;
    if (page < maxPages - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  await saveFeed(merged);
  await saveMeta({
    syncedAt: new Date().toISOString(),
    totalItems: merged.length,
    lastCursor: cursor,
    pagesFetched,
    queryId: queryId(),
    ranking: Boolean(options.enableRanking)
  });

  return {
    saved: merged.length,
    pagesFetched,
    fetchedThisRun: totalFetched,
    lastCursor: cursor
  };
}
