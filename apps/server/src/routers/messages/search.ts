import {
  audioExtensions,
  getPlainTextFromHtml,
  imageExtensions,
  videoExtensions,
  type TFile
} from '@draevix/shared';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config';
import { db } from '../../db';
import { getChannelsForUser } from '../../db/queries/channels';
import { getDirectMessageChannelIdsForUser } from '../../db/queries/dms';
import { getSettings } from '../../db/queries/server';
import { channels, files, messageFiles, messages } from '../../db/schema';
import { extractLinksFromHtml } from '../../helpers/extract-links-from-html';
import { attachFileToken } from '../../helpers/files-crypto';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

// this search is pretty basic and it CAN be optimized, however it might not be worth it
// some things things we can do:
// check https://sqlite.org/fts5.html for full text search capabilities, but it might be an overkill and add complexity to the codebase
// save an already pre-processed plain text version of the message content in the database to avoid having to do it in JS and speed up the search (this would require updating the existing messages and keeping it in sync for new messages, but it would make the search much faster and more accurate)
// for files the same applies, we could save a pre-processed version of the original name in lowercase to speed up the search and make it more accurate
// however, the quick test I did with close to 10k messages the request was taking around 4-8 ms, which is more than good enough

const SEARCH_QUERY_MIN_LENGTH = 2; // minimum length for search query to prevent too broad searches
const SEARCH_QUERY_MAX_LENGTH = 24; // maximum length for search query to prevent performance issues and potential abuse
const MESSAGE_FETCH_MULTIPLIER = 4; // multiplier to fetch more messages than requested to account for filtering after fetching from the database
const MAX_MESSAGE_FETCH_LIMIT = 100; // absolute maximum number of messages to fetch from the database before filtering, to prevent performance issues

const MESSAGES_LIMIT = 25;
const FILES_LIMIT = 25;

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const extensionInCondition = (extensions: string[]): SQL =>
  sql`ltrim(lower(${files.extension}), '.') IN (${sql.join(
    extensions.map((extension) => sql`${extension.replace(/^\./, '')}`),
    sql.raw(', ')
  )})`;

const categoryCondition = (mimePrefix: string, extensions: string[]): SQL =>
  or(
    sql`lower(${files.mimeType}) LIKE ${`${mimePrefix}/%`}`,
    extensionInCondition(extensions)
  )!;

type TFileResultRow = {
  file: TFile;
  messageId: number;
  channelId: number;
  messageContent: string | null;
  messageCreatedAt: number;
  channelName: string;
  channelIsDm: boolean;
};

const searchMessagesRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.search.maxRequests,
  windowMs: config.rateLimiters.search.windowMs,
  logLabel: 'search'
})
  .input(
    z.object({
      query: z
        .string()
        .trim()
        .toLowerCase()
        .min(SEARCH_QUERY_MIN_LENGTH)
        .max(SEARCH_QUERY_MAX_LENGTH),
      scope: z.enum(['server', 'dms']).default('server')
    })
  )
  .query(async ({ ctx, input }) => {
    const settings = await getSettings();

    invariant(settings.enableSearch, {
      code: 'FORBIDDEN',
      message: 'Search is disabled on this server'
    });

    const accessibleChannelIds =
      input.scope === 'dms'
        ? settings.directMessagesEnabled
          ? await getDirectMessageChannelIdsForUser(ctx.userId)
          : []
        : (await getChannelsForUser(ctx.userId))
            .filter((channel) => !channel.isDm)
            .map((channel) => channel.id);

    if (accessibleChannelIds.length === 0) {
      return {
        messages: [],
        files: [],
        photos: [],
        videos: [],
        audio: [],
        links: [],
        truncated: false
      };
    }

    const likePattern = `%${escapeLikePattern(input.query)}%`;
    const messageFetchLimit = Math.min(
      MESSAGES_LIMIT * MESSAGE_FETCH_MULTIPLIER,
      MAX_MESSAGE_FETCH_LIMIT
    );

    const fileMatchCondition = or(
      sql`lower(${files.originalName}) LIKE ${likePattern} ESCAPE '\\'`,
      sql`lower(coalesce(${messages.content}, '')) LIKE ${likePattern} ESCAPE '\\'`
    )!;

    const selectFileRows = (condition?: SQL) =>
      db
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
        .where(
          and(
            inArray(messages.channelId, accessibleChannelIds),
            fileMatchCondition,
            condition
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(FILES_LIMIT);

    const [messageRows, allFileRows, photoRows, videoRows, audioRows] =
      await Promise.all([
        db
          .select({
            message: messages,
            channelName: channels.name,
            channelIsDm: channels.isDm
          })
          .from(messages)
          .innerJoin(channels, eq(channels.id, messages.channelId))
          .where(
            and(
              inArray(messages.channelId, accessibleChannelIds),
              sql`lower(coalesce(${messages.content}, '')) LIKE ${likePattern} ESCAPE '\\'`
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(messageFetchLimit),
        selectFileRows(),
        selectFileRows(categoryCondition('image', imageExtensions)),
        selectFileRows(categoryCondition('video', videoExtensions)),
        selectFileRows(categoryCondition('audio', audioExtensions))
      ]);

    const normalizedMessages = messageRows.map((row) => {
      const plainContent = getPlainTextFromHtml(
        row.message.content ?? ''
      ).trim();

      return {
        ...row,
        plainContent
      };
    });

    const matchedMessages = normalizedMessages
      .filter((row) => {
        if (!row.plainContent) {
          return false;
        }

        return row.plainContent.toLowerCase().includes(input.query);
      })
      .slice(0, MESSAGES_LIMIT);

    const matchedMessageIds = matchedMessages.map((row) => row.message.id);

    const attachedFileRows =
      matchedMessageIds.length > 0
        ? await db
            .select({
              messageId: messageFiles.messageId,
              file: files
            })
            .from(messageFiles)
            .innerJoin(files, eq(files.id, messageFiles.fileId))
            .where(inArray(messageFiles.messageId, matchedMessageIds))
        : [];

    const filesByMessageId = new Map<number, TFile[]>();

    for (const row of attachedFileRows) {
      const list = filesByMessageId.get(row.messageId) ?? [];

      list.push({ ...row.file });
      filesByMessageId.set(row.messageId, list);
    }

    const matchedMessagesWithFiles = matchedMessages.map((row) => {
      const attachedFiles = filesByMessageId.get(row.message.id) ?? [];

      const preparedFiles = attachedFiles.map((file) =>
        attachFileToken(
          file,
          settings.storageSignedUrlsEnabled,
          settings.storageSignedUrlsTtlSeconds
        )
      );

      return {
        ...row.message,
        channelName: row.channelName,
        channelIsDm: row.channelIsDm,
        plainContent: row.plainContent,
        files: preparedFiles,
        reactions: []
      };
    });

    const mapFileRows = (rows: TFileResultRow[]) =>
      rows.map((row) => ({
        ...row,
        file: attachFileToken(
          row.file,
          settings.storageSignedUrlsEnabled,
          settings.storageSignedUrlsTtlSeconds
        )
      }));

    const matchedLinks = normalizedMessages
      .flatMap((row) => {
        const links = extractLinksFromHtml(row.message.content ?? '');

        if (links.length === 0) {
          return [];
        }

        const matchesText = row.plainContent
          .toLowerCase()
          .includes(input.query);
        const matchesLink = links.some((link) =>
          link.toLowerCase().includes(input.query)
        );

        if (!matchesText && !matchesLink) {
          return [];
        }

        return [
          {
            links,
            messageId: row.message.id,
            channelId: row.message.channelId,
            messageCreatedAt: row.message.createdAt,
            channelName: row.channelName,
            channelIsDm: row.channelIsDm,
            plainContent: row.plainContent
          }
        ];
      })
      .slice(0, FILES_LIMIT);

    const truncated =
      messageRows.length >= messageFetchLimit ||
      allFileRows.length >= FILES_LIMIT ||
      photoRows.length >= FILES_LIMIT ||
      videoRows.length >= FILES_LIMIT ||
      audioRows.length >= FILES_LIMIT ||
      matchedMessages.length >= MESSAGES_LIMIT ||
      matchedLinks.length >= FILES_LIMIT;

    return {
      messages: matchedMessagesWithFiles,
      files: mapFileRows(allFileRows),
      photos: mapFileRows(photoRows),
      videos: mapFileRows(videoRows),
      audio: mapFileRows(audioRows),
      links: matchedLinks,
      truncated
    };
  });

export { searchMessagesRoute };
