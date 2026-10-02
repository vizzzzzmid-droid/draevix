import { useDevices } from '@/components/devices-provider/hooks/use-devices';
import { isTauri } from '@/helpers/get-file-url';
import { cn } from '@/lib/utils';
import type { TScreenShareSource } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Label,
  Switch
} from '@draevix/ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TDialogBaseProps } from '../types';

type TScreenShareSourceDialogProps = TDialogBaseProps & {
  onPick?: (source: TScreenShareSource, shareAudio: boolean) => void;
};

type TSourceOptionProps = {
  entry: TScreenShareSource;
  title: string;
  hint: string;
  selected: boolean;
  onSelect: (entry: TScreenShareSource) => void;
};

const SourceOption = memo(
  ({ entry, title, hint, selected, onSelect }: TSourceOptionProps) => {
    const handleClick = useCallback(() => {
      onSelect(entry);
    }, [entry, onSelect]);

    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'rounded-md border px-3 py-2 text-left text-sm transition-colors',
          selected
            ? 'border-primary bg-primary/10'
            : 'border-border/50 hover:bg-muted/40'
        )}
      >
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </button>
    );
  }
);

const ScreenShareSourceDialog = memo(
  ({ isOpen, close, onPick }: TScreenShareSourceDialogProps) => {
    const { t } = useTranslation('dialogs');
    const { devices, saveDevices } = useDevices();
    const [source, setSource] = useState<TScreenShareSource>(() =>
      isTauri() ? 'window' : 'tab'
    );
    const [shareAudio, setShareAudio] = useState(devices.shareSystemAudio);

    const showTabOption = !isTauri();

    const handleToggleAudio = useCallback(() => {
      setShareAudio((previous) => !previous);
    }, []);

    const handleStart = useCallback(() => {
      const audio = source === 'tab' ? true : shareAudio;

      saveDevices({ ...devices, shareSystemAudio: shareAudio });
      close();
      onPick?.(source, audio);
    }, [devices, saveDevices, shareAudio, source, close, onPick]);

    return (
      <AlertDialog open={isOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('screenShareTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('screenShareDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            {showTabOption && (
              <SourceOption
                entry="tab"
                title={t('screenShareTab')}
                hint={t('screenShareTabHint')}
                selected={source === 'tab'}
                onSelect={setSource}
              />
            )}
            <SourceOption
              entry="window"
              title={t('screenShareWindow')}
              hint={t('screenShareWindowHint')}
              selected={source === 'window'}
              onSelect={setSource}
            />
            <SourceOption
              entry="screen"
              title={t('screenShareScreen')}
              hint={t('screenShareScreenHint')}
              selected={source === 'screen'}
              onSelect={setSource}
            />
            {source !== 'tab' && (
              <div
                className="flex items-center gap-2 pt-1 w-fit cursor-pointer"
                onClick={handleToggleAudio}
              >
                <Switch checked={shareAudio} />
                <Label className="text-sm cursor-pointer">
                  {t('screenShareAudio')}
                </Label>
              </div>
            )}
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart}>
              {t('screenShareStart')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
);

export { ScreenShareSourceDialog };
