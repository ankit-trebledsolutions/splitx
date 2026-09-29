const { render } = require('./render');
const { DEFAULTS } = require('./defaults');

/**
 * Every email Splix sends, in its built-in design. Each returns
 * { subject, html, text }: the text part is what plain-text clients and spam
 * filters read, so it carries the same information as the HTML, never just
 * "view this in a browser".
 *
 * The wording and design live in ./defaults.js. What is actually sent may be a
 * version an admin edited in the panel — that choice is made in
 * services/emailTemplate.service.js, which falls back to these.
 */
const builtIn = (key) => (vars) => render(DEFAULTS[key].content, vars);

module.exports = {
  verifyEmail: builtIn('verify_email'),
  resetPassword: builtIn('reset_password'),
  welcome: builtIn('welcome'),
  passwordChanged: builtIn('password_changed'),
};
