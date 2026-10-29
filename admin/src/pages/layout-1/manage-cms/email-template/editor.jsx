import { useMemo, useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { useTheme } from 'next-themes';
// TinyMCE is bundled with the panel instead of being loaded from Tiny's cloud,
// so the editor needs no API key, no account and no approved domain, and works
// on a machine that is offline. The order below matters: everything after the
// first line registers itself on the global that the first line creates.
import 'tinymce/tinymce';
import 'tinymce/models/dom/model';
import 'tinymce/themes/silver';
import 'tinymce/icons/default';
import 'tinymce/skins/ui/oxide/skin.js';
import 'tinymce/skins/ui/oxide/content.js';
import 'tinymce/skins/ui/oxide-dark/skin.js';
import 'tinymce/skins/ui/oxide-dark/content.js';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/code';
import 'tinymce/plugins/emoticons';
import 'tinymce/plugins/emoticons/js/emojis';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/image';
import 'tinymce/plugins/link';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/table';
import 'tinymce/plugins/wordcount';

// The editing area is dressed as the card the design will sit in, so text is
// written on the background it will be read on. Deliberately the only styling
// in there: TinyMCE's own content stylesheet restyles tables, and an email is
// nothing but tables.
const canvasStyle = (canvas) => `
  html { background: ${canvas.page}; }
  body {
    box-sizing: border-box;
    max-width: ${canvas.width}px;
    margin: 24px auto;
    padding: 32px 28px 24px;
    background: ${canvas.background};
    border: 1px solid ${canvas.border};
    border-radius: 24px;
    color: ${canvas.text};
    font-family: ${canvas.font};
    font-size: 15px;
    line-height: 24px;
  }
  a { color: ${canvas.accent}; }
  img { max-width: 100%; height: auto; }
`;

const hasOwnColour = (style) => /(^|;)\s*color\s*:/i.test(style || '');

export default function EmailEditor({
  initialValue,
  onChange,
  onInit,
  onFocus,
  variables = [],
  blocks = [],
  canvas,
}) {
  const { resolvedTheme } = useTheme();
  const skin = resolvedTheme === 'dark' ? 'oxide-dark' : 'oxide';

  // Switching the panel between light and dark creates a new editor (see
  // below). It is started from what has been written so far, not from what was
  // loaded, or changing theme would throw away the edit in progress.
  const latest = useRef(initialValue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startFrom = useMemo(() => latest.current, [skin]);

  const init = useMemo(
    () => ({
      skin,
      content_css: false,
      content_style: canvasStyle(canvas),
      height: 640,
      min_height: 420,
      menubar: false,
      branding: false,
      promotion: false,
      // Right-click stays the browser's own, for its spelling suggestions.
      contextmenu: false,
      browser_spellcheck: true,
      plugins:
        'autolink charmap code emoticons fullscreen image link lists searchreplace table wordcount',
      toolbar:
        'undo redo | emailblocks emailvariables | blocks fontsize | bold italic underline forecolor | alignleft aligncenter alignright | bullist numlist | link image table emoticons | removeformat code fullscreen',
      toolbar_mode: 'wrap',
      font_size_formats: '12px 13px 14px 15px 16px 18px 20px 24px 28px 32px',
      color_map: (canvas.palette || []).flatMap(({ name, color }) => [
        color.replace('#', ''),
        name,
      ]),

      // An email is inline styles and attributes a web page stopped using
      // years ago (bgcolor, cellpadding). Every one of them is there for an
      // inbox that needs it, so nothing is tidied away.
      valid_elements: '*[*]',
      verify_html: false,
      entity_encoding: 'raw',
      // Links are kept exactly as typed: no rewriting to relative paths, which
      // mean nothing once the email has left this page.
      convert_urls: false,
      relative_urls: false,
      remove_script_host: false,
      link_default_target: '_blank',
      link_target_list: false,

      // Dashed guides and drag handles on the layout tables would show a
      // design that is not the one being sent.
      visual: false,
      object_resizing: 'img',
      table_resize_bars: false,

      // A pasted or dropped picture becomes data inside the email, which most
      // inboxes refuse to show. Pictures go in by address only.
      paste_data_images: false,
      automatic_uploads: false,
      image_uploadtab: false,
      image_advtab: false,

      setup: (editor) => {
        editor.ui.registry.addMenuButton('emailblocks', {
          text: 'Insert block',
          tooltip: 'Ready-made pieces in the Splix design',
          fetch: (callback) =>
            callback(
              blocks.map((block) => ({
                type: 'menuitem',
                text: block.label,
                onAction: () => editor.insertContent(block.html),
              })),
            ),
        });

        editor.ui.registry.addMenuButton('emailvariables', {
          text: 'Insert variable',
          tooltip: 'Details filled in for each person',
          fetch: (callback) =>
            callback(
              variables.map((variable) => ({
                type: 'menuitem',
                text: `${variable.label}  {{${variable.key}}}`,
                onAction: () => editor.insertContent(`{{${variable.key}}}`),
              })),
            ),
        });

        // A link made here has no colour of its own, and an inbox would paint
        // it browser blue — close to unreadable on the dark card. The colour it
        // is shown in while editing is written into the link on the way out.
        editor.on('PreInit', () => {
          editor.serializer.addNodeFilter('a', (nodes) => {
            nodes.forEach((node) => {
              const style = node.attr('style');
              if (!hasOwnColour(style)) {
                node.attr('style', `color:${canvas.accent};${style || ''}`);
              }
            });
          });
        });
      },
    }),
    [skin, canvas, variables, blocks],
  );

  return (
    <Editor
      // The configuration is only read when the editor is created, so a change
      // of theme has to create a new one.
      key={skin}
      licenseKey="gpl"
      initialValue={startFrom}
      onEditorChange={(content) => {
        latest.current = content;
        onChange(content);
      }}
      onInit={(_event, editor) => onInit?.(editor)}
      onFocus={onFocus}
      init={init}
    />
  );
}
