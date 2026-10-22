import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  amountTone,
  featureOf,
  formatSignedCredits,
  splitOf,
  typeOf,
} from '@/features/wallet/walletLabels';

// The pieces of a history row, shared by the activity list on the Wallet page
// and the Credits card on a person, so a grant looks the same in both.

export const TypeBadge = ({ type }) => {
  const look = typeOf(type);
  return (
    <Badge variant={look.variant} appearance="light">
      {look.label}
    </Badge>
  );
};

export const FeatureLabel = ({ feature }) => {
  const look = featureOf(feature);
  return look ? (
    <span className="text-sm">{look.label}</span>
  ) : (
    <span className="text-sm text-muted-foreground">—</span>
  );
};

// Signed and coloured. The tooltip says which pot it came out of or went into.
export const Amount = ({ row, className }) => (
  <span
    className={cn(
      'font-semibold tabular-nums',
      amountTone(row.amount),
      className,
    )}
    title={splitOf(row)}
  >
    {formatSignedCredits(row.amount)}
  </span>
);

// Which admin did it. Bonuses, top-ups, spends and refunds are the app's own.
export const ByWhom = ({ by }) =>
  by ? (
    <span className="text-sm">{by.name || 'A removed admin'}</span>
  ) : (
    <span className="text-sm text-muted-foreground">Automatic</span>
  );
