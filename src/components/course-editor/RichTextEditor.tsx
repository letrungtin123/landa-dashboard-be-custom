import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered, Quote, Undo, Redo, Code, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { config } from '@/config/env';
import {
  htmlImageDisplaySrc,
  htmlImagePersistSrc,
  isTransientHtmlImageSrc,
} from '@/utils/storage-url';

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

function prepareContentForSave(html: string): string {
  const restored = restoreContentUrls(html);
  return transformImageSources(restored, (src) => {
    if (isTransientHtmlImageSrc(src)) return null;
    return htmlImagePersistSrc(src);
  });
}

function sanitizePastedHtml(html: string): string {
  return transformImageSources(html, (src) => {
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
      return !!src && !isTransientHtmlImageSrc(src);
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
}

const MenuBar = ({ editor }: { editor: any }) => {
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
        const url = window.prompt('URL hình ảnh:');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      </Button>

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
        <input
          type="color"
          onInput={event => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
          value={editor.getAttributes('textStyle').color || '#000000'}
          className="w-6 h-6 p-0 border-0 rounded cursor-pointer overflow-hidden"
          title="Màu chữ"
        />
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
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: false }),
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
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const hasImageFile = items.some((item) => item.kind === 'file' && item.type.startsWith('image/'));
        const html = event.clipboardData?.getData('text/html') || '';
        if (!hasImageFile || hasPersistentImageInHtml(html)) return false;

        event.preventDefault();
        onUnsupportedImagePaste?.();
        return true;
      },
    },
  });

  return (
    <div className="flex flex-col w-full h-full border border-input rounded-md overflow-hidden bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {!hideToolbar && <MenuBar editor={editor} />}
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
        `}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
