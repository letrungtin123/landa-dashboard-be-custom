// Rich HTML allowlist for every place the dashboard renders stored HTML
// (course text blocks, quiz prompts/choices/hints/explanations, problem
// questions, help pages). Pure: the DOMPurify instance is passed in, so the
// same config is used by the app (rich-html-sanitizer.ts) and by the tests.

export const RICH_HTML_ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'pre', 'q', 's', 'section', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
] as const;

export const RICH_HTML_ALLOWED_ATTR = [
  'align', 'alt', 'class', 'colspan', 'colwidth', 'dir', 'height', 'href', 'lang', 'rel', 'role', 'rowspan', 'scope',
  'src', 'style', 'tabindex', 'target', 'title', 'width',
  'data-landa-image-mode', 'data-landa-row-height', 'data-landa-cell-bg',
] as const;

/** Links and image sources: http(s), mailto, or relative. Never javascript:/vbscript:/data: links. */
export const RICH_HTML_ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

export const RICH_HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [...RICH_HTML_ALLOWED_TAGS],
  ALLOWED_ATTR: [...RICH_HTML_ALLOWED_ATTR],
  ALLOWED_URI_REGEXP: RICH_HTML_ALLOWED_URI,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  // Keep the text of removed wrappers (e.g. <font>), drop the content of dangerous ones.
  KEEP_CONTENT: true,
  FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'svg', 'math'],
};

export interface PurifyLike {
  sanitize(html: string, config: typeof RICH_HTML_SANITIZE_CONFIG): unknown;
  addHook(entryPoint: 'afterSanitizeAttributes', hook: (node: Node) => void): void;
}

/** New-tab links must not get a handle on this window. Install once per instance. */
export function installRichHtmlHooks(purify: PurifyLike): void {
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function sanitizeRichHtmlWith(purify: PurifyLike, html: string | null | undefined): string {
  if (!html) return '';
  return String(purify.sanitize(html, RICH_HTML_SANITIZE_CONFIG));
}
