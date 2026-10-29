import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { forgetInvite, inviteCodeFromUrl, rememberInvite, rememberedInvite } from './inviteLinks';

const InviteLinkContext = createContext(null);

/**
 * Listens for the app being opened with an invite link and holds the code
 * until something opens the Join screen for it: MainTabs does, the moment it
 * is on screen, which covers every way in.
 *
 *   - signed in, app in the background: the link arrives as an event and the
 *     Join screen opens over whatever was showing.
 *   - signed in, app closed: the link is the launch address, read once here;
 *     the Join screen opens after the splash.
 *   - signed out: the code is kept (and saved, in case the app is closed
 *     while they sign up and verify their email); the Join screen opens once
 *     they are in and their profile is complete.
 *
 * `consume` clears it, so the same link is never opened twice.
 */
export const InviteLinkProvider = ({ children }) => {
  const [pendingCode, setPendingCode] = useState(null);

  const offer = useCallback((code) => {
    if (!code) return;
    setPendingCode(code);
    rememberInvite(code);
  }, []);

  useEffect(() => {
    let active = true;
    // Any code left over from a sign-up that was not finished, then the link
    // this start came from (it wins: it is what the person just tapped).
    rememberedInvite().then((saved) => active && saved && setPendingCode((current) => current ?? saved));
    Linking.getInitialURL()
      .then((url) => active && offer(inviteCodeFromUrl(url)))
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => offer(inviteCodeFromUrl(url)));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [offer]);

  const consume = useCallback(() => {
    setPendingCode(null);
    forgetInvite();
  }, []);

  const value = useMemo(() => ({ pendingCode, consume }), [pendingCode, consume]);
  return <InviteLinkContext.Provider value={value}>{children}</InviteLinkContext.Provider>;
};

export const useInviteLinks = () => {
  const ctx = useContext(InviteLinkContext);
  if (!ctx) throw new Error('useInviteLinks must be used within InviteLinkProvider');
  return ctx;
};
