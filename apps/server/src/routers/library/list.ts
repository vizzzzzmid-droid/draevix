import { getLibraryVideos } from '../../db/queries/library';
import { protectedProcedure } from '../../utils/trpc';

const listLibraryRoute = protectedProcedure.query(async () => {
  const videos = await getLibraryVideos();

  return { videos };
});

export { listLibraryRoute };
