import { SettingsSection } from '@/components/server-screens/settings-shell/section';
import {
  useTheme,
  type Theme
} from '@/components/theme-provider/theme-context';
import { PRESET_THEMES, type TPresetThemeId } from '@/helpers/themes';
import { cn } from '@/lib/utils';
import { Group } from '@draevix/ui';
import { Check } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type TThemeOption = {
  id: Theme;
  label: string;
  preview: { background: string; primary: string; accent: string };
};

const BUILTIN_OPTIONS: Omit<TThemeOption, 'label'>[] = [
  {
    id: 'light',
    preview: { background: '#ffffff', primary: '#18181b', accent: '#f4f4f5' }
  },
  {
    id: 'dark',
    preview: { background: '#09090b', primary: '#fafafa', accent: '#27272a' }
  },
  {
    id: 'system',
    preview: { background: '#71717a', primary: '#fafafa', accent: '#27272a' }
  }
];

const Appearance = memo(() => {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  const handlePick = useCallback(
    (id: Theme) => {
      setTheme(id);
    },
    [setTheme]
  );

  const options: TThemeOption[] = [
    ...BUILTIN_OPTIONS.map((option) => ({
      ...option,
      label: t(`theme${option.id[0]!.toUpperCase()}${option.id.slice(1)}`)
    })),
    ...PRESET_THEMES.map((preset) => ({
      id: preset.id as TPresetThemeId,
      label: t(
        `theme${preset.id
          .split('-')
          .map((part) => part[0]!.toUpperCase() + part.slice(1))
          .join('')}`
      ),
      preview: {
        background: preset.vars['--background'] ?? '#000',
        primary: preset.vars['--primary'] ?? '#fff',
        accent: preset.vars['--accent'] ?? '#888'
      }
    }))
  ];

  return (
    <SettingsSection
      title={t('appearanceTitle')}
      description={t('appearanceDesc')}
    >
      <Group label={t('themeLabel')} description={t('themeDesc')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const active = theme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePick(option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 text-left transition',
                  active
                    ? 'border-primary ring-2 ring-primary/60'
                    : 'border-border/50 hover:border-primary/60'
                )}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center gap-1 rounded"
                  style={{ background: option.preview.background }}
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ background: option.preview.primary }}
                  />
                  <span
                    className="size-3 rounded-full"
                    style={{ background: option.preview.accent }}
                  />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="truncate text-sm">{option.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      </Group>
    </SettingsSection>
  );
});

export { Appearance };
