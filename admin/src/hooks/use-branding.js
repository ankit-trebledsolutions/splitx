import { useEffect } from 'react';
import { toAbsoluteUrl } from '@/lib/helpers';
import { useGetPublicBrandingQuery } from '@/features/branding/brandingApi';

// The built-in look, until the server says otherwise (and on a server from
// before branding existed). Under /brand, not /media: everything under
// /media (and /api, /uploads) is passed to the API, by the Vite dev server
// and by the Nginx in front of the deployed panel alike, so a panel asset
// there is never served. That was why the sidebar logo never showed.
export const DEFAULT_APP_NAME = 'Splix';
export const DEFAULT_LOGO = '/brand/splix-logo.svg';

/**
 * The app's name and logo for the panel's own chrome: the sidebar, the
 * header, the loader and the sign-in page. Public endpoint, so it works
 * before anyone is signed in. Until it answers, and if it never does, the
 * panel is Splix with the Splix mark, as it always was.
 */
export function useBranding() {
  const { data } = useGetPublicBrandingQuery();
  const appName = data?.appName?.trim() || DEFAULT_APP_NAME;
  const logoUrl = data?.logoUrl || toAbsoluteUrl(DEFAULT_LOGO);
  return { appName, logoUrl, isDefaultLogo: !data?.logoUrl };
}

// Keeps the browser tab's icon in step with the logo, and resets it when the
// logo is removed. Called once, from the layout.
export function useBrandingFavicon() {
  const { logoUrl } = useBranding();
  useEffect(() => {
    const link = document.querySelector('link[rel="icon"]');
    if (link && link.href !== logoUrl) link.href = logoUrl;
  }, [logoUrl]);
}
