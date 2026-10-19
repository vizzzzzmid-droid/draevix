import { FullScreenImage } from '@/components/fullscreen-image/content';
import { memo, useCallback, useState } from 'react';
import { OverrideLayout } from './layout';
import { LinkOverride } from './link';

type TImageOverrideProps = {
  src: string;
  alt?: string;
  title?: string;
};

const ImageOverride = memo(({ src, alt }: TImageOverrideProps) => {
  const [error, setError] = useState(false);

  const onError = useCallback(() => {
    setError(true);
  }, []);

  if (error) return null;

  return (
    <OverrideLayout>
      <FullScreenImage
        src={src}
        alt={alt}
        onError={onError}
        loading="lazy"
        className="max-w-full max-h-75 object-contain object-left w-fit"
      />

      <LinkOverride link={src} label="Open in new tab" />
    </OverrideLayout>
  );
});

export { ImageOverride };
