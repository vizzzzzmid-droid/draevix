import { Button, Tooltip } from '@draevix/ui';
import { DollarSign } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const DONATE_URL = 'https://donatex.gg/donate/vizzzzz';

const DonateButton = memo(() => {
  const { t } = useTranslation('topbar');

  const handleDonate = useCallback(() => {
    window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDonate}
      className="h-7 px-2 transition-all duration-200 ease-in-out"
    >
      <Tooltip content={t('donate')} asChild={false}>
        <DollarSign className="h-4 w-4 transition-all duration-200 ease-in-out" />
      </Tooltip>
    </Button>
  );
});

DonateButton.displayName = 'DonateButton';

export { DonateButton };
