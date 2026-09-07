// ═══════════════════════════════════════════════════════════════
// Tiptap Rich Text Editor — Reusable component
// ═══════════════════════════════════════════════════════════════

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, ImagePlus, Link2, Undo, Redo,
} from 'lucide-react';

interface TiptapEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>; // returns image URL
}

function MenuBar({ editor }: { editor: Editor | null }) {
  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // For now, convert to base64 (will be replaced with upload)
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          editor.chain().focus().setImage({ src: reader.result }).run();
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5 bg-muted/30">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleBold().run()}
        data-active={editor.isActive('bold') || undefined}
      ><Bold className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        data-active={editor.isActive('italic') || undefined}
      ><Italic className="h-4 w-4" /></Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        data-active={editor.isActive('heading', { level: 1 }) || undefined}
      ><Heading1 className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        data-active={editor.isActive('heading', { level: 2 }) || undefined}
      ><Heading2 className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        data-active={editor.isActive('heading', { level: 3 }) || undefined}
      ><Heading3 className="h-4 w-4" /></Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        data-active={editor.isActive('bulletList') || undefined}
      ><List className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        data-active={editor.isActive('orderedList') || undefined}
      ><ListOrdered className="h-4 w-4" /></Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={addLink}
        data-active={editor.isActive('link') || undefined}
      ><Link2 className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={addImage}>
        <ImagePlus className="h-4 w-4" />
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      ><Undo className="h-4 w-4" /></Button>

      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      ><Redo className="h-4 w-4" /></Button>
    </div>
  );
}

export default function TiptapEditor({ content = '', onChange, placeholder }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder || 'Nhập nội dung...' }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
  });

  // Sync external content changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="rounded-md border bg-background overflow-hidden [&_[data-active]]:bg-accent [&_[data-active]]:text-accent-foreground">
      <MenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[200px] focus-within:outline-none
          [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
          [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-md [&_.ProseMirror_img]:my-4"
      />
    </div>
  );
}
