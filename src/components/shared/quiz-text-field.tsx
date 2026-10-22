import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Eye, ListPlus, PenLine, WandSparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { QuizExplanationText, QuizQuestionText } from './quiz-text';
import { quizCorrectLetters, xmlSafeText } from '../../utils/quiz-text.logic';
import {
  insertQuizListItem, quizChoiceLimit, quizExplanationChecks, quizExplanationTemplate, quizRichSwitchChangesLook, type QuizExplanationCheck,
} from '../../utils/quiz-authoring.logic';

type Translate = ReturnType<typeof useTranslation>['t'];
/** One plain sentence per soft check. */
export function quizCheckText(t: Translate, check: QuizExplanationCheck): string {
  if (check.kind === 'extra') return t('quizText.check.extra', { letters: check.letters.join(', ') });
  if (check.kind === 'missing') return t('quizText.check.missing', { letters: check.letters.join(', ') });
  if (check.kind === 'says_correct') return check.correct.length
    ? t('quizText.check.saysCorrect', { letter: check.letter, correct: check.correct.join(', ') })
    : t('quizText.check.saysCorrectNone', { letter: check.letter });
  if (check.kind === 'says_wrong') return t('quizText.check.saysWrong', { letter: check.letter });
  return t('quizText.check.noReason', { letter: check.letter });
}

/**
 * The standard frame for a quiz stem or explanation, the format AI ID writes: one multi-line box, the
 * "+ Thêm ý" (stem) or "Chèn mẫu" (explanation) button, a short hint, soft checks (explanation) and a live
 * "Học viên sẽ thấy" preview. Plain text only, cleaned of characters XML cannot hold (a PowerPoint paste); the parent
 * stores it. `choices` null: a typed answer.
 */
export function QuizTextField({ kind, value, onChange, label, choices = null, templateLocale, disabled = false, maxLength, lang, starter, onSwitchToRich }: {
  kind: 'question' | 'explanation'; value: string; onChange: (text: string) => void; label: string;
  choices?: readonly { correct: boolean }[] | null;
  /** The quiz's language for the template words; the screen language when not known. */
  templateLocale?: 'vi' | 'en'; disabled?: boolean; maxLength?: number; lang?: string;
  /** The starter stem this field opened with (shown empty): kept when the box is left empty. */
  starter?: string;
  /** Shown only where the rich editor exists (course editor): "Soạn tự do". */
  onSwitchToRich?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null), templateButton = useRef<HTMLButtonElement>(null);
  const caret = useRef<number | null>(null);
  const freeButton = useRef<HTMLButtonElement>(null);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [confirmFree, setConfirmFree] = useState(false);
  // Put the cursor where the author types next, once the parent has stored the inserted text; a pending position
  // never outlives the change it was made for.
  useEffect(() => {
    const at = caret.current;
    caret.current = null;
    if (at === null || !box.current || box.current.value !== value) return;
    box.current.focus();
    box.current.setSelectionRange(at, at);
  }, [value]);
  const locale = templateLocale ?? (/^en(?:[-_]|$)/i.test(i18n.language) ? 'en' : 'vi');
  const question = kind === 'question';
  const checks = question ? [] : quizExplanationChecks(value, choices);
  const limit = question ? null : quizChoiceLimit(choices);
  const put = (text: string, at: number) => {
    // Unchanged text (the same template again) re-renders nothing: place the cursor now, leave nothing pending.
    if (text === value) { box.current?.focus(); box.current?.setSelectionRange(at, at); return; }
    caret.current = at;
    onChange(text);
  };
  const switchToRich = () => {
    if (!onSwitchToRich) return;
    if (quizRichSwitchChangesLook(kind, value)) setConfirmFree(true); else onSwitchToRich();
  };
  const addItem = () => { const next = insertQuizListItem(value); put(next.text, next.caret); };
  const applyTemplate = () => {
    const template = quizExplanationTemplate(choices, locale);
    setConfirmTemplate(false);
    put(template, template.indexOf('\n') < 0 ? template.length : template.indexOf('\n'));
  };
  const hint = question ? t('courseUnit.quizQuestionPlainHint') : t('courseUnit.quizExplanationPlainHint');
  return <div className="space-y-2" data-quiz-field={kind}>
    <div className="flex flex-wrap items-center gap-2">
      {question
        ? <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled} onClick={addItem}>
          <ListPlus className="h-3.5 w-3.5" aria-hidden />{t('quizText.addItem')}</Button>
        : <Button ref={templateButton} type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled}
          aria-expanded={confirmTemplate} onClick={() => value.trim() ? setConfirmTemplate(true) : applyTemplate()}>
          <WandSparkles className="h-3.5 w-3.5" aria-hidden />{t('quizText.insertTemplate')}</Button>}
      {onSwitchToRich && <Button ref={freeButton} type="button" variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 text-xs text-muted-foreground"
        disabled={disabled} aria-expanded={confirmFree} onClick={switchToRich}><PenLine className="h-3.5 w-3.5" aria-hidden />{t('quizText.freeEditing')}</Button>}
    </div>
    {confirmFree && onSwitchToRich && <div role="alertdialog" aria-labelledby={`${id}-free`} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p id={`${id}-free`}>{question ? t('quizText.freeAskQuestion') : t('quizText.freeAskExplanation')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" autoFocus onClick={() => { setConfirmFree(false); onSwitchToRich(); }}>{t('quizText.freeConfirm')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setConfirmFree(false); freeButton.current?.focus(); }}>{t('quizText.freeCancel')}</Button>
      </div>
    </div>}
    {confirmTemplate && <div role="alertdialog" aria-labelledby={`${id}-replace`} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p id={`${id}-replace`}>{t('quizText.replaceAsk')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" autoFocus onClick={applyTemplate}>{t('quizText.replace')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setConfirmTemplate(false); templateButton.current?.focus(); }}>{t('quizText.keep')}</Button>
      </div>
    </div>}
    <textarea ref={box} aria-label={label} aria-describedby={[`${id}-hint`, limit && `${id}-limit`, checks.length && `${id}-checks`].filter(Boolean).join(' ')} value={value} disabled={disabled}
      maxLength={maxLength} lang={lang} placeholder={question ? t('quizText.questionPlaceholder') : t('quizText.explanationPlaceholder')}
      rows={Math.min(14, Math.max(5, value.split('\n').length + 1))}
      className="flex min-h-[120px] w-full resize-y rounded-md border border-input bg-background px-4 py-3 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      onChange={event => onChange(xmlSafeText(event.target.value))} />
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}{starter && !value.trim() ? ` ${t('quizText.starterKept', { text: starter })}` : ''}</p>
    {limit && <p id={`${id}-limit`} className="text-xs text-amber-700 dark:text-amber-400">{t('quizText.tooMany', { count: limit.count })}{limit.correctBeyond.length
      ? ` ${t('quizText.tooManyCorrect', { positions: limit.correctBeyond.join(', ') })}` : ''}</p>}
    {checks.length > 0 && <ul id={`${id}-checks`} aria-live="polite" className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
      {checks.map((check, index) => <li key={index} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{quizCheckText(t, check)}</li>)}
    </ul>}
    {value.trim() && <section aria-label={t('quizText.preview')} className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Eye className="h-3.5 w-3.5" aria-hidden />{t('quizText.preview')}</p>
      <div lang={lang}>{question ? <QuizQuestionText text={value} />
        : <QuizExplanationText text={value} correctLetters={choices ? quizCorrectLetters(choices) : []} correctLabel={t('courseUnit.quizCorrectOption')} />}</div>
    </section>}
  </div>;
}
