import { useState } from 'react';
import { QuizTextField } from '@/components/shared/quiz-text-field';
import { plainProblemHtml, type ProblemPlainTag } from '@/utils/quiz-text.logic';
import { plainQuizTextToRichHtml, quizFieldFromHtml, type QuizFieldMode } from '@/utils/quiz-authoring.logic';
import RichTextEditor from '../RichTextEditor';
import { ProblemRichToStandard } from './ProblemRichToStandard';

/**
 * The stem or explanation of a hand-made problem (owner decision 22/10). Plain text opens in the standard frame, the
 * format AI ID writes, stored as `<label>`/`<p>` text with its line feeds; "Soạn tự do" switches to the rich editor
 * keeping the text (lines become paragraphs; asked first when the look changes). Content with markup or attributes
 * opens in the rich editor, unchanged until the author presses "Chuyển sang khung chuẩn". The mode is decided when the
 * problem opens; the parent keys this to reset it. A starter stem ("Câu hỏi của bạn") shows as an empty box with the
 * example; left empty, the starter text is kept, so an untouched new problem still saves a valid question.
 */
export function ProblemTextSection({ kind, html, label, choices = null, templateLocale, onHtmlChange }: {
  kind: 'question' | 'explanation'; html: string; label: string;
  /** Explanation of a choice question: template, checks and the highlighted correct option. */
  choices?: readonly { correct: boolean }[] | null;
  /** The quiz's language for the template words, when known. */
  templateLocale?: 'vi' | 'en';
  onHtmlChange: (html: string) => void;
}) {
  const fallback: ProblemPlainTag = kind === 'question' ? 'label' : 'p';
  const [field, setField] = useState<QuizFieldMode>(() => quizFieldFromHtml(html, fallback, kind));
  // An empty explanation is no explanation; an empty stem keeps its starter text, or stays an empty element.
  const store = (tag: ProblemPlainTag, text: string, starter?: string) => onHtmlChange(text.trim() ? plainProblemHtml(tag, text)
    : kind === 'explanation' ? '' : plainProblemHtml(tag, starter ?? text));
  if (field.mode === 'plain') {
    return <QuizTextField kind={kind} value={field.text} label={label} choices={choices} templateLocale={templateLocale} starter={field.starter}
      onChange={text => { setField({ ...field, text }); store(field.tag, text, field.starter); }}
      onSwitchToRich={() => { setField({ mode: 'rich' }); onHtmlChange(plainQuizTextToRichHtml(field.text.trim() ? field.text : field.starter ?? '')); }} />;
  }
  return <div className="space-y-2">
    <ProblemRichToStandard html={html} kind={kind}
      onConvert={text => { setField({ mode: 'plain', tag: fallback, text }); store(fallback, text); }} />
    <RichTextEditor content={html} onChange={onHtmlChange} minHeight="min-h-[120px]" />
  </div>;
}
