// gifenc ships without its own types: the surface used by gif-crop only.
declare module 'gifenc' {
  export type GifencColor =
    | [number, number, number]
    | [number, number, number, number];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444';
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    }
  ): GifencColor[];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifencColor[],
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
  ): Uint8Array;

  export type GifFrameOptions = {
    palette?: GifencColor[];
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  };

  export type GifEncoder = {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GifFrameOptions
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    reset(): void;
  };

  export function GIFEncoder(opts?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoder;
}
