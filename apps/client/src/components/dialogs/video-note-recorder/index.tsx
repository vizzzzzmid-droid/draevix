import { useDevices } from '@/components/devices-provider/hooks/use-devices';
import { formatMediaPosition } from '@/features/server/voice/helpers';
import { VIDEO_NOTE_FILE_PREFIX } from '@draevix/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@draevix/ui';
import { Circle, RotateCcw, Send, Square, Video } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TVideoNoteRecorderDialogProps = TDialogBaseProps & {
  onConfirm: (file: File) => Promise<void> | void;
  onCancel: () => void;
};

type TRecorderPhase = 'ready' | 'recording' | 'preview';

const MAX_DURATION_SEC = 60;
const RECORD_SIDE_PX = 480;
const RECORD_FPS = 30;
const DEFAULT_DEVICE_ID = 'default';

const pickRecorderMimeType = (): string => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  if (typeof MediaRecorder === 'undefined') return 'video/webm';

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }

  return 'video/webm';
};

const VideoNoteRecorderDialog = memo(
  ({ isOpen, close, onConfirm, onCancel }: TVideoNoteRecorderDialogProps) => {
    const { t } = useTranslation('dialogs');
    const { devices } = useDevices();

    const liveVideoRef = useRef<HTMLVideoElement | null>(null);
    const previewVideoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const rafIdRef = useRef<number | null>(null);
    const tickTimerRef = useRef<number | null>(null);
    const startedAtRef = useRef<number>(0);

    const [phase, setPhase] = useState<TRecorderPhase>('ready');
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [elapsedSec, setElapsedSec] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const stopTimersAndRecorder = useCallback(() => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const rec = recorderRef.current;

      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }

      recorderRef.current = null;
    }, []);

    const stopCameraStream = useCallback(() => {
      stopTimersAndRecorder();

      const stream = cameraStreamRef.current;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }

      setCameraReady(false);
    }, [stopTimersAndRecorder]);

    const startCameraStream = useCallback(async () => {
      setCameraError(null);
      setCameraReady(false);

      try {
        const hasSpecificWebcam =
          devices.webcamId && devices.webcamId !== DEFAULT_DEVICE_ID;
        const hasSpecificMic =
          devices.microphoneId && devices.microphoneId !== DEFAULT_DEVICE_ID;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: hasSpecificWebcam
              ? { ideal: devices.webcamId }
              : undefined,
            width: { ideal: 720 },
            height: { ideal: 720 }
          },
          audio: {
            deviceId: hasSpecificMic
              ? { ideal: devices.microphoneId }
              : undefined,
            echoCancellation: !!devices.echoCancellation,
            autoGainControl: !!devices.autoGainControl
          }
        });

        cameraStreamRef.current = stream;

        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          await liveVideoRef.current.play().catch(() => {});
        }

        setCameraReady(true);
      } catch {
        setCameraError(t('videoNoteCameraError'));
      }
    }, [
      devices.webcamId,
      devices.microphoneId,
      devices.echoCancellation,
      devices.autoGainControl,
      t
    ]);

    useEffect(() => {
      if (!isOpen) return;

      void startCameraStream();

      return () => {
        stopCameraStream();
      };
    }, [isOpen, startCameraStream, stopCameraStream]);

    useEffect(() => {
      return () => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      };
    }, [previewUrl]);

    const handleStopRecording = useCallback(() => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const rec = recorderRef.current;

      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    }, []);

    const handleStartRecording = useCallback(() => {
      const stream = cameraStreamRef.current;
      const video = liveVideoRef.current;

      if (!stream || !video || !cameraReady) return;

      const canvas =
        canvasRef.current ??
        (() => {
          const el = document.createElement('canvas');

          canvasRef.current = el;

          return el;
        })();

      canvas.width = RECORD_SIDE_PX;
      canvas.height = RECORD_SIDE_PX;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        toast.error(t('videoNoteRecordError'));
        return;
      }

      const mirror = !!devices.mirrorOwnVideo;

      const drawFrame = () => {
        const vw = video.videoWidth || RECORD_SIDE_PX;
        const vh = video.videoHeight || RECORD_SIDE_PX;
        const side = Math.min(vw, vh);
        const sx = (vw - side) / 2;
        const sy = (vh - side) / 2;

        ctx.save();

        if (mirror) {
          ctx.translate(RECORD_SIDE_PX, 0);
          ctx.scale(-1, 1);
        }

        ctx.drawImage(
          video,
          sx,
          sy,
          side,
          side,
          0,
          0,
          RECORD_SIDE_PX,
          RECORD_SIDE_PX
        );
        ctx.restore();

        rafIdRef.current = window.requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const canvasStream = canvas.captureStream(RECORD_FPS);
      const composedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...stream.getAudioTracks()
      ]);

      const mimeType = pickRecorderMimeType();
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(composedStream, {
          mimeType,
          videoBitsPerSecond: 1_800_000
        });
      } catch {
        recorder = new MediaRecorder(composedStream);
      }

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        canvasStream.getTracks().forEach((track) => track.stop());

        const finalMime = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });

        if (blob.size === 0) {
          toast.error(t('videoNoteRecordError'));
          setPhase('ready');
          return;
        }

        const url = URL.createObjectURL(blob);

        setRecordedBlob(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPhase('preview');
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setPhase('recording');
      recorder.start(200);

      tickTimerRef.current = window.setInterval(() => {
        const sec = (Date.now() - startedAtRef.current) / 1000;

        if (sec >= MAX_DURATION_SEC) {
          setElapsedSec(MAX_DURATION_SEC);
          handleStopRecording();
          return;
        }

        setElapsedSec(sec);
      }, 100);
    }, [cameraReady, devices.mirrorOwnVideo, handleStopRecording, t]);

    const handleRetake = useCallback(() => {
      setRecordedBlob(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setElapsedSec(0);
      setPhase('ready');

      if (!cameraStreamRef.current) {
        void startCameraStream();
      } else if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = cameraStreamRef.current;
        void liveVideoRef.current.play().catch(() => {});
      }
    }, [startCameraStream]);

    const handleSend = useCallback(async () => {
      if (!recordedBlob || sending) return;

      setSending(true);

      try {
        const file = new File(
          [recordedBlob],
          `${VIDEO_NOTE_FILE_PREFIX}${Date.now()}.webm`,
          { type: 'video/webm' }
        );

        stopCameraStream();
        await onConfirm(file);
      } finally {
        setSending(false);
      }
    }, [recordedBlob, sending, stopCameraStream, onConfirm]);

    const handleCancelClick = useCallback(() => {
      stopCameraStream();
      onCancel();
      close();
    }, [stopCameraStream, onCancel, close]);

    const progressRatio = Math.min(1, elapsedSec / MAX_DURATION_SEC);

    return (
      <Dialog open={isOpen}>
        <DialogContent close={handleCancelClick} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="size-4" />
              {t('videoNoteTitle')}
            </DialogTitle>
            <DialogDescription>{t('videoNoteDesc')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <div className="relative aspect-square w-72 max-w-full overflow-hidden rounded-2xl border-2 border-primary/50 bg-black/90 shadow-lg">
              {phase !== 'preview' ? (
                <video
                  ref={liveVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`size-full object-cover ${
                    devices.mirrorOwnVideo ? '-scale-x-100' : ''
                  } ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                />
              ) : (
                previewUrl && (
                  <video
                    ref={previewVideoRef}
                    src={previewUrl}
                    autoPlay
                    loop
                    playsInline
                    controls
                    className="size-full object-cover"
                  />
                )
              )}

              {phase !== 'preview' && !cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  {t('videoNoteStartingCamera')}
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-destructive">
                  {cameraError}
                </div>
              )}

              {phase === 'recording' && (
                <>
                  <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur-xs">
                    <span className="size-2 animate-pulse rounded-full bg-red-500" />
                    {formatMediaPosition(elapsedSec)} /{' '}
                    {formatMediaPosition(MAX_DURATION_SEC)}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-white/15">
                    <div
                      className="h-full bg-red-500 transition-[width] duration-100"
                      style={{ width: `${progressRatio * 100}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleCancelClick}
              disabled={sending}
            >
              {t('cancel')}
            </Button>

            <div className="flex items-center gap-2">
              {phase === 'ready' && (
                <Button
                  onClick={handleStartRecording}
                  disabled={!cameraReady || !!cameraError}
                  className="gap-1.5"
                >
                  <Circle className="size-3.5 fill-current text-red-500" />
                  {t('videoNoteStartRecord')}
                </Button>
              )}

              {phase === 'recording' && (
                <Button
                  variant="destructive"
                  onClick={handleStopRecording}
                  className="gap-1.5"
                >
                  <Square className="size-3.5 fill-current" />
                  {t('videoNoteStopRecord')}
                </Button>
              )}

              {phase === 'preview' && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleRetake}
                    disabled={sending}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    {t('videoNoteRetake')}
                  </Button>
                  <Button
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="gap-1.5"
                  >
                    <Send className="size-3.5" />
                    {t('videoNoteSend')}
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

VideoNoteRecorderDialog.displayName = 'VideoNoteRecorderDialog';

export { VideoNoteRecorderDialog };
