import { requestImageCrop } from '@/features/dialogs/actions';
import { croppedFileName } from '@/helpers/image-crop';
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
  // when set, the file goes through the crop dialog first (animated gifs
  // are uploaded untouched so the animation survives)
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

      let uploadFile = file;

      if (options?.aspect && file.type !== 'image/gif') {
        const blob = await requestImageCrop({
          file,
          aspect: options.aspect,
          round: options.round
        });

        if (!blob) return;

        uploadFile = new File([blob], croppedFileName(file.name, blob.type), {
          type: blob.type
        });
      }

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
