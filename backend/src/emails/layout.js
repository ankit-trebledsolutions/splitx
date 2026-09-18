/**
 * The one frame every Splix email is sent in, matching the app's dark theme.
 *
 * Email clients are not browsers: no flexbox, no external CSS, patchy support
 * for gradients and rounded corners. So this is tables with inline styles, and
 * every gradient has a solid `bgcolor` underneath for clients (Outlook) that
 * ignore it. Keep new emails to the helpers below and they will all match.
 */

// Mirrors mobile/src/theme — change both if the brand colours change.
const theme = {
  page: '#05070A',
  card: '#0E1014',
  raised: '#161A20',
  border: '#232932',
  text: '#F4F7FA',
  muted: '#8A97A6',
  accent: '#00C4D0',
  gradient: 'linear-gradient(135deg, #4A8CFF 0%, #00E5A0 100%)',
  onAccent: '#04121C',
  danger: '#F97362',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const APP_URL = 'https://splix.app';
const SUPPORT_EMAIL = 'support@splix.app';

// Names and group titles come from users; never let them inject markup.
const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const heading = (text) =>
  `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:800;color:${theme.text};">${text}</h1>`;

const paragraph = (html, { muted = false, small = false } = {}) =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:${small ? 13 : 15}px;line-height:${small ? 20 : 24}px;color:${muted ? theme.muted : theme.text};">${html}</p>`;

// Bulletproof button: the table cell carries the colour, so it survives Outlook.
const button = (label, href) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${theme.accent}" style="border-radius:14px;background:${theme.gradient};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:800;color:${theme.onAccent};text-decoration:none;border-radius:14px;">${label}</a>
    </td>
  </tr>
</table>`;

// The big one-time code. Spaced out so it is easy to read and type.
const codeBox = (code) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
  <tr>
    <td align="center" bgcolor="${theme.raised}" style="padding:22px 12px;border:1px solid ${theme.accent};border-radius:16px;">
      <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:36px;line-height:40px;font-weight:800;letter-spacing:10px;color:${theme.text};padding-left:10px;">${escapeHtml(code)}</div>
    </td>
  </tr>
</table>`;

// A quiet boxed note, e.g. "didn't ask for this?"
const note = (html, { tone = 'muted' } = {}) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
  <tr>
    <td bgcolor="${theme.raised}" style="padding:14px 16px;border-radius:12px;border-left:3px solid ${tone === 'danger' ? theme.danger : theme.accent};font-family:${FONT};font-size:13px;line-height:20px;color:${theme.muted};">${html}</td>
  </tr>
</table>`;

// Icon + title + line, used for the feature list in the welcome email.
const featureRow = (emoji, title, body) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr>
    <td width="52" valign="top">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40" height="40" align="center" valign="middle" bgcolor="${theme.raised}" style="border:1px solid ${theme.border};border-radius:12px;font-size:19px;line-height:40px;">${emoji}</td>
      </tr></table>
    </td>
    <td valign="top" style="font-family:${FONT};">
      <div style="font-size:15px;line-height:22px;font-weight:700;color:${theme.text};">${title}</div>
      <div style="font-size:13px;line-height:20px;color:${theme.muted};">${body}</div>
    </td>
  </tr>
</table>`;

/**
 * Wraps body HTML in the branded frame.
 *   preheader: the grey preview line inboxes show next to the subject
 *   reason:    one line saying why this person got the email (footer)
 */
const layout = ({ preheader, body, reason }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Splix</title>
</head>
<body style="margin:0;padding:0;background-color:${theme.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${theme.page};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.page}" style="background-color:${theme.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Logo -->
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="40" height="40" align="center" valign="middle" bgcolor="${theme.accent}" style="background:${theme.gradient};border-radius:12px;font-family:${FONT};font-size:20px;line-height:40px;font-weight:900;color:${theme.onAccent};">S</td>
              <td style="padding-left:12px;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${theme.text};">Splix</td>
            </tr></table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td bgcolor="${theme.card}" style="background-color:${theme.card};border:1px solid ${theme.border};border-radius:24px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td height="5" bgcolor="${theme.accent}" style="background:${theme.gradient};font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr><td style="padding:32px 28px 24px;">${body}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 12px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${theme.muted};">
            ${escapeHtml(reason)}<br>
            Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:${theme.accent};text-decoration:none;">${SUPPORT_EMAIL}</a><br><br>
            &copy; ${new Date().getFullYear()} Splix &middot; Split expenses, plan trips, stay in sync.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

module.exports = {
  layout,
  heading,
  paragraph,
  button,
  codeBox,
  note,
  featureRow,
  escapeHtml,
  APP_URL,
  SUPPORT_EMAIL,
};
