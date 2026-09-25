import { LayoutGrid, Shield } from 'lucide-react';
import { PERMISSIONS } from '@/lib/permissions';

// The live navigation. Only entries that lead to a routed page belong here —
// the template shipped ~1,100 lines of demo entries pointing at pages this
// panel does not have, which rendered as a menu full of dead links.
//
// Nothing was thrown away: the full original is kept verbatim next to this file
// as menu-template-reference.jsx. When a module is ported, copy its entry
// across rather than writing a new one, so icons and wording stay consistent.
//
// `permission` / `anyPermissions` hide an entry the signed-in admin cannot use.
// That is a courtesy for them, never a security control — the server decides.

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
];

// The template's mega menus navigate its demo store, profile and network
// pages, none of which exist here. Left empty rather than removed so the header
// components that read them keep working untouched; the originals are in
// menu-template-reference.jsx if a mega menu is ever wanted.
export const MENU_MEGA = [];
export const MENU_MEGA_MOBILE = [];
