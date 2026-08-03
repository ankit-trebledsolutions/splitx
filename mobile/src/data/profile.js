// Profile fields the backend user model does not carry yet. Merged over the
// real logged-in user so the screen matches the design while still showing the
// authenticated name/email when they exist.
export const profileDefaults = {
  name: 'Jane Doe',
  username: 'janedoe',
  email: 'jane.doe@outlook.com',
  phone: '+1 (555) 019-2834',
  tagline: 'Explorer',
  bio: 'Explorer & developer. Always searching for the next breathtaking destination and seamless travel experience.',
};

// Filled (solid) glyphs in teal, per the design.
export const accountSettings = [
  {
    key: 'email',
    icon: 'mail',
    label: 'Email',
    valueFrom: 'email',
  },
  {
    key: 'phone',
    icon: 'call',
    label: 'Phone',
    valueFrom: 'phone',
  },
  {
    key: 'notifications',
    icon: 'notifications',
    label: 'Notifications',
    value: 'Push, Email & SMS',
    screen: 'Notifications',
  },
];

export const helpSupport = [
  {
    key: 'faq',
    icon: 'help-circle',
    label: 'FAQ',
    value: 'Frequently asked questions',
    screen: 'Faq',
  },
  {
    key: 'contact',
    icon: 'mail',
    label: 'Contact Us',
    value: 'Get in touch with support',
    screen: 'ContactUs',
  },
  {
    key: 'privacy',
    icon: 'shield-checkmark',
    label: 'Privacy Policy',
    value: 'Data & usage terms',
    screen: 'PrivacyPolicy',
  },
];
