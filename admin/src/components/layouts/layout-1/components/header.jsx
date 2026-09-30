import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';
import { Link } from 'react-router-dom';
import { toAbsoluteUrl } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  UserAvatar,
  UserDropdownMenu,
} from '@/components/layouts/layout-1/shared/topbar/user-dropdown-menu';
import { SidebarMenu } from './sidebar-menu';

// The template's header also carried a mega menu, a search dialog, a
// notifications sheet, a chat sheet and an apps menu. All five were demo
// pieces filled with made-up content and wired to nothing in this panel, so
// they are no longer rendered. Their files are still under ../shared if one is
// ever built for real.
export function Header() {
  const [isSidebarSheetOpen, setIsSidebarSheetOpen] = useState(false);

  const { pathname } = useLocation();
  const mobileMode = useIsMobile();

  const scrollPosition = useScrollPosition();
  const headerSticky = scrollPosition > 0;

  // Close sheet when route changes
  useEffect(() => {
    setIsSidebarSheetOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        'header fixed top-0 z-10 start-0 flex items-stretch shrink-0 border-b border-transparent bg-background end-0 pe-[var(--removed-body-scroll-bar-size,0px)]',
        headerSticky && 'border-b border-border',
      )}
    >
      <div className="container-fluid flex justify-between items-stretch lg:gap-4">
        {/* HeaderLogo: below lg the sidebar is a sheet, so the logo lives here */}
        <div className="flex lg:hidden items-center gap-2.5">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <img
              src={toAbsoluteUrl('/media/app/splix-logo.svg')}
              className="size-7"
              alt=""
            />
            <span className="text-base font-semibold tracking-tight">
              Splix
            </span>
          </Link>
          {mobileMode && (
            <Sheet
              open={isSidebarSheetOpen}
              onOpenChange={setIsSidebarSheetOpen}
            >
              <SheetTrigger asChild>
                <Button variant="ghost" mode="icon" aria-label="Open menu">
                  <Menu className="text-muted-foreground/70" />
                </Button>
              </SheetTrigger>
              <SheetContent
                className="p-0 gap-0 w-[275px]"
                side="left"
                close={false}
              >
                <SheetHeader className="p-0 space-y-0" />
                <SheetBody className="p-0 overflow-y-auto">
                  <SidebarMenu />
                </SheetBody>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* HeaderTopbar: ms-auto keeps it at the far end on desktop, where the
            logo block above is hidden and nothing else pushes it across. */}
        <div className="flex items-center gap-3 ms-auto">
          <UserDropdownMenu
            trigger={
              <button
                type="button"
                className="rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <UserAvatar />
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}
