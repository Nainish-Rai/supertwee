const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'being', 'between', 'could', 'their', 'there',
  'these', 'those', 'would', 'should', 'while', 'where', 'which', 'when', 'what', 'with', 'into', 'from',
  'your', 'have', 'just', 'than', 'them', 'they', 'then', 'this', 'that', 'were', 'will', 'https', 'http',
  'tweet', 'thread', 'today', 'yesterday', 'tomorrow', 'really', 'very', 'much', 'more', 'some', 'such',
  'each', 'only', 'make', 'made', 'does', 'doing', 'done', 'over', 'under', 'here', 'like', 'look', 'looks',
  'using', 'used', 'user', 'users', 'into', 'onto', 'across', 'need', 'needs', 'want', 'wants', 'good', 'great',
  'is', 'are', 'was', 'be', 'been', 'the', 'and', 'for', 'you', 'our', 'out', 'can', 'all', 'not', 'now',
  'new', 'how', 'why', 'who', 'its', 'it', 'get', 'got', 'too', 'via', 'per', 'off', 'one', 'two', 'three',
  'has', 'had', 'may', 'might', 'must', 'own', 'same', 'theirs', 'themselves', 'his', 'her', 'hers', 'him',
  'she', 'he', 'we', 'us', 'rt', 're', 'amp', 'co', 'com', 'www', 'in', 'of', 'to', 'at', 'on', 'or', 'as',
  'by', 'an', 'if', 'most', 'every', 'everyone', 'real'
]);

const SHORT_TOKEN_ALLOWLIST = new Set(['ai', 'ml', 'vr', 'ar', 'ui', 'ux']);
const PHRASE_STOPWORDS = new Set(['most', 'every', 'many', 'more', 'some', 'any', 'much', 'very']);
const DOMAIN_BLACKLIST = new Set(['t.co', 'x.com', 'twitter.com', 'amzn.to']);

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function normalizeText(text) {
  return (text || '')
    .replace(/^RT\s+@\w+:\s*/i, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

function isRetweet(record) {
  return /^RT\s+@\w+:/i.test(record?.text || '');
}

function tokenizeText(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[@#]\w+/g, ' ')
    .replace(/[^a-z0-9$\-_\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length <= 32)
    .filter((token) => token.length >= 3 || SHORT_TOKEN_ALLOWLIST.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !STOPWORDS.has(token));
}

function hashtags(text) {
  return Array.from(normalizeText(text).matchAll(/#([a-z0-9_]+)/gi), (match) => `#${match[1].toLowerCase()}`);
}

function cashtags(text) {
  return Array.from(normalizeText(text).matchAll(/\$([a-z]{1,8})/gi), (match) => `$${match[1].toUpperCase()}`);
}

function domains(record) {
  return (record.links || [])
    .map((link) => {
      try {
        return new URL(link).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((domain) => domain && !DOMAIN_BLACKLIST.has(domain))
    .filter(Boolean);
}

function extractPhrases(text) {
  const tokens = tokenizeText(text).filter((token) => !PHRASE_STOPWORDS.has(token));
  const phrases = new Set();

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    phrases.add(pair);
    if (i < tokens.length - 2) {
      const triple = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      phrases.add(triple);
    }
  }

  return Array.from(phrases)
    .filter((phrase) => phrase.length <= 48)
    .filter((phrase) => {
      const parts = phrase.split(' ');
      return parts.some((part) => part.length >= 4 || SHORT_TOKEN_ALLOWLIST.has(part));
    });
}

function topicCandidates(record) {
  const tags = hashtags(record.text).map((topic) => ({ topic, kind: 'hashtag' }));
  const cash = cashtags(record.text).map((topic) => ({ topic, kind: 'cashtag' }));
  const siteDomains = domains(record).map((topic) => ({ topic, kind: 'domain' }));
  const phrases = extractPhrases(record.text).map((topic) => ({ topic, kind: 'phrase' }));
  const tokens = tokenizeText(record.text).slice(0, 8).map((topic) => ({ topic, kind: 'token' }));

  return [...tags, ...cash, ...siteDomains, ...phrases, ...tokens];
}

function topicKindWeight(kind) {
  switch (kind) {
    case 'hashtag':
      return 1.35;
    case 'cashtag':
      return 1.4;
    case 'domain':
      return 1.2;
    case 'phrase':
      return 1.45;
    default:
      return 0.9;
  }
}

export function computeBangerScore(record) {
  const likes = safeNumber(record?.engagement?.likeCount);
  const reposts = safeNumber(record?.engagement?.repostCount);
  const replies = safeNumber(record?.engagement?.replyCount);
  const quotes = safeNumber(record?.engagement?.quoteCount);
  const bookmarks = safeNumber(record?.engagement?.bookmarkCount);
  const views = safeNumber(record?.engagement?.viewCount);
  const followers = Math.max(1, safeNumber(record?.author?.followersCount));

  const raw = Math.sqrt(views) + likes + reposts * 4 + replies * 3 + quotes * 5 + bookmarks * 2;
  const normalized = raw / Math.max(1, Math.log10(followers + 10));
  const mediaBoost = (record.mediaObjects?.length ?? 0) > 0 ? 1.05 : 1;

  return {
    raw,
    normalized: normalized * mediaBoost
  };
}

export function rankBangers(records, limit = 10) {
  const originals = records.filter((record) => !isRetweet(record));
  const rankedPool = originals.length >= Math.min(limit, 3) ? originals : records;

  return [...rankedPool]
    .map((record) => ({ record, score: computeBangerScore(record) }))
    .sort((a, b) => b.score.normalized - a.score.normalized || b.score.raw - a.score.raw)
    .slice(0, limit);
}

export function extractTopics(records, limit = 12) {
  const topics = new Map();

  for (const record of records) {
    const banger = computeBangerScore(record);
    const weight = Math.max(1, Math.sqrt(banger.normalized));
    const seenForTweet = new Map();

    for (const candidate of topicCandidates(record)) {
      const currentKind = seenForTweet.get(candidate.topic);
      if (!currentKind || topicKindWeight(candidate.kind) > topicKindWeight(currentKind)) {
        seenForTweet.set(candidate.topic, candidate.kind);
      }
    }

    for (const [topic, kind] of seenForTweet.entries()) {
      const current = topics.get(topic) ?? {
        topic,
        kind,
        mentions: 0,
        weightedScore: 0,
        authors: new Set(),
        sampleTweetIds: []
      };
      current.mentions += 1;
      current.kind = kind;
      current.weightedScore += weight * topicKindWeight(kind);
      if (record.authorHandle) current.authors.add(record.authorHandle);
      if (current.sampleTweetIds.length < 3) current.sampleTweetIds.push(record.id);
      topics.set(topic, current);
    }
  }

  return Array.from(topics.values())
    .map((topic) => ({
      topic: topic.topic,
      kind: topic.kind,
      mentions: topic.mentions,
      uniqueAuthors: topic.authors.size,
      score:
        topic.weightedScore +
        topic.mentions * (topic.kind === 'phrase' ? 2.6 : 2) +
        topic.authors.size * (topic.kind === 'phrase' ? 3.5 : 3),
      sampleTweetIds: topic.sampleTweetIds
    }))
    .filter((topic) => {
      if (topic.kind === 'phrase') return topic.mentions >= 2 && topic.uniqueAuthors >= 2;
      if (topic.kind === 'token') return topic.mentions >= 3 && topic.uniqueAuthors >= 2;
      if (topic.kind === 'domain') return topic.mentions >= 2 && topic.uniqueAuthors >= 2;
      return topic.mentions >= 2;
    })
    .sort((a, b) => b.score - a.score || b.uniqueAuthors - a.uniqueAuthors || b.mentions - a.mentions)
    .slice(0, limit);
}

export function formatTrendReport(records, options = {}) {
  const topics = extractTopics(records, options.topicLimit ?? 12);
  const bangers = rankBangers(records, options.tweetLimit ?? 10);

  const lines = [];
  lines.push(`Topics (${topics.length})`);
  for (const topic of topics) {
    lines.push(`- ${topic.topic}  score=${topic.score.toFixed(1)}  mentions=${topic.mentions}  authors=${topic.uniqueAuthors}`);
  }

  lines.push('');
  lines.push(`Bangers (${bangers.length})`);
  for (const item of bangers) {
    const handle = item.record.authorHandle ? `@${item.record.authorHandle}` : '@unknown';
    const text = (item.record.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    lines.push(`- ${handle}  score=${item.score.normalized.toFixed(1)}  ${item.record.url}`);
    lines.push(`  ${text}`);
  }

  return { topics, bangers, text: lines.join('\n') };
}
