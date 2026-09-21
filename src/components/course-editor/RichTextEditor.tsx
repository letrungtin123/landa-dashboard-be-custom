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
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Undo, Redo, Code, Link2, Table2, Plus, Minus, Trash2, Columns3, Rows3, Combine, Split, Paintbrush, AlignLeft, AlignCenter, AlignRight, PanelTop, PanelLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { config } from '@/config/env';
import {
  htmlImageDisplaySrc,
  htmlImagePersistSrc,
  isTransientHtmlImageSrc,
} from '@/utils/storage-url';
import { AppTooltip } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  LessonTable,
  LessonTableCell,
  LessonTableHeader,
  LessonTableRow,
  normalizeTableCellColor,
  normalizeTableRowHeight,
  TABLE_ROW_HEIGHT_LIMITS,
} from './rich-text-table';

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

function getTableRowPosition(view: any, row: HTMLTableRowElement): number | null {
  const domPositions = [
    view.posAtDOM(row, 0),
    view.posAtDOM(row, Math.max(0, row.childNodes.length - 1)),
  ];

  for (const position of domPositions) {
    try {
      const resolved = view.state.doc.resolve(position);
      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        if (resolved.node(depth).type.name === 'tableRow') {
          return resolved.before(depth);
        }
      }
    } catch {
      // A DOM position can be transient while ProseMirror redraws a table.
    }
  }

  return null;
}

function beginTableRowResize(view: any, event: MouseEvent): boolean {
  if (event.button !== 0 || !(event.target instanceof Element)) return false;
  const row = event.target.closest('tr');
  if (!(row instanceof HTMLTableRowElement) || !view.dom.contains(row)) return false;

  const rect = row.getBoundingClientRect();
  const isAtBottomBorder = event.clientY >= rect.bottom - 7 && event.clientY <= rect.bottom + 3;
  if (!isAtBottomBorder) return false;

  const rowPosition = getTableRowPosition(view, row);
  const rowNode = rowPosition === null ? null : view.state.doc.nodeAt(rowPosition);
  if (!rowNode || rowNode.type.name !== 'tableRow') return false;

  event.preventDefault();
  const startY = event.clientY;
  const startHeight = normalizeTableRowHeight(rowNode.attrs.rowHeight) || Math.max(rect.height, TABLE_ROW_HEIGHT_LIMITS.min);
  const previousCursor = document.body.style.cursor;
  document.body.style.cursor = 'row-resize';
  row.classList.add('landa-table-row-resizing');

  const handleMove = (moveEvent: MouseEvent) => {
    const nextHeight = Math.max(
      TABLE_ROW_HEIGHT_LIMITS.min,
      Math.min(TABLE_ROW_HEIGHT_LIMITS.max, Math.round(startHeight + moveEvent.clientY - startY)),
    );
    row.style.height = `${nextHeight}px`;
  };

  const handleEnd = (endEvent: MouseEvent) => {
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.body.style.cursor = previousCursor;
    row.classList.remove('landa-table-row-resizing');

    const nextHeight = Math.max(
      TABLE_ROW_HEIGHT_LIMITS.min,
      Math.min(TABLE_ROW_HEIGHT_LIMITS.max, Math.round(startHeight + endEvent.clientY - startY)),
    );
    const currentRow = view.state.doc.nodeAt(rowPosition);
    if (!currentRow || currentRow.type.name !== 'tableRow') return;

    view.dispatch(
      view.state.tr
        .setNodeMarkup(rowPosition, undefined, { ...currentRow.attrs, rowHeight: nextHeight })
        .scrollIntoView(),
    );
  };

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  return true;
}

const TABLE_CELL_COLORS = [
  '#FFFFFF', '#F8FAFC', '#DBEAFE', '#DCFCE7', '#FEF3C7', '#FEE2E2', '#F3E8FF', '#E0F2FE',
];
const MAX_EDITOR_TABLE_ROWS = 100;
const MAX_EDITOR_TABLE_COLUMNS = 50;

function getActiveTableDimensions(editor: any): { rows: number; columns: number } | null {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'table') continue;

    const columns = node.content.content.reduce((maxColumns: number, row: any) => {
      const rowColumns = row.content.content.reduce(
        (sum: number, cell: any) => sum + Math.max(1, Number(cell.attrs.colspan) || 1),
        0,
      );
      return Math.max(maxColumns, rowColumns);
    }, 0);
    return { rows: node.childCount, columns };
  }
  return null;
}

function TableToolButton({
  label,
  onClick,
  children,
  disabled = false,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <AppTooltip content={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`h-8 w-8 rounded-lg ${destructive ? 'text-destructive hover:text-destructive' : ''}`}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </AppTooltip>
  );
}

function TableActionMenu({
  label,
  icon,
  children,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-xs font-semibold shadow-sm hover:bg-accent"
        >
          {icon}
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1.5">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableActions({ editor, t }: { editor: any; t: (key: string, options?: Record<string, unknown>) => string }) {
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const dimensions = getActiveTableDimensions(editor);
  const rowLimitReached = (dimensions?.rows || 0) >= MAX_EDITOR_TABLE_ROWS;
  const columnLimitReached = (dimensions?.columns || 0) >= MAX_EDITOR_TABLE_COLUMNS;
  const selectedCellColor = normalizeTableCellColor(
    editor.getAttributes('tableCell').backgroundColor
    || editor.getAttributes('tableHeader').backgroundColor,
  );
  const setCellColor = (color: string | null) => {
    editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    setIsColorPickerOpen(false);
  };

  return (
    <div className="border-t border-primary/15 bg-primary/[0.035] px-2.5 py-2">
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <div className="mr-1 flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary">
          <Table2 className="h-4 w-4" />
          <span>{t('tableEditor.tableSelection', { rows: dimensions?.rows || 0, columns: dimensions?.columns || 0 })}</span>
        </div>
        <TableActionMenu label={t('tableEditor.rowMenu')} icon={<Rows3 className="h-4 w-4" />}>
          <DropdownMenuItem disabled={rowLimitReached} onSelect={() => editor.chain().focus().addRowBefore().run()}>
            <Plus className="h-4 w-4" />{rowLimitReached ? t('tableEditor.maximumRows') : t('tableEditor.addRowAbove')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={rowLimitReached} onSelect={() => editor.chain().focus().addRowAfter().run()}>
            <Plus className="h-4 w-4" />{rowLimitReached ? t('tableEditor.maximumRows') : t('tableEditor.addRowBelow')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().deleteRow().run()}>
            <Minus className="h-4 w-4" />{t('tableEditor.removeRow')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderRow().run()}>
            <PanelTop className="h-4 w-4" />{t('tableEditor.toggleHeaderRow')}
          </DropdownMenuItem>
        </TableActionMenu>
        <TableActionMenu label={t('tableEditor.columnMenu')} icon={<Columns3 className="h-4 w-4" />}>
          <DropdownMenuItem disabled={columnLimitReached} onSelect={() => editor.chain().focus().addColumnBefore().run()}>
            <Plus className="h-4 w-4" />{columnLimitReached ? t('tableEditor.maximumColumns') : t('tableEditor.addColumnLeft')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={columnLimitReached} onSelect={() => editor.chain().focus().addColumnAfter().run()}>
            <Plus className="h-4 w-4" />{columnLimitReached ? t('tableEditor.maximumColumns') : t('tableEditor.addColumnRight')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().deleteColumn().run()}>
            <Minus className="h-4 w-4" />{t('tableEditor.removeColumn')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}>
            <PanelLeft className="h-4 w-4" />{t('tableEditor.toggleHeaderColumn')}
          </DropdownMenuItem>
        </TableActionMenu>
        <TableActionMenu label={t('tableEditor.cellMenu')} icon={<Combine className="h-4 w-4" />}>
          <DropdownMenuItem disabled={!editor.can().chain().focus().mergeCells().run()} onSelect={() => editor.chain().focus().mergeCells().run()}>
            <Combine className="h-4 w-4" />{t('tableEditor.mergeCells')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.can().chain().focus().splitCell().run()} onSelect={() => editor.chain().focus().splitCell().run()}>
            <Split className="h-4 w-4" />{t('tableEditor.splitCell')}
          </DropdownMenuItem>
        </TableActionMenu>
        <TableActionMenu label={t('tableEditor.alignmentMenu')} icon={<AlignLeft className="h-4 w-4" />}>
          <DropdownMenuItem onSelect={() => editor.chain().focus().setCellAttribute('align', 'left').run()}>
            <AlignLeft className="h-4 w-4" />{t('tableEditor.alignLeft')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().setCellAttribute('align', 'center').run()}>
            <AlignCenter className="h-4 w-4" />{t('tableEditor.alignCenter')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().setCellAttribute('align', 'right').run()}>
            <AlignRight className="h-4 w-4" />{t('tableEditor.alignRight')}
          </DropdownMenuItem>
        </TableActionMenu>
        <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-xs font-semibold shadow-sm hover:bg-accent" aria-label={t('tableEditor.cellBackgroundColor')}>
              <Paintbrush className="h-4 w-4" />
              <span>{t('tableEditor.colorMenu')}</span>
              <span className="h-3.5 w-3.5 rounded border border-foreground/20" style={{ backgroundColor: selectedCellColor || 'transparent' }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 rounded-xl border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('tableEditor.cellBackgroundColor')}</p>
            <div className="grid grid-cols-4 gap-2">
              {TABLE_CELL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`h-9 rounded-lg border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedCellColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border'}`}
                  style={{ backgroundColor: color }}
                  aria-label={t('tableEditor.setCellColor', { color })}
                  onClick={() => setCellColor(color)}
                />
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setCellColor(null)}>
              {t('tableEditor.clearCellBackgroundColor')}
            </Button>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('courseEditorForms.deleteTable')}</span>
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{t('tableEditor.help')}</p>
    </div>
  );
}

const MenuBar = ({ editor, enableTables = false }: { editor: any; enableTables?: boolean }) => {
  const { t } = useTranslation();
  const [, refreshEditorState] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => refreshEditorState();
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);
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
    <div className="rounded-t-md border-b border-border bg-muted/40">
      <div className="flex flex-wrap items-center gap-1 p-2">
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
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className={`h-4 w-4 ${editor.isActive('heading', { level: 3 }) ? 'text-primary' : ''}`} />
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
          <TableToolButton label={t('courseEditorForms.insertTable')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <Table2 className="h-4 w-4" />
          </TableToolButton>
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
      {enableTables && editor.isActive('table') && (
        <TableActions editor={editor} t={t} />
      )}
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
        LessonTable,
        LessonTableCell,
        LessonTableHeader,
        LessonTableRow,
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
          if (enableTables && beginTableRowResize(view, event as MouseEvent)) return true;
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
            border: 1px solid hsl(var(--foreground) / 0.42);
            border-radius: 0.75rem;
            box-shadow: 0 0 0 1px hsl(var(--background) / 0.2) inset;
          }
          .tiptap-editor table {
            min-width: 32rem;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .tiptap-editor th,
          .tiptap-editor td {
            min-width: 7rem;
            border: 1px solid hsl(var(--foreground) / 0.35);
            padding: 0.625rem 0.75rem;
            vertical-align: top;
          }
          .tiptap-editor table th:not([data-landa-cell-bg]) {
            color: hsl(var(--foreground)) !important;
            background: hsl(var(--muted)) !important;
            font-weight: 700 !important;
            border-color: hsl(var(--foreground) / 0.46) !important;
          }
          .tiptap-editor table tr.landa-table-row-resizing > th,
          .tiptap-editor table tr.landa-table-row-resizing > td {
            user-select: none;
          }
          .tiptap-editor table tr[data-landa-row-height] > th,
          .tiptap-editor table tr[data-landa-row-height] > td {
            height: inherit;
          }
          .tiptap-editor .selectedCell::after {
            background: hsl(var(--primary) / 0.18);
            border: 1px solid hsl(var(--primary) / 0.75);
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
