import { extractUrls, getPlainTextFromHtml } from '@draevix/shared';

const HREF_PATTERN =
  /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const isWebUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const extractLinksFromHtml = (html: string): string[] => {
  const links: string[] = [];

  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim();

    if (isWebUrl(href)) {
      links.push(href);
    }
  }

  // bare urls that were never wrapped in an anchor still count as links
  for (const url of extractUrls(getPlainTextFromHtml(html))) {
    links.push(url);
  }

  return Array.from(new Set(links));
};

export { extractLinksFromHtml };
