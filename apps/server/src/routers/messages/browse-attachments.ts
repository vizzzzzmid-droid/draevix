import { getPlainTextFromHtml, type TFile } from '@draevix/shared';
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config';
import { db } from '../../db';
import { getSettings } from '../../db/queries/server';
import { channels, files, messageFiles, messages } from '../../db/schema';
import { extractLinksFromHtml } from '../../helpers/extract-links-from-html';
import { fileCategoryCondition } from '../../helpers/file-category-condition';
import { attachFileToken } from '../../helpers/files-crypto';
import { getSearchChannelIds } from '../../helpers/search-channel-ids';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

const MIN_FILTER_LENGTH = 2;
const MAX_FILTER_LENGTH = 24;
const DEFAULT_LIMIT = 25;

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

type TAttachmentCursor = {
  createdAt: number;
  id: number;
};

const toCursor = (
  row: { createdAt: number; id: number } | undefined
): TAttachmentCursor | null =>
  row ? { createdAt: row.createdAt, id: row.id } : null;

const browseAttachmentsRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.search.maxRequests,
  windowMs: config.rateLimiters.search.windowMs,
  logLabel: 'browseAttachments'
})
  .input(
    z.object({
      scope: z.enum(['server', 'dms']).default('server'),
      channelId: z.number().int().positive().optional(),
      type: z.enum(['photos', 'videos', 'audio', 'links']),
      query: z.string().trim().toLowerCase().max(MAX_FILTER_LENGTH).optional(),
      cursor: z
        .object({
          createdAt: z.number().int().nonnegative(),
          id: z.number().int().positive()
        })
        .nullish(),
      limit: z.number().int().min(1).max(100).default(DEFAULT_LIMIT)
    })
  )
  .query(async ({ ctx, input }) => {
    const settings = await getSettings();

    invariant(settings.enableSearch, {
      code: 'FORBIDDEN',
      message: 'Search is disabled on this server'
    });

    const accessibleChannelIds = await getSearchChannelIds(
      ctx.userId,
      input.scope,
      settings.directMessagesEnabled,
      input.channelId
    );

    if (accessibleChannelIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const query =
      input.query && input.query.length >= MIN_FILTER_LENGTH ? input.query : '';
    const likePattern = query ? `%${escapeLikePattern(query)}%` : null;
    const cursor = input.cursor ?? null;

    if (input.type === 'links') {
      const conditions: (SQL | undefined)[] = [
        inArray(messages.channelId, accessibleChannelIds),
        sql`instr(lower(coalesce(${messages.content}, '')), 'http') > 0`
      ];

      if (likePattern) {
        conditions.push(
          sql`lower(coalesce(${messages.content}, '')) LIKE ${likePattern} ESCAPE '\\'`
        );
      }

      if (cursor) {
        conditions.push(
          or(
            lt(messages.createdAt, cursor.createdAt),
            and(
              eq(messages.createdAt, cursor.createdAt),
              lt(messages.id, cursor.id)
            )
          )
        );
      }

      const rows = await db
        .select({
          message: messages,
          channelName: channels.name,
          channelIsDm: channels.isDm
        })
        .from(messages)
        .innerJoin(channels, eq(channels.id, messages.channelId))
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(input.limit + 1);

      const page = rows.slice(0, input.limit);

      const items = page.flatMap((row) => {
        const links = extractLinksFromHtml(row.message.content ?? '');

        if (links.length === 0) {
          return [];
        }

        const plainContent = getPlainTextFromHtml(
          row.message.content ?? ''
        ).trim();

        if (query) {
          const matchesText = plainContent.toLowerCase().includes(query);
          const matchesLink = links.some((link) =>
            link.toLowerCase().includes(query)
          );

          if (!matchesText && !matchesLink) {
            return [];
          }
        }

        return [
          {
            kind: 'link' as const,
            links,
            messageId: row.message.id,
            channelId: row.message.channelId,
            messageCreatedAt: row.message.createdAt,
            channelName: row.channelName,
            channelIsDm: row.channelIsDm,
            plainContent
          }
        ];
      });

      const last = page.at(-1);

      return {
        items,
        nextCursor:
          rows.length > input.limit && last
            ? toCursor({
                createdAt: last.message.createdAt,
                id: last.message.id
              })
            : null
      };
    }

    const conditions: (SQL | undefined)[] = [
      inArray(messages.channelId, accessibleChannelIds),
      fileCategoryCondition(input.type)
    ];

    if (likePattern) {
      conditions.push(
        or(
          sql`lower(${files.originalName}) LIKE ${likePattern} ESCAPE '\\'`,
          sql`lower(coalesce(${messages.content}, '')) LIKE ${likePattern} ESCAPE '\\'`
        )
      );
    }

    if (cursor) {
      conditions.push(
        or(
          lt(messages.createdAt, cursor.createdAt),
          and(eq(messages.createdAt, cursor.createdAt), lt(files.id, cursor.id))
        )
      );
    }

    const rows = await db
      .select({
        file: files,
        messageId: messages.id,
        channelId: messages.channelId,
        messageContent: messages.content,
        messageCreatedAt: messages.createdAt,
        channelName: channels.name,
        channelIsDm: channels.isDm
      })
      .from(messageFiles)
      .innerJoin(files, eq(files.id, messageFiles.fileId))
      .innerJoin(messages, eq(messages.id, messageFiles.messageId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(files.id))
      .limit(input.limit + 1);

    const page = rows.slice(0, input.limit);

    const items = page.map((row) => ({
      kind: 'file' as const,
      ...row,
      file: attachFileToken(
        row.file as TFile,
        settings.storageSignedUrlsEnabled,
        settings.storageSignedUrlsTtlSeconds
      )
    }));

    const last = page.at(-1);

    return {
      items,
      nextCursor:
        rows.length > input.limit && last
          ? toCursor({
              createdAt: last.messageCreatedAt,
              id: last.file.id
            })
          : null
    };
  });

export { browseAttachmentsRoute };
