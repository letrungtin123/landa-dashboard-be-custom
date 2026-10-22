import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { richQuizHtmlToText, type QuizConversionLoss } from '@/utils/quiz-authoring.logic';

/** An old rich stem or explanation stays in the rich editor until the author presses "Chuyển sang khung chuẩn".
 * What plain text cannot keep (images, formulas, links, formatting, tables, list numbering) is named in a confirmation
 * first, read from the content as it is while the confirmation is open; nothing is converted silently, and closing
 * without saving undoes it. */
export function ProblemRichToStandard({ html, kind, disabled = false, onConvert }: {
  html: string; kind: 'question' | 'explanation'; disabled?: boolean; onConvert: (text: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  // Read again on every render while asking: the content may change while the confirmation is open.
  const current = asking ? richQuizHtmlToText(html, kind) : null;
  const losses: QuizConversionLoss[] | null = current ? current.losses : null;
  // The content as it is now, which is what the confirmation on screen names.
  const convert = () => { setAsking(false); onConvert(richQuizHtmlToText(html, kind).text); };
  const start = () => {
    const result = richQuizHtmlToText(html, kind);
    if (result.losses.length) setAsking(true); else onConvert(result.text);
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button ref={button} type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled} aria-expanded={!!losses} onClick={start}>
        <LayoutList className="h-3.5 w-3.5" aria-hidden />{t('quizText.toStandard')}</Button>
      <span className="text-xs text-muted-foreground">{t('quizText.standardHint')}</span>
    </div>
    {losses && <div role="alertdialog" aria-labelledby={`${id}-lose`} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p id={`${id}-lose`}>{losses.length ? t('quizText.loseAsk', { items: losses.map(loss => t(`quizText.lose.${loss}`)).join(', ') })
        : t('quizText.convertAsk')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" autoFocus onClick={convert}>{t('quizText.convert')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setAsking(false); button.current?.focus(); }}>{t('quizText.cancel')}</Button>
      </div>
    </div>}
  </div>;
}
