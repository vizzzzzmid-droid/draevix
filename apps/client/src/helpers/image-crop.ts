// Pure canvas helpers for the image-crop dialog: no react, no store.

type TCropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// the exported crop never exceeds this on its long side: keeps avatars and
// banners well under the storage size limits without visible quality loss
const MAX_CROP_SIZE = 1024;

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });

// exports the cropped rect at natural resolution (downscaled past the cap).
// jpeg keeps quality 0.92, everything else goes png to preserve transparency
const getCroppedImageBlob = async (
  imageSrc: string,
  pixels: TCropPixels,
  mimeType: string
): Promise<Blob> => {
  const image = await loadImageElement(imageSrc);
  const scale = Math.min(
    1,
    MAX_CROP_SIZE / Math.max(pixels.width, pixels.height)
  );
  const width = Math.max(1, Math.round(pixels.width * scale));
  const height = Math.max(1, Math.round(pixels.height * scale));

  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to get canvas context');
  }

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

  const outMime = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outMime, 0.92)
  );

  if (!blob) {
    throw new Error('Failed to export cropped image');
  }

  return blob;
};

const croppedFileName = (originalName: string, mimeType: string): string => {
  const base = originalName.replace(/\.[^.]*$/, '') || 'image';
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

  return `${base}-cropped.${extension}`;
};

export {
  MAX_CROP_SIZE,
  croppedFileName,
  getCroppedImageBlob,
  loadImageElement,
  type TCropPixels
};
