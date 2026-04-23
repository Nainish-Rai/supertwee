import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTweetDetailResponse, parseTimelineResponse, normalizeUserResult } from '../src/x-web-client.mjs';
import { requiredQueryId, resolveQueryId } from '../src/config.mjs';

function makeTweetResult({ id, handle, name, text, createdAt, viewCount = '1000' }) {
  return {
    rest_id: id,
    core: {
      user_results: {
        result: {
          rest_id: `u-${handle}`,
          is_blue_verified: true,
          core: { screen_name: handle, name },
          avatar: { image_url: `https://example.com/${handle}.jpg` },
          legacy: {
            screen_name: handle,
            name,
            followers_count: 1000,
            friends_count: 10,
            statuses_count: 200,
            description: `${name} profile`
          }
        }
      }
    },
    views: { count: viewCount },
    legacy: {
      id_str: id,
      conversation_id_str: id,
      created_at: createdAt,
      full_text: text,
      lang: 'en',
      favorite_count: 100,
      retweet_count: 20,
      reply_count: 5,
      quote_count: 2,
      bookmark_count: 1,
      entities: { urls: [] }
    }
  };
}

test('parseTimelineResponse handles search timeline style payloads', () => {
  const json = {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-1',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: makeTweetResult({
                            id: '101',
                            handle: 'alice',
                            name: 'Alice',
                            text: 'search result one',
                            createdAt: 'Mon Apr 21 10:00:00 +0000 2026'
                          })
                        }
                      }
                    }
                  },
                  {
                    entryId: 'cursor-bottom',
                    content: { cursorType: 'Bottom', value: 'cursor-search-1' }
                  }
                ]
              }
            ]
          }
        }
      }
    }
  };

  const parsed = parseTimelineResponse(json, '2026-04-23T00:00:00.000Z');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].authorHandle, 'alice');
  assert.equal(parsed.nextCursor, 'cursor-search-1');
});

test('normalizeUserResult extracts user metadata from lookup response', () => {
  const user = normalizeUserResult({
    rest_id: '42',
    is_blue_verified: true,
    core: { screen_name: 'alice', name: 'Alice' },
    avatar: { image_url: 'https://example.com/alice.jpg' },
    legacy: {
      screen_name: 'alice',
      name: 'Alice',
      description: 'Builder',
      followers_count: 123,
      friends_count: 45,
      statuses_count: 67
    }
  });

  assert.deepEqual(user, {
    id: '42',
    handle: 'alice',
    name: 'Alice',
    description: 'Builder',
    verified: true,
    profileImageUrl: 'https://example.com/alice.jpg',
    followersCount: 123,
    followingCount: 45,
    statusesCount: 67
  });
});

test('parseTimelineResponse handles user tweets style payloads without treating user objects as tweets', () => {
  const json = {
    data: {
      user: {
        result: {
          rest_id: '42',
          core: { screen_name: 'alice', name: 'Alice' },
          legacy: {
            screen_name: 'alice',
            name: 'Alice',
            description: 'Builder',
            followers_count: 123,
            friends_count: 45,
            statuses_count: 67
          },
          timeline_v2: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'tweet-1',
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: makeTweetResult({
                              id: '202',
                              handle: 'alice',
                              name: 'Alice',
                              text: 'user timeline post',
                              createdAt: 'Tue Apr 22 10:00:00 +0000 2026'
                            })
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    }
  };

  const parsed = parseTimelineResponse(json, '2026-04-23T00:00:00.000Z');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].id, '202');
});

test('parseTweetDetailResponse returns chronologically ordered thread records', () => {
  const json = {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [
              {
                entryId: 'tweet-2',
                content: {
                  itemContent: {
                    tweet_results: {
                      result: makeTweetResult({
                        id: '302',
                        handle: 'bob',
                        name: 'Bob',
                        text: 'reply',
                        createdAt: 'Wed Apr 23 10:05:00 +0000 2026'
                      })
                    }
                  }
                }
              },
              {
                entryId: 'tweet-1',
                content: {
                  itemContent: {
                    tweet_results: {
                      result: makeTweetResult({
                        id: '301',
                        handle: 'alice',
                        name: 'Alice',
                        text: 'root',
                        createdAt: 'Wed Apr 23 10:00:00 +0000 2026'
                      })
                    }
                  }
                }
              }
            ]
          }
        ]
      }
    }
  };

  const parsed = parseTweetDetailResponse(json, '2026-04-23T00:00:00.000Z');
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records.map((record) => record.id), ['301', '302']);
});

test('query id helpers resolve defaults and fail fast for missing operation ids', () => {
  const previousSearch = process.env.SUPERTWEE_SEARCH_TIMELINE_QUERY_ID;
  delete process.env.SUPERTWEE_SEARCH_TIMELINE_QUERY_ID;

  assert.equal(resolveQueryId('homeLatest'), 'CRprHpVA12yhsub-KRERIg');
  assert.throws(() => requiredQueryId('searchTimeline'), /SUPERTWEE_SEARCH_TIMELINE_QUERY_ID/);

  process.env.SUPERTWEE_SEARCH_TIMELINE_QUERY_ID = 'search-qid';
  assert.equal(requiredQueryId('searchTimeline'), 'search-qid');

  if (previousSearch == null) {
    delete process.env.SUPERTWEE_SEARCH_TIMELINE_QUERY_ID;
  } else {
    process.env.SUPERTWEE_SEARCH_TIMELINE_QUERY_ID = previousSearch;
  }
});
