import { useUserById } from '@/features/server/users/hooks';
import { getWatchPositionSec } from '@/features/server/voice/helpers';
import { useWatchState } from '@/features/server/voice/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { uploadFile } from '@/helpers/upload-file';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { Button } from '@draevix/ui';
import { Pause, Play, Square, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactPlayer from 'react-player';
import { toast } from 'sonner';

type TWatchPartyPanelProps = {
  channelId: number;
};

// events only arrive on change, so a local player further than this from the
// shared position gets snapped to it instead of drifting apart forever
const POSITION_SYNC_THRESHOLD_SEC = 3;

const WatchPartyPanel = memo(({ channelId }: TWatchPartyPanelProps) => {
  const { t } = useTranslation();
  const watch = useWatchState(channelId);
  const controller = useUserById(watch?.controllerUserId ?? -1);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const seekingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!watch) {
      setDisplayPosition(0);
      setDuration(0);

      return;
    }

    if (seekingRef.current) return;

    const player = playerRef.current;
    const target = getWatchPositionSec(watch);

    if (player) {
      const current = player.currentTime || 0;

      if (Math.abs(target - current) > POSITION_SYNC_THRESHOLD_SEC) {
        player.currentTime = target;
      }
    }

    setDisplayPosition(target);
  }, [watch]);

  const handlePlay = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;
    const trpc = getTRPCClient();

    try {
      await trpc.voice.playWatch.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handlePause = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;
    const trpc = getTRPCClient();

    try {
      await trpc.voice.pauseWatch.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handleSeekCommit = useCallback(async () => {
    seekingRef.current = false;
    const trpc = getTRPCClient();

    try {
      await trpc.voice.seekWatch.mutate({ positionSec: displayPosition });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handleSeekChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      seekingRef.current = true;
      setDisplayPosition(Number(event.target.value));
    },
    []
  );

  const handleStop = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.stopWatch.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [t]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];

      event.target.value = '';

      if (!picked) return;

      setUploading(true);

      try {
        const temp = await uploadFile(picked);

        if (!temp) return;

        const trpc = getTRPCClient();
        const { fileId } = await trpc.files.keepUpload.mutate({
          tempFileId: temp.id
        });

        await trpc.voice.selectWatchFile.mutate({ fileId });
        toast.success(t('watchPartyStarted'));
      } catch (error) {
        toast.error(getTrpcError(error, t('failedWatchTogether')));
      } finally {
        setUploading(false);
      }
    },
    [t]
  );

  const handleTimeUpdate = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!seekingRef.current) {
        setDisplayPosition(event.currentTarget.currentTime);
      }
    },
    []
  );

  const handleLoadedMetadata = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      setDuration(event.currentTarget.duration);
    },
    []
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('watchPartyTitle')}</span>
        {watch && (
          <span className="text-xs text-muted-foreground">
            {t('watchControlledBy', {
              name: controller ? getRenderedUsername(controller) : '?'
            })}
          </span>
        )}
      </div>
      {!watch && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFilePicked}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            <Upload className="h-4 w-4" />
            {t('watchUploadMovie')}
          </Button>
        </div>
      )}
      {watch && (
        <>
          <ReactPlayer
            ref={playerRef}
            src={getFileUrl(watch.file)}
            playing={watch.playing}
            width="100%"
            height="auto"
            style={{ aspectRatio: '16 / 9', colorScheme: 'dark' }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />
          <div className="flex items-center gap-2">
            {watch.playing ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePause}
                title={t('watchPause')}
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePlay}
                title={t('watchPlay')}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.1}
              value={Math.min(displayPosition, Math.max(duration, 0.01))}
              onChange={handleSeekChange}
              onPointerUp={handleSeekCommit}
              onKeyUp={handleSeekCommit}
              onBlur={handleSeekCommit}
              aria-label={t('watchSeek')}
              className="flex-1"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleStop}
              title={t('watchStop')}
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

export { WatchPartyPanel };
