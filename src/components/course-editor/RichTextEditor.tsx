import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered, Quote, Undo, Redo, Code, Link2, Table2, Plus, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { config } from '@/config/env';
import {
  htmlImageDisplaySrc,
  htmlImagePersistSrc,
  isTransientHtmlImageSrc,
} from '@/utils/storage-url';
import { AppTooltip } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

// Luôn dùng relative URL để asset loading flexible trên mọi domain/IP
const LMS_BASE = '';

// Rewrite relative Open edX asset URLs sang tuyệt đối để ảnh hiển thị được trong editor
function rewriteContentUrls(html: string): string {
  if (!html) return html;
  return html
    .replace(/src="(\/asset-v1:[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/c4x\/[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/static\/[^"]+)"/g, `src="${LMS_BASE}$1"`)
    .replace(/src="(\/assets\/[^"]+)"/g, `src="${LMS_BASE}$1"`);
}

// Khôi phục lại đường dẫn tương đối trước khi lưu
function restoreContentUrls(html: string): string {
  if (!html) return html;
  if (!LMS_BASE) return html;
  const regex = new RegExp(`src="${LMS_BASE}(/[^"]+)"`, 'g');
  return html.replace(regex, 'src="$1"');
}

function transformImageSources(
  html: string,
  transform: (src: string) => string | null,
): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const nextSrc = transform(src);
      if (!nextSrc) {
        img.remove();
        return;
      }
      img.setAttribute('src', nextSrc);
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

function prepareContentForEditor(html: string): string {
  return transformImageSources(rewriteContentUrls(html), (src) => {
    if (isTransientHtmlImageSrc(src)) return null;
    return htmlImageDisplaySrc(src);
  });
}

export function prepareContentForSave(html: string): string {
  const restored = restoreContentUrls(html);
  return transformImageSources(restored, (src) => {
    if (isTransientHtmlImageSrc(src)) return null;
    return htmlImagePersistSrc(src);
  });
}

function removePastedColors(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.removeAttribute('color');
      element.removeAttribute('bgcolor');
      element.style.removeProperty('color');
      element.style.removeProperty('background-color');
      element.style.removeProperty('background');
      element.style.removeProperty('-webkit-text-fill-color');

      if (!element.getAttribute('style')?.trim()) {
        element.removeAttribute('style');
      }
    });

    // <font> is purely presentational here. Unwrap it so copied font face/size
    // cannot bypass the editor's current light/dark typography.
    doc.querySelectorAll('font').forEach((font) => {
      const parent = font.parentNode;
      if (!parent) return;
      while (font.firstChild) parent.insertBefore(font.firstChild, font);
      font.remove();
    });

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

function sanitizePastedHtml(html: string): string {
  return transformImageSources(removePastedColors(html), (src) => {
    if (isTransientHtmlImageSrc(src)) return null;
    return htmlImageDisplaySrc(src);
  });
}

function hasPersistentImageInHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('img')).some((img) => {
      const src = img.getAttribute('src') || '';
      // Chromium may put file: (or a temporary blob/data URL) into the HTML
      // clipboard representation of a screenshot. It is not retrievable by a
      // learner, so treat it like a file-only paste and upload the Clipboard
      // File instead of preserving a dead local URL.
      const normalizedSrc = src.trim().toLowerCase();
      const isLocalClipboardUrl = normalizedSrc.startsWith('file:')
        || normalizedSrc.startsWith('webkit-fake-url:');
      return !!src && !isTransientHtmlImageSrc(src) && !isLocalClipboardUrl;
    });
  } catch {
    return false;
  }
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: any) => void;
  minHeight?: string;
  hideToolbar?: boolean;
  onUnsupportedImagePaste?: () => void;
  /** Upload a clipboard image and return the persisted source to insert at the
   * exact cursor position. Returning null leaves the document unchanged. */
  onImageFilePaste?: (file: File) => RichTextEditorImageUploadResult | null | void | Promise<RichTextEditorImageUploadResult | null | void>;
  /** Runs only after an uploaded clipboard image has been inserted into the
   * document, allowing its owner to persist the resulting draft body. */
  onInlineImageInserted?: () => void;
  /** Table authoring is only enabled for HTML lesson blocks. */
  enableTables?: boolean;
  /** Enable explicit image selection + Delete/Backspace handling for editors
   * whose images are part of the saved document body. */
  enableImageKeyboardDelete?: boolean;
}

export interface RichTextEditorImageUploadResult {
  src: string;
  alt?: string;
}

function safeLessonClassName(value: string | null): string | null {
  if (!value) return null;
  const className = value
    .split(/\s+/)
    .filter((token) => /^[A-Za-z0-9_-]{1,64}$/.test(token))
    .slice(0, 20)
    .join(' ');
  return className || null;
}

const lessonClassAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => safeLessonClassName(element.getAttribute('class')),
  renderHTML: (attributes: Record<string, unknown>) => (
    typeof attributes.class === 'string' && attributes.class
      ? { class: attributes.class }
      : {}
  ),
};

function createLessonContainer(name: string, tag: string) {
  return Node.create({
    name,
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
      return { class: lessonClassAttribute };
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, HTMLAttributes, 0];
    },
  });
}

// HTML lessons generated by the authoring AI use semantic wrappers for
// typography/callouts. Tiptap otherwise unwraps unknown elements on save,
// which would make a harmless table edit silently change the published look.
const LessonSection = createLessonContainer('lessonSection', 'section');
const LessonHeader = createLessonContainer('lessonHeader', 'header');
const LessonDiv = createLessonContainer('lessonDiv', 'div');
const LessonParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: lessonClassAttribute,
    };
  },
});

// Keep the source marker in persisted HTML so learner/admin renderers can
// distinguish inline content images from the separate carousel media list.
const InlineAwareImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-landa-image-mode': {
        default: null,
        parseHTML: (element) => (
          element.getAttribute('data-landa-image-mode') === 'inline' ? 'inline' : null
        ),
        renderHTML: (attributes) => (
          attributes['data-landa-image-mode'] === 'inline'
            ? { 'data-landa-image-mode': 'inline' }
            : {}
        ),
      },
    };
  },
});

/**
 * Select an image node from the DOM element that was clicked. `posAtDOM` can
 * resolve to either edge of an inline atom depending on the browser and the
 * exact pointer position, so validate the neighbouring document positions
 * instead of assuming one fixed offset.
 */
function selectImageNodeFromDom(view: any, image: Element): boolean {
  const domPos = view.posAtDOM(image, 0);
  const imagePos = [domPos, domPos - 1, domPos + 1].find((candidate) => (
    candidate >= 0 && view.state.doc.nodeAt(candidate)?.type.name === 'image'
  ));

  if (imagePos === undefined) return false;

  const selection = view.state.selection;
  if (!(selection instanceof NodeSelection) || selection.from !== imagePos) {
    view.dispatch(
      view.state.tr
        .setSelection(NodeSelection.create(view.state.doc, imagePos))
        .scrollIntoView(),
    );
  }

  return true;
}

const MenuBar = ({ editor, enableTables = false }: { editor: any; enableTables?: boolean }) => {
  const { t } = useTranslation();
  if (!editor) {
    return null;
  }

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-muted/40 border-b border-border rounded-t-md">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive('bold') ? 'true' : 'false'}>
        <Bold className={`h-4 w-4 ${editor.isActive('bold') ? 'text-primary font-bold' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className={`h-4 w-4 ${editor.isActive('italic') ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className={`h-4 w-4 ${editor.isActive('strike') ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className={`h-4 w-4 ${editor.isActive('code') ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleLink}>
        <Link2 className={`h-4 w-4 ${editor.isActive('link') ? 'text-primary' : ''}`} />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className={`h-4 w-4 ${editor.isActive('heading', { level: 1 }) ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className={`h-4 w-4 ${editor.isActive('heading', { level: 2 }) ? 'text-primary' : ''}`} />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
        const url = window.prompt(t('courseEditorForms.imageUrlPrompt'));
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      </Button>

      {enableTables && (
        <>
          <div className="w-px h-6 bg-border mx-1" />
          <AppTooltip content={t('courseEditorForms.insertTable')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('courseEditorForms.insertTable')}
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <Table2 className="h-4 w-4" />
            </Button>
          </AppTooltip>
          {editor.isActive('table') && (
            <>
              <AppTooltip content={t('courseEditorForms.addTableRow')}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('courseEditorForms.addTableRow')} onClick={() => editor.chain().focus().addRowAfter().run()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </AppTooltip>
              <AppTooltip content={t('courseEditorForms.removeTableRow')}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('courseEditorForms.removeTableRow')} onClick={() => editor.chain().focus().deleteRow().run()}>
                  <Minus className="h-4 w-4" />
                </Button>
              </AppTooltip>
              <AppTooltip content={t('courseEditorForms.addTableColumn')}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('courseEditorForms.addTableColumn')} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </AppTooltip>
              <AppTooltip content={t('courseEditorForms.removeTableColumn')}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('courseEditorForms.removeTableColumn')} onClick={() => editor.chain().focus().deleteColumn().run()}>
                  <Minus className="h-4 w-4" />
                </Button>
              </AppTooltip>
              <AppTooltip content={t('courseEditorForms.deleteTable')}>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={t('courseEditorForms.deleteTable')} onClick={() => editor.chain().focus().deleteTable().run()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AppTooltip>
            </>
          )}
        </>
      )}

      <div className="w-px h-6 bg-border mx-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className={`h-4 w-4 ${editor.isActive('bulletList') ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className={`h-4 w-4 ${editor.isActive('orderedList') ? 'text-primary' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className={`h-4 w-4 ${editor.isActive('blockquote') ? 'text-primary' : ''}`} />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()}>
        <Undo className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()}>
        <Redo className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-1 pr-2">
        <AppTooltip content={t('courseEditorForms.textColor')}><input
          type="color"
          onInput={event => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
          value={editor.getAttributes('textStyle').color || '#000000'}
          className="w-6 h-6 p-0 border-0 rounded cursor-pointer overflow-hidden"
          aria-label={t('courseEditorForms.textColor')}
        /></AppTooltip>
      </div>
    </div>
  );
};

export default function RichTextEditor({
  content,
  onChange,
  onEditorReady,
  minHeight,
  hideToolbar,
  onUnsupportedImagePaste,
  onImageFilePaste,
  onInlineImageInserted,
  enableTables = false,
  enableImageKeyboardDelete = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      enableTables ? StarterKit.configure({ paragraph: false }) : StarterKit,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      InlineAwareImage.configure({ inline: true, allowBase64: false }),
      ...(enableTables ? [
        LessonSection,
        LessonHeader,
        LessonDiv,
        LessonParagraph,
        TableKit.configure({ table: { resizable: true } }),
      ] : []),
    ],
    content: prepareContentForEditor(content),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(prepareContentForSave(html));
    },
    onCreate: ({ editor }) => {
      if (onEditorReady) onEditorReady(editor);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base dark:prose-invert max-w-none ${minHeight || 'min-h-[300px]'} w-full bg-background p-4 outline-none focus-visible:outline-none tiptap-editor`,
      },
      transformPastedHTML: sanitizePastedHtml,
      handleDOMEvents: {
        // Some browsers do not consistently surface an inline image click to
        // `handleClickOn`. Selecting it at mousedown makes Delete/Backspace
        // deterministic while retaining the regular editor behaviour for
        // every other node.
        mousedown: (view, event) => {
          if (!enableImageKeyboardDelete || !(event.target instanceof Element)) return false;

          const image = event.target.closest('img');
          if (!image || !view.dom.contains(image) || !selectImageNodeFromDom(view, image)) {
            return false;
          }

          event.preventDefault();
          return true;
        },
      },
      handleClickOn: (view, _pos, node, nodePos) => {
        if (!enableImageKeyboardDelete || node.type.name !== 'image') return false;

        const image = view.domAtPos(nodePos).node;
        if (image instanceof Element && selectImageNodeFromDom(view, image)) return true;

        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)).scrollIntoView());
        return true;
      },
      handleKeyDown: (view, event) => {
        if (!enableImageKeyboardDelete || (event.key !== 'Backspace' && event.key !== 'Delete')) {
          return false;
        }

        const selection = view.state.selection;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
          return false;
        }

        event.preventDefault();
        view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
        return true;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageFiles = items
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file));
        const html = event.clipboardData?.getData('text/html') || '';
        if (imageFiles.length === 0 || hasPersistentImageInHtml(html)) return false;

        event.preventDefault();
        if (onImageFilePaste) {
          // Keep the original selection position. Uploads are asynchronous, so
          // using the current selection after the network round-trip could put
          // a pasted screenshot in an unrelated paragraph.
          let insertPosition = view.state.selection.from;
          void imageFiles.reduce<Promise<void>>(
            (chain, file) => chain.then(async () => {
              const uploaded = await onImageFilePaste(file);
              if (!uploaded || view.isDestroyed) return;

              const maxPosition = view.state.doc.content.size;
              const safePosition = Math.max(0, Math.min(insertPosition, maxPosition));
              const imageNode = view.state.schema.nodes.image?.create({
                // Storage paths are the persisted representation; the editor
                // itself must receive the authenticated display/proxy URL so a
                // newly pasted screenshot renders immediately without reopen.
                src: htmlImageDisplaySrc(uploaded.src),
                alt: uploaded.alt || file.name,
                'data-landa-image-mode': 'inline',
              });
              if (!imageNode) return;

              const transaction = view.state.tr.insert(safePosition, imageNode);
              insertPosition = safePosition + imageNode.nodeSize;
              transaction.setSelection(TextSelection.create(transaction.doc, Math.min(insertPosition, transaction.doc.content.size)));
              view.dispatch(transaction.scrollIntoView());
              onInlineImageInserted?.();
            }),
            Promise.resolve(),
          );
        } else {
          onUnsupportedImagePaste?.();
        }
        return true;
      },
    },
  });

  return (
    <div className="flex flex-col w-full h-full border border-input rounded-md overflow-hidden bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {!hideToolbar && <MenuBar editor={editor} enableTables={enableTables} />}
      <div className="flex-1 overflow-y-auto cursor-text" onClick={() => editor?.commands.focus()}>
        <style>{`
          .tiptap-editor ul {
            list-style-type: disc !important;
            padding-left: 2rem !important;
            margin: 1rem 0 !important;
          }
          .tiptap-editor ol {
            list-style-type: decimal !important;
            padding-left: 2rem !important;
            margin: 1rem 0 !important;
          }
          .tiptap-editor li {
            display: list-item !important;
            margin: 0.25rem 0 !important;
          }
          .tiptap-editor li p {
            display: inline !important;
            margin: 0 !important;
          }
          .tiptap-editor img {
            max-width: 100%;
            height: auto;
            border-radius: 0.375rem;
          }
          .tiptap-editor img.ProseMirror-selectednode {
            outline: 2px solid hsl(var(--primary));
            outline-offset: 3px;
            box-shadow: 0 0 0 5px hsl(var(--primary) / 0.14);
          }
          .tiptap-editor .tableWrapper {
            overflow-x: auto;
            margin: 1rem 0;
            border: 1px solid hsl(var(--border));
            border-radius: 0.75rem;
          }
          .tiptap-editor table {
            width: 100%;
            min-width: 32rem;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .tiptap-editor th,
          .tiptap-editor td {
            min-width: 7rem;
            border: 1px solid hsl(var(--border));
            padding: 0.625rem 0.75rem;
            vertical-align: top;
          }
          .tiptap-editor table thead,
          .tiptap-editor table thead tr {
            background: hsl(var(--muted)) !important;
          }
          .tiptap-editor table th,
          .tiptap-editor table thead td {
            color: hsl(var(--foreground)) !important;
            background: hsl(var(--muted)) !important;
            font-weight: 700 !important;
            border-color: hsl(var(--border)) !important;
          }
          .tiptap-editor .selectedCell::after {
            background: hsl(var(--primary) / 0.12);
          }
          .tiptap-editor .column-resize-handle {
            background-color: hsl(var(--primary));
            bottom: -2px;
            pointer-events: none;
            position: absolute;
            right: -2px;
            top: 0;
            width: 4px;
          }
        `}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
