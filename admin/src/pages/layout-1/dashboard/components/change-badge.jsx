import { Badge } from '@/components/ui/badge';
import {
  changeMultiple,
  changePercent,
  formatChange,
  formatNumber,
} from './format';

// Green is for more and red for fewer. No change at all is neither, so it
// wears the neutral badge and does not pass for good news.
const changeVariant = (change) => {
  if (change > 0) return 'success';
  if (change < 0) return 'destructive';
  return 'secondary';
};

// How this period compares with the one before it. Nothing is shown when the
// earlier period had none: there is no honest percentage for growth from zero.
export default function ChangeBadge({ current, previous, days }) {
  const change = changePercent(current, previous);
  if (change === null) return null;

  const multiple = changeMultiple(current, previous);

  return (
    <Badge
      size="sm"
      variant={changeVariant(change)}
      appearance="light"
      title={
        multiple === null
          ? `Compared with the ${days} days before`
          : `${formatNumber(multiple)} times the ${days} days before`
      }
    >
      {formatChange(current, previous)}
    </Badge>
  );
}
