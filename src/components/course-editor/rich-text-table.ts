import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MIN_ROW_HEIGHT = 32;
const MAX_ROW_HEIGHT = 480;

export function normalizeTableCellColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized.toUpperCase() : null;
}

export function normalizeTableRowHeight(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d{1,3}$/.test(value.trim())
      ? Number(value)
      : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < MIN_ROW_HEIGHT || parsed > MAX_ROW_HEIGHT) {
    return null;
  }

  return parsed;
}

function cellBackgroundColorAttribute() {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => (
      normalizeTableCellColor(
        element.getAttribute('data-landa-cell-bg')
        || element.getAttribute('bgcolor'),
      )
    ),
    renderHTML: (attributes: Record<string, unknown>) => {
      const color = normalizeTableCellColor(attributes.backgroundColor);
      return color
        ? {
            'data-landa-cell-bg': color,
            style: `background-color: ${color};`,
          }
        : {};
    },
  };
}

const rowHeightAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => (
    normalizeTableRowHeight(element.getAttribute('data-landa-row-height'))
  ),
  renderHTML: (attributes: Record<string, unknown>) => {
    const height = normalizeTableRowHeight(attributes.rowHeight);
    return height
      ? {
          'data-landa-row-height': String(height),
          style: `height: ${height}px;`,
        }
      : {};
  },
};

export const LessonTable = Table.configure({
  resizable: true,
  handleWidth: 8,
  cellMinWidth: 96,
  lastColumnResizable: true,
  HTMLAttributes: { class: 'landa-rich-table' },
});

export const LessonTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: cellBackgroundColorAttribute(),
    };
  },
});

export const LessonTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: cellBackgroundColorAttribute(),
    };
  },
});

export const LessonTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: rowHeightAttribute,
    };
  },
});

export const TABLE_ROW_HEIGHT_LIMITS = {
  min: MIN_ROW_HEIGHT,
  max: MAX_ROW_HEIGHT,
} as const;
