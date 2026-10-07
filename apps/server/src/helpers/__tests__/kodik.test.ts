import { beforeEach, describe, expect, test } from 'bun:test';
import {
  caesarDecodeLink,
  clearKodikTokenCache,
  decodeStreamLinks,
  decryptKodikToken,
  extractPostLink,
  kodikDescribe,
  KodikError,
  kodikResolveStream,
  kodikSearch,
  normalizeKodikLink,
  parseEpisodes,
  parseSeasons,
  parseTranslations,
  parseUrlParams,
  parseVideoIdentity
} from '../kodik';

const encryptKodikToken = (token: string): string => {
  const first = Buffer.from(token.slice(0, 16), 'utf-8').toString('base64');
  const second = Buffer.from(token.slice(16), 'utf-8').toString('base64');

  return [...second].reverse().join('') + [...first].reverse().join('');
};

// kodik stores Caesar(shift +k, base64(plain)), so fixtures encode it that
// way around: shift the base64 text, not the plaintext
const caesarShift = (text: string, n: number): string =>
  [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);

      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + n) % 26) + 65);
      }

      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + n) % 26) + 97);
      }

      return ch;
    })
    .join('');

const caesarEncoded = (plain: string, n: number): string =>
  caesarShift(Buffer.from(plain, 'utf-8').toString('base64'), n);

const EMBED_HTML = `
<html><body>
<script>var x = 1;</script>
<script src="/assets/js/app.123.js"></script>
<script>var y = 2;</script>
<script>var z = 3;</script>
<script>
.type = 'video';
.hash = '81e1450ea02cd3c8466f57980af141c9';
.id = '116675';
var urlParams = '{"d":"kodikplayer.com","d_sign":"aaa","pd":"kodikplayer.com","pd_sign":"bbb","ref_sign":"ccc"}';
</script>
</body></html>
`;

const SERIAL_HTML = `
<html><body>
<script>var x = 1;</script>
<script src="/assets/js/app.123.js"></script>
<script>
.type = 'serial';
.hash = '4698b2bea53c04aa757d3d1ff42fea53';
.id = '6646';
var urlParams = '{"d":"kodikplayer.com","d_sign":"aaa","pd":"kodikplayer.com","pd_sign":"bbb","ref_sign":"ccc"}';
</script>
<div class="serial-translations-box"><select>
<option value="735" data-id="735" data-translation-type="voice" data-media-id="6646" data-media-hash="4698b2bea53c04aa757d3d1ff42fea53" data-media-type="serial" data-title="2x2" data-episode-count="220" selected="selected"></option>
<option value="609" data-id="609" data-translation-type="voice" data-media-id="6647" data-media-hash="cd5cb18078eb1d1a96abe338b2ffeb16" data-media-type="serial" data-title="AniDUB" data-episode-count="220"></option>
</select></div>
<div class="serial-seasons-box"><select>
<option value="1">Сезон 1</option>
</select></div>
<div class="serial-series-box"><select>
<option value="1" data-id="176238" data-hash="ead7d029724d16a6d0440cf6786e2226" data-title="1 серия" data-other-translation="false"></option>
<option value="2" data-id="176239" data-hash="9710691db246ca2506446dd34951b402" data-title="2 серия" data-other-translation="false"></option>
<option value="99" data-id="999999" data-hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" data-title="99 серия" data-other-translation="true"></option>
</select></div>
</body></html>
`;

const PLAYER_JS =
  `var a = 1; $.ajax({"url": "XXX", dataType: "json", cache:!1, success: function() {}});`.replace(
    'XXX',
    'X'.repeat(14) + Buffer.from('/ftor').toString('base64')
  );

const MANIFEST_URL =
  'https://cloud.example.com/up/123/720.mp4:hls:manifest.m3u8';

describe('normalizeKodikLink', () => {
  test('should accept player and info hosts', () => {
    expect(
      normalizeKodikLink(
        'https://kodikplayer.com/video/116675/81e1450ea02cd3c8466f57980af141c9/720p'
      )
    ).toBe(
      'https://kodikplayer.com/video/116675/81e1450ea02cd3c8466f57980af141c9/720p'
    );
    expect(
      normalizeKodikLink(
        '//kodik.info/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p'.replace(
          '//',
          'https://'
        )
      )
    ).toBe(
      'https://kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p'
    );
  });

  test('should reject garbage', () => {
    expect(normalizeKodikLink('')).toBeNull();
    expect(normalizeKodikLink('https://example.com/video/1/abc')).toBeNull();
    expect(
      normalizeKodikLink('https://kodikplayer.com/video/1/shorthash')
    ).toBeNull();
  });
});

describe('decryptKodikToken', () => {
  test('should roundtrip the documented obfuscation', () => {
    const token = '56a768d08f43091901c44b54fe970049';

    expect(decryptKodikToken(encryptKodikToken(token))).toBe(token);
  });
});

describe('embed page parsing', () => {
  test('should parse url params', () => {
    expect(parseUrlParams(EMBED_HTML)).toMatchObject({
      d: 'kodikplayer.com',
      ref_sign: 'ccc'
    });
  });

  test('should parse the video identity', () => {
    expect(parseVideoIdentity(EMBED_HTML)).toEqual({
      type: 'video',
      hash: '81e1450ea02cd3c8466f57980af141c9',
      id: '116675'
    });
  });

  test('should refuse a geo-blocked page', () => {
    const error = (() => {
      try {
        parseVideoIdentity('Видео запрещено к просмотру в данной стране');
      } catch (err) {
        return err;
      }
    })();

    expect(error).toBeInstanceOf(KodikError);
    expect((error as KodikError).kind).toBe('BLOCKED');
  });

  test('should parse translations', () => {
    const translations = parseTranslations(SERIAL_HTML);

    expect(translations).toHaveLength(2);
    expect(translations[0]).toMatchObject({
      id: '735',
      title: '2x2',
      type: 'voice',
      episodeCount: 220,
      selected: true
    });
    expect(translations[1]).toMatchObject({ id: '609', selected: false });
  });

  test('should parse current-translation episodes only', () => {
    const episodes = parseEpisodes(SERIAL_HTML);

    expect(episodes).toEqual([
      { episode: 1, title: '1 серия' },
      { episode: 2, title: '2 серия' }
    ]);
  });

  test('should parse seasons with a single-season fallback', () => {
    expect(parseSeasons(SERIAL_HTML)).toEqual([1]);
    expect(parseSeasons('<html></html>')).toEqual([1]);
  });
});

describe('player decoding', () => {
  test('should extract the hidden post link', () => {
    expect(extractPostLink(PLAYER_JS)).toBe('/ftor');
  });

  test('should brute force the caesar rotation', () => {
    expect(caesarDecodeLink(caesarEncoded(MANIFEST_URL, 7))).toBe(MANIFEST_URL);
  });

  test('should build mp4 and hls urls per quality', () => {
    const { mp4, hls, maxQuality } = decodeStreamLinks({
      '360': [
        { src: 'https://cloud.example.com/up/123/360.mp4:hls:manifest.m3u8' }
      ],
      '720': [{ src: caesarEncoded(MANIFEST_URL, 3) }]
    });

    expect(maxQuality).toBe(720);
    expect(mp4['360']).toBe('https://cloud.example.com/up/123/360.mp4');
    expect(hls['720']).toBe(
      'https://cloud.example.com/up/123/720.mp4:hls:manifest.m3u8'
    );
  });
});

describe('kodikSearch', () => {
  beforeEach(() => {
    clearKodikTokenCache();
  });

  const stubFetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes('tokens.json')) {
      return new Response(
        JSON.stringify({
          stable: [{ tokn: encryptKodikToken('test-token-1234567890abcdef') }],
          unstable: []
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        total: 1,
        results: [
          {
            id: 'serial-6646',
            type: 'anime-serial',
            link: '//kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p',
            title: 'Наруто',
            title_orig: 'Naruto',
            year: 2002,
            quality: 'DVDRip',
            episodes_count: 220,
            blocked_countries: [],
            screenshots: ['https://i.kodik.biz/screenshots/1.jpg'],
            translation: { id: 735, title: '2x2', type: 'voice' }
          }
        ]
      }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;

  test('should discover a pool token and parse results', async () => {
    const results = await kodikSearch('Naruto', 10, stubFetch);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kodikId: 'serial-6646',
      kind: 'serial',
      link: 'https://kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p',
      title: 'Наруто',
      episodesCount: 220,
      poster: 'https://i.kodik.biz/screenshots/1.jpg',
      blocked: false
    });
    expect(results[0]!.translation).toMatchObject({
      id: '735',
      title: '2x2'
    });
  });
});

describe('kodikResolveStream', () => {
  const stubFetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes('/assets/js/')) {
      return new Response(PLAYER_JS, { status: 200 });
    }

    if (url.endsWith('/ftor')) {
      return new Response(
        JSON.stringify({
          links: {
            '360': [
              {
                src: 'https://cloud.example.com/up/123/360.mp4:hls:manifest.m3u8'
              }
            ],
            '720': [{ src: caesarEncoded(MANIFEST_URL, 5) }]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('/serial/')) {
      return new Response(SERIAL_HTML, { status: 200 });
    }

    return new Response(EMBED_HTML, { status: 200 });
  }) as unknown as typeof fetch;

  test('should resolve a movie to direct urls', async () => {
    const resolved = await kodikResolveStream(
      {
        link: 'https://kodikplayer.com/video/116675/81e1450ea02cd3c8466f57980af141c9/720p'
      },
      stubFetch
    );

    expect(resolved.maxQuality).toBe(720);
    expect(resolved.mp4['720']).toBe(
      'https://cloud.example.com/up/123/720.mp4'
    );
    expect(resolved.hls['720']).toBe(MANIFEST_URL);
  });

  test('should switch translation and episode for serials', async () => {
    const seen: string[] = [];
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(String(input));
      return stubFetch(input, init);
    }) as unknown as typeof fetch;

    const resolved = await kodikResolveStream(
      {
        link: 'https://kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p',
        translationId: '609',
        season: 1,
        episode: 3
      },
      spy
    );

    expect(
      seen.some((url) =>
        url.includes('/serial/6647/cd5cb18078eb1d1a96abe338b2ffeb16/720p')
      )
    ).toBe(true);
    expect(
      seen.some((url) => url.includes('season=1') && url.includes('episode=3'))
    ).toBe(true);
    expect(resolved.mediaType).toBe('serial');
  });
});

describe('kodikDescribe', () => {
  const stubFetch = (async () => {
    return new Response(SERIAL_HTML, { status: 200 });
  }) as unknown as typeof fetch;

  test('should list translations, seasons and episodes', async () => {
    const described = await kodikDescribe(
      'https://kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p',
      stubFetch
    );

    expect(described.mediaType).toBe('serial');
    expect(described.translations).toHaveLength(2);
    expect(described.seasons).toEqual([1]);
    expect(described.episodes).toHaveLength(2);
  });
});
