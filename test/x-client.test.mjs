import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHomeLatestTimelineResponse, mergeFeedRecords } from '../src/x-client.mjs';
import { computeBangerScore, extractTopics, rankBangers } from '../src/analyze.mjs';
import { parseFlags } from '../src/cli.mjs';

const sampleTimeline = {
  data: {
    home: {
      home_timeline_urt: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [
              {
                entryId: 'tweet-1',
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        rest_id: '111',
                        core: {
                          user_results: {
                            result: {
                              rest_id: 'u1',
                              is_blue_verified: true,
                              core: { screen_name: 'alice', name: 'Alice' },
                              avatar: { image_url: 'https://example.com/a.jpg' },
                              legacy: {
                                screen_name: 'alice',
                                name: 'Alice',
                                followers_count: 1000,
                                friends_count: 10,
                                statuses_count: 200,
                                description: 'AI builder'
                              }
                            }
                          }
                        },
                        views: { count: '10000' },
                        legacy: {
                          id_str: '111',
                          created_at: 'Mon Apr 14 10:00:00 +0000 2026',
                          full_text: 'AI agents are shipping fast #ai $NVDA https://t.co/abc',
                          lang: 'en',
                          favorite_count: 300,
                          retweet_count: 40,
                          reply_count: 20,
                          quote_count: 5,
                          bookmark_count: 25,
                          entities: {
                            urls: [
                              {
                                url: 'https://t.co/abc',
                                expanded_url: 'https://openai.com/index/gpt-5',
                                display_url: 'openai.com/index/gpt-5'
                              }
                            ]
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                entryId: 'cursor-bottom',
                content: { cursorType: 'Bottom', value: 'cursor-123' }
              }
            ]
          }
        ]
      }
    }
  }
};

test('parseHomeLatestTimelineResponse extracts tweet records and next cursor', () => {
  const parsed = parseHomeLatestTimelineResponse(sampleTimeline, '2026-04-20T00:00:00.000Z');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.nextCursor, 'cursor-123');
  assert.equal(parsed.records[0].authorHandle, 'alice');
  assert.equal(parsed.records[0].engagement.viewCount, 10000);
  assert.equal(parsed.records[0].links[0], 'https://openai.com/index/gpt-5');
});

test('mergeFeedRecords keeps richer incoming records', () => {
  const existing = [{ id: '111', text: 'short', syncedAt: '2026-04-20T00:00:00.000Z' }];
  const incoming = parseHomeLatestTimelineResponse(sampleTimeline, '2026-04-20T00:00:00.000Z').records;
  const merged = mergeFeedRecords(existing, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].authorHandle, 'alice');
  assert.equal(merged[0].engagement.likeCount, 300);
});

test('analysis ranks topics and bangers', () => {
  const parsed = parseHomeLatestTimelineResponse(sampleTimeline, '2026-04-20T00:00:00.000Z').records;
  const extra = {
    ...parsed[0],
    id: '222',
    tweetId: '222',
    url: 'https://x.com/bob/status/222',
    authorHandle: 'bob',
    author: { ...parsed[0].author, handle: 'bob', followersCount: 5000 },
    text: 'AI infra is the thing now #ai https://example.com',
    links: ['https://example.com']
  };
  const phraseRepeat = {
    ...parsed[0],
    id: '333',
    tweetId: '333',
    url: 'https://x.com/carol/status/333',
    authorHandle: 'carol',
    author: { ...parsed[0].author, handle: 'carol', followersCount: 2000 },
    text: 'Open source AI infra for builders #ai https://docs.example.com',
    links: ['https://docs.example.com']
  };
  const records = [parsed[0], extra, phraseRepeat];
  const bangers = rankBangers(records, 2);
  const topics = extractTopics(records, 5);
  const score = computeBangerScore(records[0]);

  assert.equal(bangers.length, 2);
  assert.ok(score.normalized > 0);
  assert.ok(topics.some((topic) => topic.topic === '#ai'));
  assert.ok(topics.some((topic) => topic.topic === 'ai infra'));
  assert.ok(topics.every((topic) => topic.mentions >= 2));
});

test('rankBangers prefers original tweets over retweets when enough originals exist', () => {
  const original = {
    id: '1',
    url: 'https://x.com/alice/status/1',
    text: 'AI infra is shipping',
    authorHandle: 'alice',
    author: { followersCount: 1000 },
    engagement: { likeCount: 200, repostCount: 30, replyCount: 15, quoteCount: 3, bookmarkCount: 10, viewCount: 8000 },
    mediaObjects: []
  };
  const retweet = {
    id: '2',
    url: 'https://x.com/bob/status/2',
    text: 'RT @someone: Viral thing',
    authorHandle: 'bob',
    author: { followersCount: 1000 },
    engagement: { likeCount: 5000, repostCount: 900, replyCount: 100, quoteCount: 20, bookmarkCount: 100, viewCount: 100000 },
    mediaObjects: []
  };
  const secondOriginal = {
    ...original,
    id: '3',
    url: 'https://x.com/carol/status/3',
    text: 'Open source AI infra'
  };

  const ranked = rankBangers([original, retweet, secondOriginal], 2);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((item) => !item.record.text.startsWith('RT @')));
});

test('parseFlags supports variadic cookies override', () => {
  const flags = parseFlags(['--pages', '2', '--cookies', 'ct0-token', 'auth-token', '--browser', 'chrome']);
  assert.equal(flags.pages, '2');
  assert.deepEqual(flags.cookies, ['ct0-token', 'auth-token']);
  assert.equal(flags.browser, 'chrome');
});
