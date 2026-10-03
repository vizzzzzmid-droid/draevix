import { eq } from 'drizzle-orm';
import { db } from '..';
import { watchLibrary } from '../schema';

const addLibraryEntry = async (fileId: number, userId: number) =>
  db
    .insert(watchLibrary)
    .values({ fileId, addedByUserId: userId, createdAt: Date.now() })
    .returning()
    .get();

const removeLibraryEntryByFileId = async (fileId: number) => {
  await db.delete(watchLibrary).where(eq(watchLibrary.fileId, fileId));
};

export { addLibraryEntry, removeLibraryEntryByFileId };
