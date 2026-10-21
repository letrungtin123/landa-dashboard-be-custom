import { Check } from 'lucide-react';
import { problemPlainText, quizExplanationLines, quizQuestionBlocks } from '../../utils/quiz-text.logic';

/** Quiz stem and explanation from plain text (QC 21/10, B1/B2): React text only, nothing becomes markup. */

/** Context in normal weight, `- ` lines as a list, the question line in bold, at a moderate size. */
export function QuizQuestionText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = quizQuestionBlocks(text);
  if (!blocks.length) return null;
  return <div data-quiz-question="" className={`space-y-2 whitespace-normal break-words text-[15px] leading-7 text-foreground sm:text-base ${className}`}>
    {blocks.map((block, index) => block.kind === 'list'
      ? <ul key={index} className="list-disc space-y-1 pl-5">{block.items.map((item, at) => <li key={at}>{item}</li>)}</ul>
      : <p key={index} className={block.question ? 'font-semibold' : 'font-normal text-foreground/85'}>{block.text}</p>)}
  </div>;
}

/** The principle, then one line per option; the correct option stands out (colour, weight, a check mark and its
 * meaning for screen readers). */
export function QuizExplanationText({ text, correctLetters = [], correctLabel, className = '' }: {
  text: string; correctLetters?: readonly string[]; correctLabel: string; className?: string;
}) {
  const lines = quizExplanationLines(text, correctLetters);
  if (!lines.length) return null;
  return <div data-quiz-explanation="" className={`space-y-1.5 whitespace-normal break-words text-sm leading-6 text-foreground ${className}`}>
    {lines.map((line, index) => line.kind === 'text' ? <p key={index}>{line.text}</p>
      : <p key={index} data-correct={line.correct ? 'true' : undefined}
        className={`flex items-start gap-2 rounded-lg px-2 py-1 ${line.correct ? 'bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300' : 'text-foreground/85'}`}>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${line.correct ? 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950' : 'bg-muted text-muted-foreground'}`}>{line.letter}</span>
        <span className="min-w-0 flex-1">{line.text}</span>
        {line.correct && <><Check className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden /><span className="sr-only">{correctLabel}</span></>}
      </p>)}
  </div>;
}

/** A stored problem stem (`<label>` text from AI ID, or rich text from the editor). Plain text gets the layout above;
 * rich text keeps its own markup through the caller's sanitizer, at the same moderate size. */
export function ProblemQuestionPreview({ html, renderHtml }: { html: string; renderHtml: (html: string) => string }) {
  const plain = problemPlainText(html);
  if (plain?.text.trim()) return <QuizQuestionText text={plain.text} />;
  return <div className="text-[15px] font-semibold leading-7 text-foreground sm:text-base [&_p]:m-0"
    dangerouslySetInnerHTML={{ __html: renderHtml(html) }} />;
}

/** A stored explanation (`<p>` text from AI ID, or rich text from the editor). */
export function ProblemExplanationPreview({ html, renderHtml, correctLetters, correctLabel }: {
  html: string; renderHtml: (html: string) => string; correctLetters: readonly string[]; correctLabel: string;
}) {
  const plain = problemPlainText(html);
  if (plain?.text.trim()) return <QuizExplanationText text={plain.text} correctLetters={correctLetters} correctLabel={correctLabel} />;
  return <div className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed text-foreground/90 [&_p]:m-0"
    dangerouslySetInnerHTML={{ __html: renderHtml(html) }} />;
}
