import { ChevronFirst } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toAbsoluteUrl } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useLayout } from './context';

export function SidebarHeader() {
  const { sidebarCollapse, setSidebarCollapse } = useLayout();

  const handleToggleClick = () => {
    setSidebarCollapse(!sidebarCollapse);
  };

  return (
    <div className="sidebar-header hidden lg:flex items-center relative justify-between px-3 lg:px-6 shrink-0">
      {/* The mark stays when the sidebar is collapsed; the name carries
          .default-logo, which the layout's CSS hides in that state. Text
          rather than the wordmark image, so it follows the theme's colour. */}
      <Link to="/" className="flex items-center gap-2.5">
        <img
          src={toAbsoluteUrl('/media/app/splix-logo.svg')}
          className="size-7 max-w-none shrink-0"
          alt=""
        />
        <span className="default-logo text-lg font-semibold tracking-tight text-foreground">
          Splix
        </span>
      </Link>
      <Button
        onClick={handleToggleClick}
        size="sm"
        mode="icon"
        variant="outline"
        className={cn(
          'size-7 absolute start-full top-2/4 rtl:translate-x-2/4 -translate-x-2/4 -translate-y-2/4',
          sidebarCollapse ? 'ltr:rotate-180' : 'rtl:rotate-180',
        )}
      >
        <ChevronFirst className="size-4!" />
      </Button>
    </div>
  );
}
