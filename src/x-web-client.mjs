import { GRAPHQL_FEATURES, requiredQueryId, resolveWebGraphqlOperation } from './config.mjs';
import { buildHeaders } from './session.mjs';

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
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

function collectObjects(root, matcher, output = [], seen = new WeakSet()) {
  if (!root || typeof root !== 'object') return output;
  if (seen.has(root)) return output;
  seen.add(root);

  if (matcher(root)) output.push(root);

  if (Array.isArray(root)) {
    for (const item of root) {
      collectObjects(item, matcher, output, seen);
    }
    return output;
  }

  for (const value of Object.values(root)) {
    collectObjects(value, matcher, output, seen);
  }

  return output;
}

function findInstructions(root, seen = new WeakSet()) {
  if (!root || typeof root !== 'object') return null;
  if (seen.has(root)) return null;
  seen.add(root);

  if (Array.isArray(root.instructions)) {
    return root.instructions;
  }

  const values = Array.isArray(root) ? root : Object.values(root);
  for (const value of values) {
    const found = findInstructions(value, seen);
    if (found) return found;
  }

  return null;
}

function flattenTimelineEntries(instructions) {
  const entries = [];
  for (const instruction of instructions ?? []) {
    if (instruction?.type === 'TimelineAddEntries' && Array.isArray(instruction.entries)) {
      entries.push(...instruction.entries);
      continue;
    }
    if (instruction?.type === 'TimelinePinEntry' && instruction.entry) {
      entries.push(instruction.entry);
      continue;
    }
    if (instruction?.entry) {
      entries.push(instruction.entry);
    }
  }
  return entries;
}

function extractBottomCursor(entries) {
  for (const entry of entries) {
    const cursorType = entry?.content?.cursorType ?? entry?.cursorType;
    if (cursorType === 'Bottom') {
      return entry?.content?.value ?? entry?.value ?? null;
    }
  }
  return null;
}

function tweetResultNode(value) {
  if (value?.tweet_results?.result) return value.tweet_results.result;
  if (value?.tweetResult?.result) return value.tweetResult.result;
  if (value?.result?.tweet?.legacy) return value.result;
  if (value?.legacy && (value?.rest_id || value?.id_str) && (value?.legacy?.created_at || value?.legacy?.full_text || value?.legacy?.conversation_id_str)) {
    return value;
  }
  return null;
}

function collectTweetResults(root, output = [], seenNodes = new WeakSet(), seenIds = new Set()) {
  if (!root || typeof root !== 'object') return output;
  if (seenNodes.has(root)) return output;
  seenNodes.add(root);

  const candidate = tweetResultNode(root);
  if (candidate) {
    const id = candidate?.rest_id ?? candidate?.legacy?.id_str ?? candidate?.tweet?.legacy?.id_str;
    const dedupeKey = id ?? `node-${output.length}`;
    if (!seenIds.has(dedupeKey)) {
      seenIds.add(dedupeKey);
      output.push(candidate);
    }
  }

  if (Array.isArray(root)) {
    for (const item of root) collectTweetResults(item, output, seenNodes, seenIds);
    return output;
  }

  for (const value of Object.values(root)) {
    collectTweetResults(value, output, seenNodes, seenIds);
  }

  return output;
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

export function normalizeUserResult(userResult) {
  const result = userResult?.result ?? userResult;
  const legacy = result?.legacy;
  const core = result?.core;
  if (!result?.rest_id || !legacy) return null;

  return {
    id: result.rest_id,
    handle: core?.screen_name ?? legacy?.screen_name,
    name: core?.name ?? legacy?.name,
    description: legacy?.description ?? null,
    verified: Boolean(result?.is_blue_verified ?? legacy?.verified),
    profileImageUrl: result?.avatar?.image_url ?? legacy?.profile_image_url_https ?? legacy?.profile_image_url,
    followersCount: asNumber(legacy?.followers_count),
    followingCount: asNumber(legacy?.friends_count),
    statusesCount: asNumber(legacy?.statuses_count)
  };
}

export function parseTimelineResponse(json, syncedAt = new Date().toISOString()) {
  const instructions = findInstructions(json) ?? [];
  const entries = flattenTimelineEntries(instructions);
  const results = entries.length > 0 ? collectTweetResults(entries) : collectTweetResults(json);
  const records = results
    .map((tweetResult) => convertTweetToRecord(tweetResult, syncedAt))
    .filter(Boolean);

  return {
    records,
    nextCursor: extractBottomCursor(entries),
    errors: json?.errors ?? []
  };
}

export function parseTweetDetailResponse(json, syncedAt = new Date().toISOString()) {
  const results = collectTweetResults(json);
  const records = results
    .map((tweetResult) => convertTweetToRecord(tweetResult, syncedAt))
    .filter(Boolean)
    .sort((a, b) => String(a.postedAt ?? a.syncedAt).localeCompare(String(b.postedAt ?? b.syncedAt)));

  return {
    records,
    errors: json?.errors ?? []
  };
}

export async function fetchGraphqlOperation(session, key, options = {}) {
  const operation = resolveWebGraphqlOperation(key);
  const queryId = requiredQueryId(key, options.queryId);
  const params = new URLSearchParams({
    variables: JSON.stringify(options.variables ?? {}),
    features: JSON.stringify(options.features ?? GRAPHQL_FEATURES)
  });
  if (options.fieldToggles) {
    params.set('fieldToggles', JSON.stringify(options.fieldToggles));
  }

  const response = await fetch(`https://x.com/i/api/graphql/${queryId}/${operation.operation}?${params.toString()}`, {
    method: 'GET',
    headers: buildHeaders(session)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${operation.operation} returned HTTP ${response.status}. ` +
        `Response: ${text.slice(0, 300)}. ` +
        `If X rotated query ids, update ${operation.envVars[0]} or pass --query-id.`
    );
  }

  return {
    operation: operation.operation,
    queryId,
    json: await response.json()
  };
}

export function extractUserResult(json) {
  const matches = collectObjects(
    json,
    (value) => Boolean(value?.rest_id && value?.legacy && (value?.core?.screen_name || value?.legacy?.screen_name))
  );
  return matches[0] ?? null;
}
