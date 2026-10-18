import { prepareImageFile } from '@/features/dialogs/actions';
import { uploadImage } from '@/helpers/upload-file';
import { useFilePicker } from '@/hooks/use-file-picker';
import { getTrpcError } from '@draevix/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export type TPickedImage = {
  fileId: string;
  previewUrl: string;
};

type TUsePickImageOptions = {
  // when set, the file goes through the crop dialog first
  aspect?: number;
  round?: boolean;
};

// uploads to the temporary store only, the settings form commits the id when it saves
const usePickImage = (options?: TUsePickImageOptions) => {
  const { t } = useTranslation('common');
  const openFilePicker = useFilePicker();

  return useCallback(async (): Promise<TPickedImage | undefined> => {
    try {
      const [file] = await openFilePicker('image/*');

      if (!file) return;

      const prepared = options?.aspect
        ? await prepareImageFile(file, {
            aspect: options.aspect,
            round: options.round
          })
        : { file, gifSkipped: false };

      if (!prepared) return;

      if (prepared.gifSkipped) {
        toast.info(t('gifCropSkipped'));
      }

      const uploadFile = prepared.file;

      const temporaryFile = await uploadImage(uploadFile);

      if (!temporaryFile) return;

      return {
        fileId: temporaryFile.id,
        previewUrl: URL.createObjectURL(uploadFile)
      };
    } catch (error) {
      toast.error(getTrpcError(error, t('failedUploadImage')));
    }
  }, [openFilePicker, options?.aspect, options?.round, t]);
};

export { usePickImage };
