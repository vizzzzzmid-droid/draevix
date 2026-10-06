import { beforeEach, describe, expect, test } from 'bun:test';
import {
  clearRutubeCache,
  getMasterPlaylist,
  getRutubeMeta,
  getVariantPlaylist,
  isAccessDenied,
  normalizeDurationSec,
  parseRutubeVideoId,
  resolveSegmentUrl,
  rewriteMasterPlaylist,
  rewriteVariantPlaylist,
  RutubeError
} from '../rutube';

const VIDEO_ID = 'f97171b78dfe6a3bbaa3d1e808cdeb03';

const MASTER_TEXT = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
hls/360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
https://cdn.example.com/hls/720.m3u8
`;

const VARIANT_TEXT = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="keys/k1.key",IV=0x1234
#EXTINF:6.0,
seg-0.ts
#EXTINF:6.0,
https://cdn.example.com/hls/seg-1.ts
#EXT-X-ENDLIST
`;

const optionsPayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Test movie',
  author: { name: 'Test author' },
  duration: 5879000,
  thumbnail_url: 'https://cdn.example.com/thumb.jpg',
  video_balancer: {
    m3u8: 'https://bl.example.com/video_balancer.m3u8?token=abc'
  },
  ...overrides
});

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('parseRutubeVideoId', () => {
  test('should accept a bare hash in any case', () => {
    expect(parseRutubeVideoId(VIDEO_ID)).toBe(VIDEO_ID);
    expect(parseRutubeVideoId(VIDEO_ID.toUpperCase())).toBe(VIDEO_ID);
  });

  test('should extract the id from watch and embed urls', () => {
    expect(parseRutubeVideoId(`https://rutube.ru/video/${VIDEO_ID}/`)).toBe(
      VIDEO_ID
    );
    expect(
      parseRutubeVideoId(`https://rutube.ru/video/${VIDEO_ID}/?t=12&r=abcd`)
    ).toBe(VIDEO_ID);
    expect(parseRutubeVideoId(`https://rutube.ru/play/embed/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
  });

  test('should reject garbage', () => {
    expect(parseRutubeVideoId('')).toBeNull();
    expect(parseRutubeVideoId('not a link')).toBeNull();
    expect(parseRutubeVideoId('f97171b78dfe6a3b')).toBeNull();
    expect(
      parseRutubeVideoId(`https://example.com/video/${VIDEO_ID}/`)
    ).toBeNull();
    expect(parseRutubeVideoId(`https://rutube.ru/video/shorts/`)).toBeNull();
  });
});

describe('normalizeDurationSec', () => {
  test('should convert milliseconds to seconds', () => {
    expect(normalizeDurationSec(5879000)).toBe(5879);
  });

  test('should keep plain seconds', () => {
    expect(normalizeDurationSec(3600)).toBe(3600);
  });

  test('should fall back to zero', () => {
    expect(normalizeDurationSec(undefined)).toBe(0);
    expect(normalizeDurationSec(0)).toBe(0);
    expect(normalizeDurationSec(-5)).toBe(0);
  });
});

describe('isAccessDenied', () => {
  test('should only block explicit denials', () => {
    expect(isAccessDenied(false)).toBe(true);
    expect(isAccessDenied({ allowed: false })).toBe(true);
    expect(isAccessDenied(undefined)).toBe(false);
    expect(isAccessDenied(true)).toBe(false);
    expect(isAccessDenied({ allowed: true })).toBe(false);
    expect(isAccessDenied({})).toBe(false);
  });
});

describe('rewriteMasterPlaylist', () => {
  test('should collect and rewrite variant uris', () => {
    const { text, variantUrls } = rewriteMasterPlaylist(
      MASTER_TEXT,
      'https://bl.example.com/master.m3u8',
      (index) => `/rutube/variant.m3u8?v=${index}`
    );

    expect(variantUrls).toEqual([
      'https://bl.example.com/hls/360.m3u8',
      'https://cdn.example.com/hls/720.m3u8'
    ]);
    expect(text).toContain('/rutube/variant.m3u8?v=0');
    expect(text).toContain('/rutube/variant.m3u8?v=1');
    expect(text).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000');
    expect(text).not.toContain('hls/360.m3u8');
  });
});

describe('rewriteVariantPlaylist', () => {
  test('should collect and rewrite segments and keys', () => {
    const { text, segmentUrls, keyUrls } = rewriteVariantPlaylist(
      VARIANT_TEXT,
      'https://bl.example.com/hls/360.m3u8',
      (index) => `/rutube/segment?s=${index}`,
      (index) => `/rutube/key?k=${index}`
    );

    expect(segmentUrls).toEqual([
      'https://bl.example.com/hls/seg-0.ts',
      'https://cdn.example.com/hls/seg-1.ts'
    ]);
    expect(keyUrls).toEqual(['https://bl.example.com/hls/keys/k1.key']);
    expect(text).toContain('/rutube/segment?s=0');
    expect(text).toContain('/rutube/key?k=0');
    expect(text).toContain('#EXT-X-KEY:METHOD=AES-128,URI="/rutube/key?k=0"');
    expect(text).toContain('#EXT-X-ENDLIST');
  });
});

describe('getRutubeMeta', () => {
  beforeEach(() => {
    clearRutubeCache();
  });

  test('should parse the options payload', async () => {
    const stubFetch = (async () =>
      jsonResponse(optionsPayload())) as unknown as typeof fetch;

    const meta = await getRutubeMeta(VIDEO_ID, stubFetch);

    expect(meta).toMatchObject({
      videoId: VIDEO_ID,
      title: 'Test movie',
      authorName: 'Test author',
      durationSec: 5879,
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      balancerUrl: 'https://bl.example.com/video_balancer.m3u8?token=abc'
    });
  });

  test('should cache the metadata', async () => {
    let calls = 0;
    const stubFetch = (async () => {
      calls += 1;

      return jsonResponse(optionsPayload());
    }) as unknown as typeof fetch;

    await getRutubeMeta(VIDEO_ID, stubFetch);
    await getRutubeMeta(VIDEO_ID, stubFetch);

    expect(calls).toBe(1);
  });

  test('should throw not found on upstream 404', async () => {
    const stubFetch = (async () =>
      new Response('nope', { status: 404 })) as unknown as typeof fetch;

    const error = await getRutubeMeta(VIDEO_ID, stubFetch).catch((err) => err);

    expect(error).toBeInstanceOf(RutubeError);
    expect((error as RutubeError).kind).toBe('NOT_FOUND');
  });

  test('should refuse videos without a balancer link', async () => {
    const stubFetch = (async () =>
      jsonResponse(
        optionsPayload({ video_balancer: undefined })
      )) as unknown as typeof fetch;

    const error = await getRutubeMeta(VIDEO_ID, stubFetch).catch((err) => err);

    expect(error).toBeInstanceOf(RutubeError);
    expect((error as RutubeError).kind).toBe('UNAVAILABLE');
  });
});

describe('proxy playlists', () => {
  beforeEach(() => {
    clearRutubeCache();
  });

  const stubFetchFor = (masterStatus = 200, variantStatus = 200) => {
    return (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/api/play/options/')) {
        return jsonResponse(optionsPayload());
      }

      if (url.includes('video_balancer.m3u8')) {
        return new Response(MASTER_TEXT, { status: masterStatus });
      }

      return new Response(VARIANT_TEXT, { status: variantStatus });
    }) as unknown as typeof fetch;
  };

  test('should serve a rewritten master playlist', async () => {
    const text = await getMasterPlaylist(
      VIDEO_ID,
      (index) => `/rutube/variant.m3u8?v=${index}`,
      stubFetchFor()
    );

    expect(text).toContain('/rutube/variant.m3u8?v=0');
    expect(text).toContain('/rutube/variant.m3u8?v=1');
  });

  test('should serve a rewritten variant playlist', async () => {
    const { text, segmentUrls, keyUrls } = await getVariantPlaylist(
      VIDEO_ID,
      1,
      (index) => `/rutube/segment?s=${index}`,
      (index) => `/rutube/key?k=${index}`,
      stubFetchFor()
    );

    expect(segmentUrls).toHaveLength(2);
    expect(keyUrls).toHaveLength(1);
    expect(text).toContain('/rutube/segment?s=1');
  });

  test('should refresh the balancer once on auth errors', async () => {
    let masterCalls = 0;
    const stubFetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/api/play/options/')) {
        return jsonResponse(optionsPayload());
      }

      masterCalls += 1;

      if (masterCalls === 1) {
        return new Response('expired', { status: 403 });
      }

      return new Response(MASTER_TEXT, { status: 200 });
    }) as unknown as typeof fetch;

    const text = await getMasterPlaylist(
      VIDEO_ID,
      (index) => `/rutube/variant.m3u8?v=${index}`,
      stubFetch
    );

    expect(masterCalls).toBe(2);
    expect(text).toContain('/rutube/variant.m3u8?v=0');
  });

  test('should reject out of range references', async () => {
    const stub = stubFetchFor();

    await getVariantPlaylist(
      VIDEO_ID,
      0,
      (index) => `/s?s=${index}`,
      (index) => `/k?k=${index}`,
      stub
    );

    const error = await resolveSegmentUrl(VIDEO_ID, 0, 99, stub).catch(
      (err) => err
    );

    expect(error).toBeInstanceOf(RutubeError);
    expect((error as RutubeError).kind).toBe('NOT_FOUND');
  });
});
