/**
 * The page behind a group invite link (https://<host>/join/<code>), for a
 * phone that does not have the app, or has a build from before App Links, or
 * for a laptop. A phone with the app never sees it: Android opens the app
 * straight to its Join screen (see mobile/app.json intentFilters).
 *
 * One self-contained HTML document: the group, who invited them, how many
 * are in, and two ways on:
 *   - "Open in <app>": an Android intent link. Installed, the app opens on
 *     the Join screen; not installed, Chrome goes to the fallback instead.
 *   - "Get the app": the newest APK, from the App Updates settings.
 *     TODO(store launch): once the app is on the Play Store this becomes
 *     https://play.google.com/store/apps/details?id=<package>, and the
 *     intent link's fallback the same, so a phone without the app lands in
 *     the store. There is no store listing yet, so for now it is the APK.
 */
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const GROUP_TYPE_LABEL = {
  trip: 'trip',
  home: 'home',
  couple: 'couple',
  event: 'event',
  other: 'group',
};

// The Android intent link: opens the app on splix://join/<code> when it is
// installed, otherwise sends Chrome to `fallback`.
const intentLink = ({ code, androidPackage, fallback }) =>
  `intent://join/${encodeURIComponent(code)}#Intent;scheme=splix;package=${androidPackage};` +
  `S.browser_fallback_url=${encodeURIComponent(fallback)};end`;

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #060D11; color: #E6F1F5; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px 16px; }
  .card { width: 100%; max-width: 420px; background: #0E171D; border: 1px solid #1C2A33; border-radius: 20px; padding: 28px 24px; text-align: center; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; color: #8A97A6; font-size: 14px; font-weight: 600; letter-spacing: .4px; }
  .brand img { width: 28px; height: 28px; border-radius: 50%; object-fit: contain; }
  .eyebrow { margin: 26px 0 6px; color: #8A97A6; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 800; overflow-wrap: anywhere; }
  .meta { margin: 10px 0 0; color: #B7C3CC; font-size: 14px; }
  .desc { margin: 14px 0 0; color: #8A97A6; font-size: 14px; }
  .actions { display: grid; gap: 10px; margin-top: 26px; }
  .btn { display: block; padding: 14px 16px; border-radius: 12px; font-weight: 700; text-decoration: none; }
  .btn-primary { color: #04121C; background: linear-gradient(90deg, #4A8CFF, #00E5A0); }
  .btn-secondary { color: #E6F1F5; background: #15212A; border: 1px solid #243440; }
  .hidden { display: none; }
  .code { margin-top: 22px; color: #8A97A6; font-size: 13px; }
  .code b { display: inline-block; margin-left: 6px; padding: 4px 10px; border-radius: 8px; background: #15212A; color: #00E5A0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 1.5px; }
  .foot { margin: 22px 0 0; color: #5F6D79; font-size: 12px; }
`;

const shell = ({ title, description, appName, logoUrl, nonce, body, script = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="website">
${logoUrl ? `<meta property="og:image" content="${escape(logoUrl)}">` : ''}
<style nonce="${nonce}">${styles}</style>
</head>
<body>
<main class="card">
  <div class="brand">${logoUrl ? `<img src="${escape(logoUrl)}" alt="">` : ''}<span>${escape(appName)}</span></div>
  ${body}
</main>
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body>
</html>`;

/**
 * invite       what previewInvite returned, or null when the code is unknown
 * code         the code as it appeared in the address
 * appName/logoUrl  from the branding settings
 * link         this page's own address, for the intent link's fallback
 * downloadUrl  the newest Android build (App Updates), or ''
 * androidPackage, nonce
 */
const renderJoinPage = ({ invite, code, appName, logoUrl, link, downloadUrl, androidPackage, nonce }) => {
  if (!invite) {
    return shell({
      title: `Invite not found · ${appName}`,
      description: `This ${appName} invite link is not valid.`,
      appName,
      logoUrl,
      nonce,
      body: `
  <p class="eyebrow">Invite link</p>
  <h1>This invite isn’t valid</h1>
  <p class="meta">The link may be incomplete, or the group may have been deleted. Ask the person who sent it for a new one.</p>
  <div class="actions">${downloadUrl ? `<a class="btn btn-secondary" href="${escape(downloadUrl)}">Get ${escape(appName)}</a>` : ''}</div>`,
    });
  }

  const { group, invitedBy } = invite;
  const kind = GROUP_TYPE_LABEL[group.groupType] ?? GROUP_TYPE_LABEL.other;
  const members = plural(group.memberCount, 'member');
  const where = group.location ? ` · ${group.location}` : '';
  const title = `Join “${group.name}” on ${appName}`;
  const description = `${invitedBy ? `${invitedBy.name} invited you to` : 'You are invited to'} a ${kind} with ${members}.`;
  // Without the app, "Open" lands back here; with a store listing it lands in the store.
  const fallback = downloadUrl || link;
  const openHref = intentLink({ code: invite.code, androidPackage, fallback });

  return shell({
    title,
    description,
    appName,
    logoUrl,
    nonce,
    body: `
  <p class="eyebrow">${escape(invitedBy ? `${invitedBy.name} invited you` : 'You are invited')}</p>
  <h1>${escape(group.name)}</h1>
  <p class="meta">${escape(`${members}${where}`)}</p>
  ${group.description ? `<p class="desc">${escape(group.description)}</p>` : ''}
  <div class="actions">
    <a id="open" class="btn btn-primary hidden" href="${escape(openHref)}">Open in ${escape(appName)}</a>
    ${downloadUrl ? `<a id="get" class="btn btn-secondary" href="${escape(downloadUrl)}">Get ${escape(appName)} for Android</a>` : ''}
  </div>
  <p class="code">Or enter the code in the app:<b>${escape(invite.code)}</b></p>
  <p class="foot">${escape(appName)} is on Android for now. Open this link on your phone to join.</p>`,
    // The intent link only means something to Android; elsewhere the button
    // would do nothing, so it is only shown there.
    script: `if (/android/i.test(navigator.userAgent)) { document.getElementById('open').classList.remove('hidden'); }`,
  });
};

module.exports = { renderJoinPage, intentLink, escape };
