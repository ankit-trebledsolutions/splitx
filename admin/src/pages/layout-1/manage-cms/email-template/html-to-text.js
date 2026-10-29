// Writes the plain-text version of a design, for "Generate from design".
//
// A starting point rather than a finished text: it keeps the words, the line
// breaks and the addresses behind links, and the admin tidies up from there.
// The HTML is parsed, never added to the page, so nothing in it can run.

const BREAK_BEFORE_AND_AFTER = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
]);
const OWN_LINE = new Set(['DIV', 'TABLE', 'TR', 'LI', 'HR']);
const SKIPPED = new Set(['STYLE', 'SCRIPT', 'HEAD', 'TITLE']);

export const htmlToText = (html) => {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  let out = '';

  const startLine = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const startParagraph = () => {
    startLine();
    if (out && !out.endsWith('\n\n')) out += '\n';
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/\s+/g, ' ');
      const atLineStart = !out || out.endsWith('\n');
      if (text === ' ' && (atLineStart || out.endsWith(' '))) return;
      out += atLineStart ? text.trimStart() : text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIPPED.has(node.tagName)) {
      return;
    }

    const tag = node.tagName;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    if (tag === 'IMG') {
      out += node.getAttribute('alt') || '';
      return;
    }

    if (BREAK_BEFORE_AND_AFTER.has(tag)) startParagraph();
    else if (OWN_LINE.has(tag)) startLine();
    if (tag === 'LI') out += '- ';

    const start = out.length;
    node.childNodes.forEach(walk);

    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      const label = out.slice(start).trim();
      // The address is what a plain-text reader can actually use. Left out
      // when the link text already is the address.
      if (href && !href.startsWith('#') && !href.includes(label)) {
        out += ` (${href})`;
      } else if (href && !label) {
        out += href;
      }
    }
    // Cells of one row read as one line, with a gap between them.
    if ((tag === 'TD' || tag === 'TH') && out && !/\s$/.test(out)) out += ' ';

    if (BREAK_BEFORE_AND_AFTER.has(tag)) startParagraph();
    else if (OWN_LINE.has(tag)) startLine();
  };

  walk(doc.body);

  return out
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
