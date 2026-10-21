import {
  audioExtensions,
  imageExtensions,
  videoExtensions
} from '@draevix/shared';
import { or, sql, type SQL } from 'drizzle-orm';
import { files } from '../db/schema';

type TFileCategory = 'photos' | 'videos' | 'audio';

const extensionInCondition = (extensions: string[]): SQL =>
  sql`ltrim(lower(${files.extension}), '.') IN (${sql.join(
    extensions.map((extension) => sql`${extension.replace(/^\./, '')}`),
    sql.raw(', ')
  )})`;

const fileCategoryCondition = (category: TFileCategory): SQL => {
  const [mimePrefix, extensions] =
    category === 'photos'
      ? ['image', imageExtensions]
      : category === 'videos'
        ? ['video', videoExtensions]
        : ['audio', audioExtensions];

  return or(
    sql`lower(${files.mimeType}) LIKE ${`${mimePrefix}/%`}`,
    extensionInCondition(extensions)
  )!;
};

export { fileCategoryCondition };
