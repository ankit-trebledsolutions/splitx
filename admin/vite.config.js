import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The email template editor bundles TinyMCE, which is imported one piece at a
// time (src/pages/layout-1/manage-cms/email-template/editor.jsx). Left to find
// them as the page loads, the dev server re-bundles and reloads for each one,
// and the editor never gets as far as opening. Named here, they are all ready
// when the server starts. A piece added to editor.jsx is added here as well.
const TINYMCE = [
  'tinymce/tinymce',
  'tinymce/models/dom/model',
  'tinymce/themes/silver',
  'tinymce/icons/default',
  'tinymce/skins/ui/oxide/skin.js',
  'tinymce/skins/ui/oxide/content.js',
  'tinymce/skins/ui/oxide-dark/skin.js',
  'tinymce/skins/ui/oxide-dark/content.js',
  'tinymce/plugins/autolink',
  'tinymce/plugins/charmap',
  'tinymce/plugins/code',
  'tinymce/plugins/emoticons',
  'tinymce/plugins/emoticons/js/emojis',
  'tinymce/plugins/fullscreen',
  'tinymce/plugins/image',
  'tinymce/plugins/link',
  'tinymce/plugins/lists',
  'tinymce/plugins/searchreplace',
  'tinymce/plugins/table',
  'tinymce/plugins/wordcount',
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_URL || '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['@tinymce/tinymce-react', ...TINYMCE],
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
