'use client';

import { useBranding } from '@/hooks/use-branding';

export function ScreenLoader() {
  const { logoUrl } = useBranding();
  return (
    <div className="flex flex-col items-center gap-2 justify-center fixed inset-0 z-50 transition-opacity duration-700 ease-in-out">
      <img className="h-[30px] max-w-none object-contain" src={logoUrl} alt="logo" />

      <div className="text-muted-foreground font-medium text-sm">
        Loading...
      </div>
    </div>
  );
}
