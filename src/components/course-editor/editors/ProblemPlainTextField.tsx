import { useState } from 'react';

/** Multi-line plain text for an AI ID quiz stem or explanation (QC 21/10, B1/B2): every line feed is kept, nothing is
 * turned into markup. The text is owned here while the editor is open; the parent stores it back in its element. */
export function ProblemPlainTextField({ initial, label, hint, onChange }: {
  initial: string; label: string; hint: string; onChange: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return <div className="space-y-1.5">
    <textarea aria-label={label} value={text} rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
      className="flex min-h-[120px] w-full resize-y rounded-md border border-input bg-background px-4 py-3 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onChange={event => { setText(event.target.value); onChange(event.target.value); }} />
    <p className="text-xs text-muted-foreground">{hint}</p>
  </div>;
}
