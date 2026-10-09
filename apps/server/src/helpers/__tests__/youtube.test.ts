import { TRPCError } from '@trpc/server';
import { describe, expect, test } from 'bun:test';
import {
  extractListId,
  extractVideoId,
  getYoutubeStreamUrl,
  invalidateYoutubeStreamUrl,
  looksLikeYoutubePlaylistUrl,
  looksLikeYoutubeUrl,
  resolveYoutubeEntry,
  resolveYoutubePlayableTrack,
  throwYouTubeError,
  YouTubeError,
  youtubeSearch,
  youtubeTrackId
} from '../youtube';

const VIDEO_ID = 'dQw4w9WgXcQ';

const searchPayload = () => ({
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  {
                    videoRenderer: {
                      videoId: VIDEO_ID,
                      title: { runs: [{ text: 'Never Gonna Give You Up' }] },
                      ownerText: { runs: [{ text: 'Rick Astley' }] },
                      lengthText: { simpleText: '3:33' }
                    }
                  },
                  {
                    // android search answers with compactVideoRenderer
                    compactVideoRenderer: {
                      videoId: 'ccccccccccc',
                      title: { simpleText: 'Compact Hit' },
                      shortBylineText: { runs: [{ text: 'Compact Author' }] },
                      lengthText: { runs: [{ text: '4:20' }] }
                    }
                  },
                  {
                    videoRenderer: {
                      videoId: 'aaaaaaaaaaa',
                      title: { runs: [{ text: 'Live now' }] },
                      ownerText: { runs: [{ text: 'Someone' }] },
                      badges: [{ metadataBadgeRenderer: { label: 'LIVE' } }]
                    }
                  },
                  {
                    channelRenderer: {
                      channelId: 'UCxxxx',
                      title: { simpleText: 'Rick Astley' }
                    }
                  },
                  {
                    playlistRenderer: {
                      playlistId: 'PLxxxx',
                      title: { simpleText: 'Mix' }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }
});

const playerPayload = () => ({
  playabilityStatus: { status: 'OK' },
  videoDetails: {
    videoId: VIDEO_ID,
    title: 'Never Gonna Give You Up',
    author: 'Rick Astley',
    lengthSeconds: '213'
  },
  streamingData: {
    adaptiveFormats: [
      {
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 160000,
        url: 'https://rr1---example.googlevideo.com/videoplayback?audio=opus'
      },
      {
        itag: 140,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        bitrate: 128000,
        url: 'https://rr1---example.googlevideo.com/videoplayback?audio=m4a'
      },
      {
        itag: 137,
        mimeType: 'video/mp4; codecs="avc1.640028"',
        bitrate: 4000000,
        url: 'https://rr1---example.googlevideo.com/videoplayback?video=1'
      }
    ]
  }
});

const browsePayload = () => ({
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          playlistVideoListRenderer: {
                            contents: [
                              {
                                playlistVideoRenderer: {
                                  videoId: VIDEO_ID,
                                  title: { runs: [{ text: 'First' }] },
                                  shortBylineText: {
                                    runs: [{ text: 'Author' }]
                                  },
                                  lengthText: { simpleText: '1:00' }
                                }
                              },
                              {
                                playlistVideoRenderer: {
                                  videoId: 'bbbbbbbbbbb'
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  }
});

const stubYoutube = (overrides?: {
  search?: unknown;
  player?: unknown;
  browse?: unknown;
  streamStatus?: number;
}) => {
  const stub: typeof fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes('/youtubei/v1/search')) {
      return new Response(
        JSON.stringify(overrides?.search ?? searchPayload()),
        {
          status: 200
        }
      );
    }

    if (url.includes('/youtubei/v1/player')) {
      return new Response(
        JSON.stringify(overrides?.player ?? playerPayload()),
        {
          status: 200
        }
      );
    }

    if (url.includes('/youtubei/v1/browse')) {
      return new Response(
        JSON.stringify(overrides?.browse ?? browsePayload()),
        {
          status: 200
        }
      );
    }

    if (url.includes('googlevideo.com')) {
      return new Response('x', {
        status: overrides?.streamStatus ?? 206,
        headers: { 'Content-Type': 'audio/mp4' }
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;

  return stub;
};

describe('youtube url helpers', () => {
  test('extractVideoId handles watch, shorts and youtu.be links', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxx')
    ).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractVideoId('never gonna give you up')).toBeNull();
  });

  test('extractListId and playlist detection', () => {
    expect(extractListId('https://www.youtube.com/playlist?list=PLxxxx')).toBe(
      'PLxxxx'
    );
    expect(
      extractListId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx')
    ).toBe('PLxxxx');
    expect(extractListId('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(
      looksLikeYoutubePlaylistUrl('https://www.youtube.com/playlist?list=PLx')
    ).toBe(true);
    expect(looksLikeYoutubePlaylistUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      false
    );
    expect(looksLikeYoutubeUrl('lofi hip hop')).toBe(false);
    expect(looksLikeYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  test('youtubeTrackId is a stable negative number', () => {
    const first = youtubeTrackId(VIDEO_ID);
    const second = youtubeTrackId(VIDEO_ID);

    expect(first).toBe(second);
    expect(first).toBeLessThan(0);
    expect(youtubeTrackId('aaaaaaaaaaa')).not.toBe(first);
  });
});

describe('youtubeSearch', () => {
  test('maps videos, skips live streams, channels and playlists', async () => {
    const results = await youtubeSearch('rick astley', 10, stubYoutube());

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      artworkUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      durationSec: 213,
      permalinkUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      streamable: true
    });
    expect(results[0]!.trackId).toBeLessThan(0);
    expect(results[1]).toMatchObject({
      title: 'Compact Hit',
      author: 'Compact Author',
      durationSec: 260
    });
  });

  test('respects the limit', async () => {
    const results = await youtubeSearch('rick astley', 0, stubYoutube());

    expect(results).toHaveLength(0);
  });
});

describe('resolveYoutubeEntry', () => {
  test('single video link resolves into one entry', async () => {
    const tracks = await resolveYoutubeEntry(
      'https://youtu.be/dQw4w9WgXcQ',
      stubYoutube()
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley'
    });
  });

  test('playlist link resolves into entries, unplayable skipped', async () => {
    const tracks = await resolveYoutubeEntry(
      'https://www.youtube.com/playlist?list=PLxxxx',
      stubYoutube()
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ title: 'First', author: 'Author' });
  });

  test('unknown playlist throws NOT_FOUND', async () => {
    const empty = {
      contents: { twoColumnBrowseResultsRenderer: { tabs: [] } }
    };

    await expect(
      resolveYoutubeEntry(
        'https://www.youtube.com/playlist?list=PLxxxx',
        stubYoutube({ browse: empty })
      )
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  test('auto-generated mix throws UNAVAILABLE with a clear message', async () => {
    await expect(
      resolveYoutubeEntry(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDCLeZyIID9Bo',
        stubYoutube()
      )
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  test('non-youtube link throws NOT_FOUND', async () => {
    await expect(
      resolveYoutubeEntry('https://soundcloud.com/a/b', stubYoutube())
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});

describe('resolveYoutubePlayableTrack', () => {
  test('prefers m4a over opus and stores a proxy marker', async () => {
    const track = await resolveYoutubePlayableTrack(
      { sourceId: VIDEO_ID },
      stubYoutube()
    );

    // browsers on other networks get a 403 on the signed url, so the state
    // keeps a proxy marker and every listener streams through /music-audio
    expect(track.mp3Url).toBe(`/music-audio?videoId=${VIDEO_ID}`);
    expect(track).toMatchObject({
      title: 'Never Gonna Give You Up',
      source: 'youtube',
      sourceId: VIDEO_ID
    });
  });

  test('age-restricted video throws UNAVAILABLE', async () => {
    const player = {
      playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' },
      videoDetails: { videoId: VIDEO_ID }
    };

    await expect(
      resolveYoutubePlayableTrack(
        { sourceId: VIDEO_ID },
        stubYoutube({ player })
      )
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  test('dead stream url throws UNAVAILABLE', async () => {
    await expect(
      resolveYoutubePlayableTrack(
        { sourceId: VIDEO_ID },
        stubYoutube({ streamStatus: 403 })
      )
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  test('invalid video id throws NOT_FOUND', async () => {
    await expect(
      resolveYoutubePlayableTrack({ sourceId: 'nope' }, stubYoutube())
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});

describe('stream url cache', () => {
  const CACHE_VIDEO_ID = 'ddddddddddd';

  const stubCounting = (counter: { playerCalls: number }) => {
    const stub: typeof fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = String(input);

      if (url.includes('/youtubei/v1/player')) {
        counter.playerCalls += 1;

        const body = JSON.parse(String(init?.body)) as { videoId: string };

        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            videoDetails: {
              videoId: body.videoId,
              title: 'Cached',
              author: 'Author',
              lengthSeconds: '100'
            },
            streamingData: {
              adaptiveFormats: [
                {
                  mimeType: 'audio/mp4',
                  bitrate: 128000,
                  url: `https://rr1---example.googlevideo.com/v?x=${body.videoId}&expire=${Math.floor(Date.now() / 1000) + 21600}`
                }
              ]
            }
          }),
          { status: 200 }
        );
      }

      if (url.includes('googlevideo.com')) {
        return new Response('x', {
          status: 206,
          headers: { 'Content-Type': 'audio/mp4' }
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    return stub;
  };

  test('second resolve within ttl does not hit the player again', async () => {
    const counter = { playerCalls: 0 };
    const stub = stubCounting(counter);

    const first = await getYoutubeStreamUrl(CACHE_VIDEO_ID, stub);
    const second = await getYoutubeStreamUrl(CACHE_VIDEO_ID, stub);

    expect(first).toBe(second);
    expect(counter.playerCalls).toBe(1);

    invalidateYoutubeStreamUrl(CACHE_VIDEO_ID);

    await getYoutubeStreamUrl(CACHE_VIDEO_ID, stub);

    expect(counter.playerCalls).toBe(2);
  });
});

describe('throwYouTubeError', () => {
  test('maps kinds to trpc codes like soundcloud does', () => {
    expect(() =>
      throwYouTubeError(new YouTubeError('NOT_FOUND', 'missing'))
    ).toThrow(TRPCError);

    try {
      throwYouTubeError(new YouTubeError('NOT_FOUND', 'missing'));
    } catch (error) {
      expect((error as TRPCError).code).toBe('NOT_FOUND');
    }

    try {
      throwYouTubeError(new YouTubeError('UNAVAILABLE', 'private'));
    } catch (error) {
      expect((error as TRPCError).code).toBe('BAD_REQUEST');
    }

    try {
      throwYouTubeError(new YouTubeError('UPSTREAM', 'down'));
    } catch (error) {
      expect((error as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    }
  });

  test('rethrows unknown errors untouched', () => {
    const original = new Error('boom');

    expect(() => throwYouTubeError(original)).toThrow(original);
  });
});
