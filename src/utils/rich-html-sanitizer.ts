import DOMPurify from 'dompurify';
import { installRichHtmlHooks, sanitizeRichHtmlWith } from './rich-html-sanitizer.logic';

let hooksInstalled = false;

/**
 * The one sanitizer for stored HTML before `dangerouslySetInnerHTML`.
 * Keeps text formatting, headings, lists, tables, images, blockquotes and
 * http(s)/mailto/relative links; removes scripts, event handlers,
 * javascript: URLs, iframes, forms and SVG.
 */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return '';
  if (!hooksInstalled) {
    installRichHtmlHooks(DOMPurify);
    hooksInstalled = true;
  }
  return sanitizeRichHtmlWith(DOMPurify, html);
}
