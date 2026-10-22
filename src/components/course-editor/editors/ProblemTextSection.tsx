import { useState } from 'react';
import { QuizTextField } from '@/components/shared/quiz-text-field';
import { plainProblemHtml, type ProblemPlainTag } from '@/utils/quiz-text.logic';
import { plainQuizTextToRichHtml, quizFieldFromHtml, type QuizFieldMode } from '@/utils/quiz-authoring.logic';
import RichTextEditor from '../RichTextEditor';
import { ProblemRichToStandard } from './ProblemRichToStandard';

/**
 * The stem or explanation of a hand-made problem (owner decision 22/10). Plain text opens in the standard frame, the
 * format AI ID writes, stored as `<label>`/`<p>` text with its line feeds; "Soạn tự do" switches to the rich editor
 * keeping the text (lines become paragraphs). Content with markup opens in the rich editor, unchanged until the author
 * presses "Chuyển sang khung chuẩn". The mode is decided when the problem opens; the parent keys this to reset it.
 */
export function ProblemTextSection({ kind, html, label, choices = null, onHtmlChange }: {
  kind: 'question' | 'explanation'; html: string; label: string;
  /** Explanation of a choice question: template, checks and the highlighted correct option. */
  choices?: readonly { correct: boolean }[] | null;
  onHtmlChange: (html: string) => void;
}) {
  const fallback: ProblemPlainTag = kind === 'question' ? 'label' : 'p';
  const [field, setField] = useState<QuizFieldMode>(() => quizFieldFromHtml(html, fallback));
  // An empty explanation is no explanation; an empty stem stays an empty element.
  const store = (tag: ProblemPlainTag, text: string) => onHtmlChange(kind === 'explanation' && !text.trim() ? '' : plainProblemHtml(tag, text));
  if (field.mode === 'plain') {
    return <QuizTextField kind={kind} value={field.text} label={label} choices={choices}
      onChange={text => { setField({ ...field, text }); store(field.tag, text); }}
      onSwitchToRich={() => { setField({ mode: 'rich' }); onHtmlChange(plainQuizTextToRichHtml(field.text)); }} />;
  }
  return <div className="space-y-2">
    <ProblemRichToStandard html={html} kind={kind}
      onConvert={text => { setField({ mode: 'plain', tag: fallback, text }); store(fallback, text); }} />
    <RichTextEditor content={html} onChange={onHtmlChange} minHeight="min-h-[120px]" />
  </div>;
}
