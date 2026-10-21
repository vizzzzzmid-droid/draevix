import { describe, expect, test } from 'bun:test';
import { extractLinksFromHtml } from '../extract-links-from-html';

describe('extractLinksFromHtml', () => {
  test('extracts anchor targets', () => {
    expect(
      extractLinksFromHtml(
        '<p><a href="https://example.com/a">first</a> and <a href="https://example.com/b">second</a></p>'
      )
    ).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  test('keeps a link whose text does not contain the target', () => {
    expect(
      extractLinksFromHtml('<a href="https://example.com/needle">read this</a>')
    ).toEqual(['https://example.com/needle']);
  });

  test('decodes escaped ampersands in an anchor target', () => {
    expect(
      extractLinksFromHtml(
        '<a href="https://example.com/?a=1&amp;b=2">query</a>'
      )
    ).toEqual(['https://example.com/?a=1&b=2']);
  });

  test('extracts bare urls from the message text', () => {
    expect(
      extractLinksFromHtml('<p>look at https://example.com/bare now</p>')
    ).toEqual(['https://example.com/bare']);
  });

  test('deduplicates a url that is both linked and written out', () => {
    expect(
      extractLinksFromHtml(
        '<p><a href="https://example.com/a">https://example.com/a</a></p>'
      )
    ).toEqual(['https://example.com/a']);
  });

  test('ignores non web schemes and messages without links', () => {
    expect(
      extractLinksFromHtml(
        '<p><a href="mailto:test@example.com">mail</a> plain text</p>'
      )
    ).toEqual([]);
  });
});
