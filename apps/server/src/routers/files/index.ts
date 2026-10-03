import { t } from '../../utils/trpc';
import { deleteFileRoute } from './delete-file';
import { deleteTemporaryFileRoute } from './delete-temporary-file';
import { keepUploadRoute } from './keep-upload';

export const filesRouter = t.router({
  delete: deleteFileRoute,
  deleteTemporary: deleteTemporaryFileRoute,
  keepUpload: keepUploadRoute
});
