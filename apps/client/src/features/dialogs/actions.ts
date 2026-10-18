import { Dialog } from '@/components/dialogs/dialogs';
import { isCroppableGif } from '@/helpers/gif-crop';
import { croppedFileName } from '@/helpers/image-crop';
import type { TGenericObject } from '@draevix/shared';
import { store } from '../store';
import { dialogInfoSelector } from './selectors';
import { dialogSliceActions } from './slice';

export const openDialog = (dialog: Dialog, props?: TGenericObject) => {
  store.dispatch(dialogSliceActions.openDialog({ dialog, props }));
};

export const toggleDialog = (dialog: Dialog) => {
  const { openDialog: current, isOpen } = dialogInfoSelector(store.getState());

  if (isOpen && current === dialog) {
    closeDialogs();

    return;
  }

  openDialog(dialog);
};

export const closeDialogs = () => {
  store.dispatch(dialogSliceActions.setClosing(true));

  // allow fade out animation to complete before stopping rendering, otherwise it looks choppy
  setTimeout(() => {
    store.dispatch(dialogSliceActions.closeDialogs());

    setTimeout(() => {
      // https://github.com/radix-ui/primitives/issues/1241
      // remove this after radix fixes the bug
      document.body.style.pointerEvents = '';
    }, 0);
  }, 150);
};

export const requestConfirmation = async ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'info',
  onConfirm,
  onCancel
}: {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'info';
  onConfirm?: () => void;
  onCancel?: () => void;
}): Promise<boolean> => {
  return new Promise((resolve) => {
    openDialog(Dialog.CONFIRM_ACTION, {
      title,
      message,
      confirmLabel,
      cancelLabel,
      variant,
      onConfirm: () => {
        onConfirm?.();
        closeDialogs();
        resolve(true);
      },
      onCancel: () => {
        onCancel?.();
        closeDialogs();
        resolve(false);
      }
    });
  });
};

export const requestTextInput = async ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  type = 'text',
  allowEmpty = false,
  autoClose = true
}: {
  title?: string;
  message?: string;
  type?: 'text' | 'password';
  confirmLabel?: string;
  cancelLabel?: string;
  allowEmpty?: boolean;
  autoClose?: boolean;
}): Promise<string | undefined | null> => {
  return new Promise((resolve) => {
    openDialog(Dialog.TEXT_INPUT, {
      title,
      message,
      confirmLabel,
      cancelLabel,
      allowEmpty,
      type,
      onConfirm: (text: string) => {
        if (autoClose) {
          closeDialogs();
        }

        resolve(text);
      },
      onCancel: () => {
        resolve(null);
      }
    });
  });
};

export const requestImageCrop = async ({
  file,
  aspect,
  round = false
}: {
  file: File;
  aspect: number;
  round?: boolean;
}): Promise<Blob | null> => {
  return new Promise((resolve) => {
    openDialog(Dialog.IMAGE_CROP, {
      file,
      aspect,
      round,
      onConfirm: (blob: Blob) => {
        closeDialogs();
        resolve(blob);
      },
      onCancel: () => {
        closeDialogs();
        resolve(null);
      }
    });
  });
};

// runs the file through the crop dialog when asked; gifs too heavy to
// re-encode keep their animation and bytes as-is. returns null on cancel,
// otherwise a fresh upload-ready file
export const prepareImageFile = async (
  file: File,
  crop?: { aspect: number; round?: boolean }
): Promise<File | null> => {
  if (!crop) return file;

  if (file.type === 'image/gif' && !(await isCroppableGif(file))) {
    return file;
  }

  const blob = await requestImageCrop({ file, ...crop });

  if (!blob) return null;

  return new File([blob], croppedFileName(file.name, blob.type), {
    type: blob.type
  });
};

export const resetDialogs = () => {
  store.dispatch(dialogSliceActions.resetDialogs());
};
