const env = require('../config/env');

/**
 * The outside services Splix depends on, as the admin panel presents them
 * (General Settings > Third-Party APIs): what each one is for, how to get its
 * keys, and which values it needs.
 *
 * Every value has two possible sources. `fromEnv` is what the server was set
 * up with; a value saved in the panel is laid over it. Nothing here is ever
 * copied into the database — the panel stores only what an admin typed.
 *
 * A service is listed because some code reads it (integrations/store.js).
 * Adding an entry makes it appear in the panel; it does nothing until a
 * service asks the store for it.
 *
 * Field types:
 *   secret  stored encrypted, never sent back to the panel
 *   text    stored and shown as it is
 *   number  a whole number between `min` and `max`
 */

// The steps are written for somebody who has never seen the provider's site.
// Each names the page to open rather than where a button sits: providers move
// their buttons far more often than they rename their pages.
const INTEGRATIONS = [
  {
    key: 'resend',
    name: 'Resend',
    purpose: 'Sends every email: sign-up codes, password reset codes, the welcome email.',
    steps: [
      {
        title: 'Create a Resend account',
        body: 'Sign up with a work email address. The free plan is enough to start with.',
        link: { label: 'Open Resend', url: 'https://resend.com/signup' },
      },
      {
        title: 'Add and verify your domain',
        body: 'Open Domains, choose Add Domain and enter the domain your emails should come from, for example splix.app. Resend lists a few DNS records: add them where your domain is managed, then press Verify. This can take a few minutes. Until a domain is verified, emails only reach your own inbox.',
        link: { label: 'Open Domains', url: 'https://resend.com/domains' },
      },
      {
        title: 'Create an API key',
        body: 'Open API Keys and choose Create API Key. Name it after this server, for example "Splix server". Copy the key straight away: Resend shows it once. It starts with re_.',
        link: { label: 'Open API Keys', url: 'https://resend.com/api-keys' },
      },
      {
        title: 'Paste the key and the sender address here',
        body: 'The sender address must end in the domain you verified in step 2.',
      },
    ],
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'secret',
        placeholder: 're_...',
        pattern: /^re_[A-Za-z0-9_-]{8,}$/,
        patternHint: 'A Resend key starts with re_',
        fromEnv: () => env.email.resendApiKey,
      },
      {
        key: 'from',
        label: 'Sender address',
        type: 'text',
        placeholder: 'Splix <noreply@yourdomain.com>',
        // Either a bare address, or a name followed by the address in < >.
        pattern: /^(?:[^<>@\r\n]{1,60}\s<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/,
        patternHint: 'Write it as Splix <noreply@yourdomain.com>',
        fromEnv: () => env.email.from,
      },
    ],
  },
  {
    key: 'openai',
    name: 'OpenAI',
    purpose: 'Writes the AI trip plans. Without a key the rest of the app keeps working and the planner says it is unavailable.',
    steps: [
      {
        title: 'Create an OpenAI platform account',
        body: 'This is the developer platform, which is separate from a ChatGPT subscription.',
        link: { label: 'Open OpenAI', url: 'https://platform.openai.com/signup' },
      },
      {
        title: 'Add credit',
        body: 'Open Billing and add a payment method or some credit. With no credit OpenAI refuses every request and the planner switches itself off. Set a monthly spending limit while you are there.',
        link: { label: 'Open Billing', url: 'https://platform.openai.com/settings/organization/billing/overview' },
      },
      {
        title: 'Create an API key',
        body: 'Open API keys and choose Create new secret key. Name it after this server. Copy the key straight away: OpenAI shows it once. It starts with sk-.',
        link: { label: 'Open API keys', url: 'https://platform.openai.com/api-keys' },
      },
      {
        title: 'Paste the key here and set the limits',
        body: 'The limits decide how many paid plans can be made in 24 hours. They are your protection against a surprise bill.',
      },
    ],
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'secret',
        placeholder: 'sk-...',
        pattern: /^sk-[A-Za-z0-9_-]{16,}$/,
        patternHint: 'An OpenAI key starts with sk-',
        fromEnv: () => env.openai.apiKey,
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'gpt-5.6-luna',
        pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/,
        patternHint: 'Use the model name exactly as OpenAI writes it',
        help: 'The model that writes the plan.',
        fromEnv: () => env.openai.model,
      },
      {
        key: 'fallbackModel',
        label: 'Fallback model',
        type: 'text',
        placeholder: 'gpt-5.4-mini',
        pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/,
        patternHint: 'Use the model name exactly as OpenAI writes it',
        help: 'Tried once if OpenAI says the model above does not exist for this key.',
        fromEnv: () => env.openai.fallbackModel,
      },
      {
        key: 'userDailyCap',
        label: 'Plans per person, per day',
        type: 'number',
        min: 0,
        max: 1000,
        fromEnv: () => env.openai.userDailyCap,
      },
      {
        key: 'groupDailyCap',
        label: 'Plans per group, per day',
        type: 'number',
        min: 0,
        max: 1000,
        fromEnv: () => env.openai.groupDailyCap,
      },
      {
        key: 'globalDailyCap',
        label: 'Plans for everyone, per day',
        type: 'number',
        min: 0,
        max: 100000,
        fromEnv: () => env.openai.globalDailyCap,
      },
    ],
  },
  {
    key: 'cloudinary',
    name: 'Cloudinary',
    purpose: 'Stores the photos and files people upload, in the gallery and in chat.',
    warning:
      'Moving to a different Cloudinary account: photos already uploaded stay visible in the app, but can no longer be deleted from it, because they live in the old account.',
    steps: [
      {
        title: 'Create a Cloudinary account',
        body: 'The free plan is enough to start with.',
        link: { label: 'Open Cloudinary', url: 'https://cloudinary.com/users/register_free' },
      },
      {
        title: 'Open API Keys',
        body: 'In the Cloudinary console open Settings, then API Keys. The cloud name is at the top of the page. Each key in the list has an API key, which is a long number, and an API secret, which stays hidden until you press the eye next to it.',
        link: { label: 'Open API Keys', url: 'https://console.cloudinary.com/settings/api-keys' },
      },
      {
        title: 'Paste all three values here',
        body: 'They belong together: all three must come from the same account.',
      },
    ],
    fields: [
      {
        key: 'cloudName',
        label: 'Cloud name',
        type: 'text',
        placeholder: 'your-cloud-name',
        // It becomes part of the address the server calls, so nothing that
        // could turn it into a different address is allowed through.
        pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/,
        patternHint: 'Letters, numbers, dashes and underscores only',
        fromEnv: () => env.cloudinary?.cloudName || '',
      },
      {
        key: 'apiKey',
        label: 'API key',
        type: 'secret',
        placeholder: '123456789012345',
        pattern: /^\d{6,30}$/,
        patternHint: 'A Cloudinary API key is a long number',
        fromEnv: () => env.cloudinary?.apiKey || '',
      },
      {
        key: 'apiSecret',
        label: 'API secret',
        type: 'secret',
        pattern: /^[A-Za-z0-9_-]{10,80}$/,
        patternHint: 'Copy the secret exactly as Cloudinary shows it',
        fromEnv: () => env.cloudinary?.apiSecret || '',
      },
    ],
  },
  {
    key: 'stream',
    name: 'Stream',
    purpose: 'Runs the voice and video calls.',
    warning:
      'Moving to a different Stream app is a fresh start. Calls in progress end, and people can call again once their app has fetched a new token, which it does by itself.',
    steps: [
      {
        title: 'Create a Stream account',
        body: 'Sign up on getstream.io.',
        link: { label: 'Open Stream', url: 'https://getstream.io/try-for-free/' },
      },
      {
        title: 'Create an app',
        body: 'In the Stream dashboard choose Create App. Name it Splix and pick the region closest to most of your users.',
        link: { label: 'Open the dashboard', url: 'https://dashboard.getstream.io/' },
      },
      {
        title: 'Find the key and the secret',
        body: 'Open the app you just created. Under App Access Keys there is a Key and a Secret.',
      },
      {
        title: 'Paste both here',
        body: 'Nothing has to change in the mobile app: it asks this server for the key every time it needs one.',
      },
    ],
    fields: [
      {
        key: 'apiKey',
        label: 'Key',
        // Not a secret: the mobile app is handed this value to start a call.
        type: 'text',
        pattern: /^[a-z0-9]{6,40}$/i,
        patternHint: 'Copy the key exactly as Stream shows it',
        fromEnv: () => env.streamApiKey,
      },
      {
        key: 'apiSecret',
        label: 'Secret',
        type: 'secret',
        pattern: /^[a-z0-9]{20,120}$/i,
        patternHint: 'Copy the secret exactly as Stream shows it',
        fromEnv: () => env.streamApiSecret,
      },
    ],
  },
  {
    key: 'google',
    name: 'Google Sign-In',
    purpose: 'Lets people sign up and log in with their Google account.',
    warning:
      'These IDs are also built into the mobile app. A new ID only starts working once an app version that contains it has been released, so give the same IDs to your developer. IDs saved here are accepted in addition to the ones the server was set up with, so people on the current app version can keep signing in.',
    // Added to what the server already accepts rather than replacing it. See
    // googleClientIds() in ./store.js.
    addsToEnv: true,
    steps: [
      {
        title: 'Create a Google Cloud project',
        body: 'Sign in with the Google account that should own the project and name the project Splix.',
        link: { label: 'Open Google Cloud', url: 'https://console.cloud.google.com/projectcreate' },
      },
      {
        title: 'Fill in the consent screen',
        body: 'This is what people see when they choose their Google account. Enter the app name and a support email address, and choose External so that anyone with a Google account can sign in.',
        link: { label: 'Open the consent screen', url: 'https://console.cloud.google.com/apis/credentials/consent' },
      },
      {
        title: 'Create three client IDs',
        body: 'Open Credentials, choose Create credentials, then OAuth client ID. Do this three times. Web application: needs nothing more. Android: enter the package name com.splity.app and the SHA-1 signing fingerprint, which your developer can give you. iOS: enter the bundle ID com.splity.app.',
        link: { label: 'Open Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
      },
      {
        title: 'Give the same IDs to your developer',
        body: 'The mobile app has these IDs built in, and needs a new version to use new ones.',
      },
      {
        title: 'Paste the IDs here',
        body: 'Each one ends in .apps.googleusercontent.com.',
      },
    ],
    fields: ['web', 'ios', 'android'].map((platform) => ({
      key: `${platform}ClientId`,
      label: { web: 'Web client ID', ios: 'iOS client ID', android: 'Android client ID' }[platform],
      // Not a secret: every copy of the app carries these.
      type: 'text',
      placeholder: '1234567890-abc123.apps.googleusercontent.com',
      pattern: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
      patternHint: 'A client ID ends in .apps.googleusercontent.com',
      optional: true,
      fromEnv: () => env.google[`${platform}ClientId`],
    })),
  },
];

// No prototype underneath: looked up with a name that arrives in a request,
// and '__proto__' or 'constructor' must find nothing rather than something.
const BY_KEY = Object.assign(
  Object.create(null),
  Object.fromEntries(INTEGRATIONS.map((integration) => [integration.key, integration]))
);
const INTEGRATION_KEYS = INTEGRATIONS.map((integration) => integration.key);

module.exports = { INTEGRATIONS, BY_KEY, INTEGRATION_KEYS };
