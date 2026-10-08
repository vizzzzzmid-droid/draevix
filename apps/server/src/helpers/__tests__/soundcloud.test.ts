import { beforeEach, describe, expect, test } from 'bun:test';
import {
  clearSoundCloudClientIdCache,
  discoverClientId,
  extractClientId,
  looksLikePlaylistUrl,
  resolvePlaylistTracks,
  resolveStreamUrl,
  SoundCloudError,
  soundcloudSearch,
  toTrack,
  upgradeArtwork,
  verifyStreamUrl
} from '../soundcloud';

const CLIENT_ID = 'a'.repeat(32);

const trackJson = {
  id: 417474360,
  title: 'Chill Study Beats',
  permalink_url: 'https://soundcloud.com/artist/chill-study-beats',
  duration: 7200255,
  streamable: true,
  policy: 'ALLOW',
  artwork_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg',
  user: { username: 'TestArtist' },
  media: {
    transcodings: [
      {
        url: 'https://api-v2.soundcloud.com/media/hls',
        preset: 'aac_160k',
        format: { protocol: 'hls', mime_type: 'audio/mp4' }
      },
      {
        url: 'https://api-v2.soundcloud.com/media/progressive',
        preset: 'mp3_0_0',
        format: { protocol: 'progressive', mime_type: 'audio/mpeg' }
      }
    ]
  }
};

describe('extractClientId', () => {
  test('should pull the id out of bundle code', () => {
    expect(extractClientId(`var x={client_id:"${CLIENT_ID}"};`)).toBe(
      CLIENT_ID
    );
    expect(extractClientId('nothing here')).toBeNull();
  });
});

describe('upgradeArtwork', () => {
  test('should swap to the big square variant', () => {
    expect(upgradeArtwork('https://i1.sndcdn.com/a-large.jpg')).toBe(
      'https://i1.sndcdn.com/a-t500x500.jpg'
    );
    expect(upgradeArtwork(null)).toBeNull();
  });
});

describe('looksLikePlaylistUrl', () => {
  test('should match set links', () => {
    expect(looksLikePlaylistUrl('https://soundcloud.com/artist/sets/mix')).toBe(
      true
    );
    expect(looksLikePlaylistUrl('https://soundcloud.com/artist/track')).toBe(
      false
    );
  });
});

describe('toTrack', () => {
  test('should parse a track', () => {
    expect(toTrack(trackJson)).toMatchObject({
      trackId: 417474360,
      title: 'Chill Study Beats',
      author: 'TestArtist',
      durationSec: 7200,
      artworkUrl: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
      streamable: true
    });
  });

  test('should flag blocked tracks', () => {
    expect(
      toTrack({ ...trackJson, policy: 'BLOCK', streamable: false })?.streamable
    ).toBe(false);
  });

  test('should trust playlist entries without a streamable flag', () => {
    const { streamable, ...abbreviated } = trackJson;

    expect(toTrack({ ...abbreviated, policy: 'MONETIZE' })?.streamable).toBe(
      true
    );
  });

  test('should drop malformed entries', () => {
    expect(toTrack({ nope: true })).toBeNull();
  });
});

describe('discoverClientId', () => {
  beforeEach(() => {
    clearSoundCloudClientIdCache();
  });

  test('should scrape the id from web bundles', async () => {
    const stubFetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://soundcloud.com') {
        return new Response(
          '<html><script src="/assets/app-1.js"></script></html>',
          { status: 200 }
        );
      }

      return new Response(`var x={client_id:"${CLIENT_ID}"};`, {
        status: 200
      });
    }) as unknown as typeof fetch;

    await expect(discoverClientId(stubFetch)).resolves.toBe(CLIENT_ID);
    // second call serves the cache without fetching
    await expect(
      discoverClientId((async () => {
        throw new Error('must not fetch');
      }) as unknown as typeof fetch)
    ).resolves.toBe(CLIENT_ID);
  });
});

describe('soundcloudSearch', () => {
  beforeEach(() => {
    clearSoundCloudClientIdCache();
  });

  const stubFetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url === 'https://soundcloud.com') {
      return new Response(
        '<html><script src="/assets/app-1.js"></script></html>',
        { status: 200 }
      );
    }

    if (url.endsWith('.js')) {
      return new Response(`var x={client_id:"${CLIENT_ID}"};`, {
        status: 200
      });
    }

    return new Response(JSON.stringify({ collection: [trackJson] }), {
      status: 200
    });
  }) as unknown as typeof fetch;

  test('should return parsed tracks', async () => {
    const results = await soundcloudSearch('lofi', 10, stubFetch);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      trackId: 417474360,
      title: 'Chill Study Beats'
    });
  });
});

describe('resolveStreamUrl', () => {
  test('should prefer progressive over hls', async () => {
    const seen: string[] = [];
    const stubFetch = (async (input: string | URL | Request) => {
      seen.push(String(input));

      return new Response(JSON.stringify({ url: 'https://cf-media/x.mp3' }), {
        status: 200
      });
    }) as unknown as typeof fetch;

    const url = await resolveStreamUrl(
      {
        trackId: 1,
        transcodings: [
          { url: 'https://api/hls', protocol: 'hls' },
          { url: 'https://api/progressive', protocol: 'progressive' }
        ]
      },
      stubFetch
    );

    expect(url).toBe('https://cf-media/x.mp3');
    expect(seen[0]).toContain('https://api/progressive');
  });

  test('should resolve a permalink to transcodings first', async () => {
    const stubFetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/resolve?')) {
        return new Response(
          JSON.stringify({
            media: {
              transcodings: [
                { url: 'https://api/hls', format: { protocol: 'hls' } }
              ]
            }
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ url: 'https://cdn/x.m3u8' }), {
        status: 200
      });
    }) as unknown as typeof fetch;

    const url = await resolveStreamUrl(
      { trackId: 1, permalinkUrl: 'https://soundcloud.com/a/b' },
      stubFetch
    );

    expect(url).toBe('https://cdn/x.m3u8');
  });

  test('should throw when nothing is playable', async () => {
    const stubFetch = (async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const error = await resolveStreamUrl(
      { trackId: 1, transcodings: [] },
      stubFetch
    ).catch((err) => err);

    expect(error).toBeInstanceOf(SoundCloudError);
  });
});

describe('resolvePlaylistTracks', () => {
  test('should parse playlist tracks', async () => {
    const stubFetch = (async () => {
      return new Response(
        JSON.stringify({ kind: 'playlist', tracks: [trackJson] }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const tracks = await resolvePlaylistTracks(
      'https://soundcloud.com/a/sets/mix',
      stubFetch
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ trackId: 417474360 });
  });

  test('should reject non-playlists', async () => {
    const stubFetch = (async () => {
      return new Response(JSON.stringify({ kind: 'track' }), { status: 200 });
    }) as unknown as typeof fetch;

    const error = await resolvePlaylistTracks(
      'https://soundcloud.com/a/b',
      stubFetch
    ).catch((err) => err);

    expect(error).toBeInstanceOf(SoundCloudError);
    expect((error as SoundCloudError).kind).toBe('NOT_FOUND');
  });

  test('should retry a truncated resolve', async () => {
    const full = [trackJson, { ...trackJson, id: 2 }, { ...trackJson, id: 3 }];
    let calls = 0;
    const stubFetch = (async () => {
      calls += 1;

      return new Response(
        JSON.stringify({
          kind: 'playlist',
          id: 99,
          track_count: 3,
          tracks: calls === 1 ? full.slice(0, 1) : full
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const tracks = await resolvePlaylistTracks(
      'https://soundcloud.com/a/sets/mix',
      stubFetch
    );

    expect(tracks).toHaveLength(3);
    expect(calls).toBe(2);
  });

  test('should top up from the playlist endpoint', async () => {
    const stubFetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/playlists/99')) {
        return new Response(
          JSON.stringify({
            tracks: [{ ...trackJson, id: 3 }]
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          kind: 'playlist',
          id: 99,
          track_count: 3,
          tracks: [trackJson, { ...trackJson, id: 2 }]
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const tracks = await resolvePlaylistTracks(
      'https://soundcloud.com/a/sets/mix',
      stubFetch
    );

    expect(tracks.map((entry) => entry.trackId)).toEqual([417474360, 2, 3]);
  });
});

describe('verifyStreamUrl', () => {
  test('should accept a playable file', async () => {
    const stubFetch = (async () => {
      return new Response('x', {
        status: 206,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    }) as unknown as typeof fetch;

    await verifyStreamUrl('https://cdn.example.com/x.mp3', stubFetch);
  });

  test('should reject dead links', async () => {
    const stubFetch = (async () => {
      return new Response('nope', { status: 403 });
    }) as unknown as typeof fetch;

    const error = await verifyStreamUrl(
      'https://cdn.example.com/x.mp3',
      stubFetch
    ).catch((err) => err);

    expect(error).toBeInstanceOf(SoundCloudError);
    expect((error as SoundCloudError).kind).toBe('UNAVAILABLE');
  });
});
