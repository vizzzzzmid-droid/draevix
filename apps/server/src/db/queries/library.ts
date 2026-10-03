import type { TFile, TWatchLibraryEntry } from '@draevix/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '..';
import { attachFileToken } from '../../helpers/files-crypto';
import { files, watchLibrary } from '../schema';
import { getSettings } from './server';

export type TLibraryVideo = TWatchLibraryEntry & {
  file: TFile;
};

const getLibraryVideos = async (): Promise<TLibraryVideo[]> => {
  const { storageSignedUrlsEnabled, storageSignedUrlsTtlSeconds } =
    await getSettings();

  const rows = await db
    .select({ entry: watchLibrary, file: files })
    .from(watchLibrary)
    .innerJoin(files, eq(watchLibrary.fileId, files.id))
    .orderBy(asc(watchLibrary.createdAt))
    .all();

  return rows.map(({ entry, file }) => ({
    ...entry,
    file: attachFileToken(
      file,
      storageSignedUrlsEnabled,
      storageSignedUrlsTtlSeconds
    )
  }));
};

const getLibraryEntryByFileId = async (fileId: number) =>
  db
    .select()
    .from(watchLibrary)
    .where(eq(watchLibrary.fileId, fileId))
    .limit(1)
    .get();

const isLibraryFile = async (fileId: number): Promise<boolean> =>
  !!(await getLibraryEntryByFileId(fileId));

export { getLibraryEntryByFileId, getLibraryVideos, isLibraryFile };
