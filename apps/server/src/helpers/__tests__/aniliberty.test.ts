import { describe, expect, test } from 'bun:test';
import {
  AnilibertyError,
  anilibertyDescribe,
  anilibertySearch,
  verifyAnilibertyManifest
} from '../aniliberty';

const searchPayload = {
  data: [
    {
      id: 413,
      name: { main: 'Наруто Ураганные хроники', english: 'Naruto Shippuuden' },
      year: 2007,
      poster: {
        src: '/storage/releases/posters/413/a.webp',
        optimized: { src: '/storage/releases/posters/413/b.webp' }
      },
      episodes_total: 500
    },
    { id: 999, name: null, year: null }
  ]
};

// the detail endpoint returns the release bare, without a data envelope
const releasePayload = {
  id: 413,
  name: { main: 'Наруто Ураганные хроники', english: 'Naruto Shippuuden' },
  poster: { optimized: { src: '/storage/releases/posters/413/b.webp' } },
  episodes_total: 500,
  is_blocked_by_geo: false,
  episodes: [
    {
      ordinal: 1,
      name: 'Возвращение домой',
      duration: 1400,
      hls_480: 'https://cdn.example.com/1/480.m3u8',
      hls_720: 'https://cdn.example.com/1/720.m3u8',
      hls_1080: null
    },
    {
      ordinal: 2,
      name: null,
      duration: 1400,
      hls_480: null,
      hls_720: null,
      hls_1080: null
    }
  ]
};

const stubFetch = (async (input: string | URL | Request) => {
  const url = String(input);

  if (url.includes('/anime/catalog/releases')) {
    return new Response(JSON.stringify(searchPayload), { status: 200 });
  }

  if (url.includes('/anime/releases/413')) {
    return new Response(JSON.stringify(releasePayload), { status: 200 });
  }

  if (url.includes('cdn.example.com')) {
    if (url.includes('missing')) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
    });
  }

  return new Response('Not Found', { status: 404 });
}) as unknown as typeof fetch;

describe('anilibertySearch', () => {
  test('should parse catalog results', async () => {
    const results = await anilibertySearch('Наруто', 10, stubFetch);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      releaseId: 413,
      title: 'Наруто Ураганные хроники',
      titleOrig: 'Naruto Shippuuden',
      year: 2007,
      poster: 'https://aniliberty.top/storage/releases/posters/413/b.webp',
      episodesTotal: 500
    });
  });

  test('should surface upstream failures', async () => {
    const failing = (async () => {
      return new Response('err', { status: 500 });
    }) as unknown as typeof fetch;

    const error = await anilibertySearch('x', 10, failing).catch((err) => err);

    expect(error).toBeInstanceOf(AnilibertyError);
  });
});

describe('anilibertyDescribe', () => {
  test('should parse release episodes', async () => {
    const described = await anilibertyDescribe(413, stubFetch);

    expect(described.title).toBe('Наруто Ураганные хроники');
    expect(described.blocked).toBe(false);
    expect(described.episodes).toHaveLength(2);
    expect(described.episodes[0]).toMatchObject({
      ordinal: 1,
      name: 'Возвращение домой',
      duration: 1400,
      hls720: 'https://cdn.example.com/1/720.m3u8'
    });
  });

  test('should map 404 to not found', async () => {
    const error = await anilibertyDescribe(123456, stubFetch).catch(
      (err) => err
    );

    expect(error).toBeInstanceOf(AnilibertyError);
    expect((error as AnilibertyError).kind).toBe('NOT_FOUND');
  });
});

describe('verifyAnilibertyManifest', () => {
  test('should accept a valid playlist', async () => {
    await verifyAnilibertyManifest(
      'https://cdn.example.com/1/720.m3u8',
      stubFetch
    );
  });

  test('should reject a dead episode', async () => {
    const error = await verifyAnilibertyManifest(
      'https://cdn.example.com/missing.m3u8',
      stubFetch
    ).catch((err) => err);

    expect(error).toBeInstanceOf(AnilibertyError);
    expect((error as AnilibertyError).kind).toBe('UNAVAILABLE');
  });
});
