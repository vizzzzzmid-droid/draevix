import { cn } from '@draevix/ui';
import { memo, useState } from 'react';

type TVideoPlayerProps = {
  url: string;
  className?: string;
};

const VideoPlayer = memo(({ url, className }: TVideoPlayerProps) => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className={cn('aspect-video w-150 max-w-full', className)}>
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="h-full w-full"
      />
    </div>
  );
});

export { VideoPlayer };
