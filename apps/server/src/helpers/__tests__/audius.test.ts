import { TRPCError } from '@trpc/server';
import { describe, expect, test } from 'bun:test';
import {
  AudiusError,
  audiusSearch,
  audiusTrackId,
  resolveAudiusPlayableTrack,
  resolveAudiusStreamUrl,
  throwAudiusError
} from '../audius';

const TRACK_ID = 'YmJWK';

const searchPayload = () => ({
  data: [
    {
      id: TRACK_ID,
      title: 'Kirbytape Mix',
      duration: 1690,
      permalink: '/omgkirby/kirbytape',
      is_streamable: true,
      artwork: { '480x480': 'https://art.example.com/480.jpg' },
      user: { name: 'omgkirby', handle: 'omgkirbyDAO' }
    },
    {
      id: 'xxx',
      title: 'Gated track',
      duration: 100,
      is_streamable: false,
      user: { handle: 'someone' }
    },
    { nope: true }
  ]
});

const stubAudius = (overrides?: {
  search?: unknown;
  streamStatus?: number;
  streamLocation?: string | null;
}) => {
  const stub: typeof fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes('/v1/tracks/search')) {
      return new Response(
        JSON.stringify(overrides?.search ?? searchPayload()),
        {
          status: 200
        }
      );
    }

    if (url.includes('/stream')) {
      const headers = new Headers();

      if (overrides?.streamLocation !== null) {
        headers.set(
          'Location',
          overrides?.streamLocation ?? 'https://cdn.example.com/audio.mp3'
        );
      }

      return new Response(null, {
        status: overrides?.streamStatus ?? 302,
        headers
      });
    }

    if (url.includes('cdn.example.com')) {
      return new Response('x', {
        status: 206,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;

  return stub;
};

describe('audiusTrackId', () => {
  test('is a stable negative number', () => {
    const first = audiusTrackId(TRACK_ID);

    expect(first).toBe(audiusTrackId(TRACK_ID));
    expect(first).toBeLessThan(0);
    expect(audiusTrackId('other')).not.toBe(first);
  });
});

describe('audiusSearch', () => {
  test('maps tracks and skips invalid entries', async () => {
    const results = await audiusSearch('kirby', 10, stubAudius());

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      audiusId: TRACK_ID,
      title: 'Kirbytape Mix',
      author: 'omgkirby',
      artworkUrl: 'https://art.example.com/480.jpg',
      durationSec: 1690,
      permalinkUrl: 'https://audius.co/omgkirby/kirbytape',
      streamable: true
    });
    expect(results[0]!.trackId).toBeLessThan(0);
    expect(results[1]).toMatchObject({
      author: 'someone',
      streamable: false
    });
  });

  test('respects the limit', async () => {
    const results = await audiusSearch('kirby', 1, stubAudius());

    expect(results).toHaveLength(1);
  });

  test('fails on upstream errors', async () => {
    const failing: typeof fetch = (() => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    await expect(audiusSearch('kirby', 10, failing)).rejects.toMatchObject({
      kind: 'UPSTREAM'
    });
  });
});

describe('resolveAudiusStreamUrl', () => {
  test('captures the redirect location without following it', async () => {
    const url = await resolveAudiusStreamUrl(TRACK_ID, stubAudius());

    expect(url).toBe('https://cdn.example.com/audio.mp3');
  });

  test('missing track throws NOT_FOUND', async () => {
    await expect(
      resolveAudiusStreamUrl(TRACK_ID, stubAudius({ streamStatus: 404 }))
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  test('redirect without location throws UNAVAILABLE', async () => {
    await expect(
      resolveAudiusStreamUrl(TRACK_ID, stubAudius({ streamLocation: null }))
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  test('invalid id throws NOT_FOUND without fetching', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      throw new Error('must not fetch');
    }) as unknown as typeof fetch;

    await expect(
      resolveAudiusStreamUrl('not an id!!', counting)
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    expect(calls).toBe(0);
  });
});

describe('resolveAudiusPlayableTrack', () => {
  test('mints the url and keeps client metadata', async () => {
    const track = await resolveAudiusPlayableTrack(
      {
        sourceId: TRACK_ID,
        title: 'Kirbytape Mix',
        author: 'omgkirby',
        artworkUrl: 'https://art.example.com/480.jpg',
        durationSec: 1690,
        permalinkUrl: 'https://audius.co/omgkirby/kirbytape'
      },
      stubAudius()
    );

    expect(track).toMatchObject({
      title: 'Kirbytape Mix',
      author: 'omgkirby',
      source: 'audius',
      sourceId: TRACK_ID,
      mp3Url: 'https://cdn.example.com/audio.mp3'
    });
    expect(track.trackId).toBeLessThan(0);
  });
});

describe('throwAudiusError', () => {
  test('maps kinds to trpc codes like soundcloud does', () => {
    for (const [kind, code] of [
      ['NOT_FOUND', 'NOT_FOUND'],
      ['UNAVAILABLE', 'BAD_REQUEST'],
      ['UPSTREAM', 'INTERNAL_SERVER_ERROR']
    ] as const) {
      let thrown: unknown = null;

      try {
        throwAudiusError(new AudiusError(kind, 'x'));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(TRPCError);
      expect((thrown as TRPCError).code).toBe(code);
    }
  });

  test('rethrows unknown errors untouched', () => {
    const original = new Error('boom');

    expect(() => throwAudiusError(original)).toThrow(original);
  });
});
