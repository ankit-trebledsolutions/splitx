import { Layout, LayoutGrid, Settings, Shield } from 'lucide-react';
import { PERMISSIONS, ROLES } from '@/lib/permissions';

// The live navigation. Only entries that lead to a routed page belong here —
// the template shipped ~1,100 lines of demo entries pointing at pages this
// panel does not have, which rendered as a menu full of dead links.
//
// Nothing was thrown away: the full original is kept verbatim next to this file
// as menu-template-reference.jsx. When a module is ported, copy its entry
// across rather than writing a new one, so icons and wording stay consistent.
//
// `permission` / `anyPermissions` / `roles` hide an entry the signed-in admin
// cannot use. That is a courtesy for them, never a security control — the
// server decides.

export const MENU_SIDEBAR = [
  {
    title: 'Dashboard',
    icon: LayoutGrid,
    path: '/',
  },
  {
    title: 'User Management',
    icon: Shield,
    permission: PERMISSIONS.USER_MANAGEMENT,
    children: [
      { title: 'Users', path: '/users' },
      { title: 'Co-Admins', path: '/users/co-admins' },
    ],
  },
  {
    title: 'Manage CMS',
    icon: Layout,
    // Carousels join this list when they are ported.
    anyPermissions: [PERMISSIONS.EMAIL_TEMPLATE],
    children: [
      {
        title: 'Email Templates',
        path: '/manage-cms/email-templates',
        permission: PERMISSIONS.EMAIL_TEMPLATE,
      },
    ],
  },
  {
    title: 'General Settings',
    icon: Settings,
    // Owners only, and not a permission a co-admin can be given: this is where
    // the API keys are. App, Theme, Email, SEO and System join this list when
    // they are ported.
    roles: [ROLES.SUPER_ADMIN],
    children: [
      {
        title: 'Third-Party APIs',
        path: '/general-settings/third-party-apis',
      },
    ],
  },
];

// The template's mega menus navigate its demo store, profile and network
// pages, none of which exist here. Left empty rather than removed so the header
// components that read them keep working untouched; the originals are in
// menu-template-reference.jsx if a mega menu is ever wanted.
export const MENU_MEGA = [];
export const MENU_MEGA_MOBILE = [];
