import { t } from '../../utils/trpc';
import { addLibraryRoute } from './add';
import { listLibraryRoute } from './list';
import { removeLibraryRoute } from './remove';

export const libraryRouter = t.router({
  list: listLibraryRoute,
  add: addLibraryRoute,
  remove: removeLibraryRoute
});
