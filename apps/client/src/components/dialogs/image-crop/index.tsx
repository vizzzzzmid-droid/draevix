import { getCroppedGifBlob } from '@/helpers/gif-crop';
import {
  getCroppedImageBlob,
  loadImageElement,
  type TCropPixels
} from '@/helpers/image-crop';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Slider
} from '@draevix/ui';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TImageCropDialogProps = TDialogBaseProps & {
  file: File;
  aspect: number;
  round?: boolean;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
};

const PREVIEW_WIDTH = 168;

const ImageCropDialog = memo(
  ({
    isOpen,
    close,
    file,
    aspect,
    round = false,
    onConfirm,
    onCancel
  }: TImageCropDialogProps) => {
    const { t } = useTranslation('dialogs');
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [pixels, setPixels] = useState<TCropPixels | null>(null);
    const [exporting, setExporting] = useState(false);
    const previewRef = useRef<HTMLCanvasElement | null>(null);

    const imageSrc = useMemo(() => URL.createObjectURL(file), [file]);

    useEffect(() => {
      return () => URL.revokeObjectURL(imageSrc);
    }, [imageSrc]);

    // a new file starts from the neutral position
    useEffect(() => {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPixels(null);
    }, [file]);

    const handleCropComplete = useCallback(
      (_area: Area, croppedAreaPixels: Area) => {
        setPixels({
          x: croppedAreaPixels.x,
          y: croppedAreaPixels.y,
          width: croppedAreaPixels.width,
          height: croppedAreaPixels.height
        });
      },
      []
    );

    // live "as it will look" preview next to the cropper
    useEffect(() => {
      const canvas = previewRef.current;

      if (!canvas || !pixels) return;

      let cancelled = false;

      const draw = async () => {
        try {
          const image = await loadImageElement(imageSrc);

          if (cancelled) return;

          const ratio = pixels.width / Math.max(1, pixels.height);
          const width = PREVIEW_WIDTH;
          const height = Math.max(1, Math.round(PREVIEW_WIDTH / ratio));

          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');

          if (!context) return;

          context.drawImage(
            image,
            pixels.x,
            pixels.y,
            pixels.width,
            pixels.height,
            0,
            0,
            width,
            height
          );
        } catch {
          // the cropper itself still shows the source image
        }
      };

      void draw();

      return () => {
        cancelled = true;
      };
    }, [imageSrc, pixels]);

    const handleApply = useCallback(async () => {
      if (!pixels || exporting) return;

      setExporting(true);

      try {
        const blob =
          file.type === 'image/gif'
            ? await getCroppedGifBlob(file, pixels)
            : await getCroppedImageBlob(imageSrc, pixels, file.type);

        onConfirm(blob);
      } catch {
        toast.error(t('imageCropFailed'));
      } finally {
        setExporting(false);
      }
    }, [imageSrc, file, pixels, exporting, onConfirm, t]);

    return (
      <Dialog open={isOpen}>
        <DialogContent close={close} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('imageCropTitle')}</DialogTitle>
            <DialogDescription>{t('imageCropHint')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative h-72 flex-1 overflow-hidden rounded-md bg-black/80">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={0}
                aspect={aspect}
                cropShape={round ? 'round' : 'rect'}
                showGrid={!round}
                onCropChange={setCrop}
                onCropComplete={handleCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="flex shrink-0 flex-col items-center gap-3">
              <div
                className={
                  round
                    ? 'overflow-hidden rounded-full'
                    : 'overflow-hidden rounded-md'
                }
              >
                <canvas ref={previewRef} className="block max-w-42" />
              </div>
              {file.type === 'image/gif' && (
                <p className="max-w-42 text-center text-xs text-muted-foreground">
                  {t('imageCropGifNote')}
                </p>
              )}
              <div className="w-42">
                <div className="mb-1 text-xs text-muted-foreground">
                  {t('imageCropZoom')}
                </div>
                <Slider
                  min={1}
                  max={3}
                  step={0.1}
                  value={[zoom]}
                  onValueChange={([value]) => setZoom(value ?? 1)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleApply()}
              disabled={!pixels || exporting}
            >
              {t('imageCropApply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ImageCropDialog.displayName = 'ImageCropDialog';

export { ImageCropDialog };
