import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { decompressFrames, parseGIF } from 'gifuct-js';
import type { TCropPixels } from './image-crop';

// output is capped so re-encoding stays fast and the result fits the
// storage size limits even for long animations
const MAX_GIF_DIMENSION = 512;
// parsed, not decoded: anything bigger uploads untouched instead of opening
// the crop dialog, same as before
const MAX_GIF_FRAMES = 250;
const MAX_GIF_FILE_BYTES = 25 * 1024 * 1024;
const MAX_GIF_SIDE = 2000;
const ALPHA_THRESHOLD = 128;

// cheap header-only probe: no pixel decoding happens here
const isCroppableGif = async (file: File): Promise<boolean> => {
  try {
    if (file.size > MAX_GIF_FILE_BYTES) return false;

    const gif = parseGIF(await file.arrayBuffer());
    const frames = gif.frames.filter((frame) => 'image' in frame);

    if (frames.length === 0 || frames.length > MAX_GIF_FRAMES) return false;

    const { width = 0, height = 0 } = gif.lsd ?? {};

    return (
      width > 0 && height > 0 && width <= MAX_GIF_SIDE && height <= MAX_GIF_SIDE
    );
  } catch {
    return false;
  }
};

// crops an animated gif frame by frame, compositing each frame exactly like
// a player would (disposal 2 clears, disposal 3 restores), then re-encodes.
// transparency survives via a reserved palette slot, delays pass through.
const getCroppedGifBlob = async (
  file: File,
  crop: TCropPixels
): Promise<Blob> => {
  const gif = parseGIF(await file.arrayBuffer());
  const fullWidth = gif.lsd.width;
  const fullHeight = gif.lsd.height;
  const frames = decompressFrames(gif, true);

  if (frames.length === 0) {
    throw new Error('No frames in gif');
  }

  const scale = Math.min(
    1,
    MAX_GIF_DIMENSION / Math.max(crop.width, crop.height)
  );
  const outWidth = Math.max(1, Math.round(crop.width * scale));
  const outHeight = Math.max(1, Math.round(crop.height * scale));

  const composite = document.createElement('canvas');
  composite.width = fullWidth;
  composite.height = fullHeight;
  const compositeCtx = composite.getContext('2d', { willReadFrequently: true });

  const patchCanvas = document.createElement('canvas');
  const patchCtx = patchCanvas.getContext('2d');

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d');

  if (!compositeCtx || !patchCtx || !outCtx) {
    throw new Error('Failed to get canvas context');
  }

  const encoder = GIFEncoder();
  let snapshot: ImageData | null = null;
  let prevDisposal = 0;
  let prevRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;

  for (const frame of frames) {
    if (prevDisposal === 2 && prevRect) {
      compositeCtx.clearRect(
        prevRect.left,
        prevRect.top,
        prevRect.width,
        prevRect.height
      );
    } else if (prevDisposal === 3 && snapshot) {
      compositeCtx.putImageData(snapshot, 0, 0);
    }

    if (frame.disposalType === 3) {
      snapshot = compositeCtx.getImageData(0, 0, fullWidth, fullHeight);
    }

    patchCanvas.width = frame.dims.width;
    patchCanvas.height = frame.dims.height;
    patchCtx.putImageData(
      new ImageData(frame.patch, frame.dims.width, frame.dims.height),
      0,
      0
    );
    compositeCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

    prevDisposal = frame.disposalType;
    prevRect = {
      left: frame.dims.left,
      top: frame.dims.top,
      width: frame.dims.width,
      height: frame.dims.height
    };

    outCtx.clearRect(0, 0, outWidth, outHeight);
    outCtx.drawImage(
      composite,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outWidth,
      outHeight
    );

    const data = outCtx.getImageData(0, 0, outWidth, outHeight).data;
    const palette = quantize(data, 255);
    const transparentIndex = palette.length;
    palette.push([0, 0, 0]);

    const indexed = applyPalette(data, palette);
    let hasTransparency = false;

    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < ALPHA_THRESHOLD) {
        indexed[i >> 2] = transparentIndex;
        hasTransparency = true;
      }
    }

    encoder.writeFrame(indexed, outWidth, outHeight, {
      palette,
      transparent: hasTransparency,
      transparentIndex,
      delay: frame.delay
    });
  }

  encoder.finish();

  return new Blob([encoder.bytes()], { type: 'image/gif' });
};

export { getCroppedGifBlob, isCroppableGif };
