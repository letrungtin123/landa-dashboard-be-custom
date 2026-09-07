import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import { useTranslation } from 'react-i18next';

interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

interface FaqEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  items: FaqItem[];
  onItemsChange: (items: FaqItem[]) => void;
}

export default function FaqEditor({
  displayName, onDisplayNameChange,
  items, onItemsChange,
}: FaqEditorProps) {
  const { t } = useTranslation();

  const addItem = () => {
    const nextId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    onItemsChange([...items, { id: nextId, question: '', answer: '' }]);
  };

  const updateItem = (idx: number, field: keyof FaqItem, value: string) => {
    onItemsChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    onItemsChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">
      <Field label={t('courseUnit.displayName')}>
        <input
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">{t('courseEditorForms.faqList', { count: items.length })}</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('courseEditorForms.faqIntro')}
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" /> {t('courseEditorForms.addQuestion')}
          </Button>
        </div>

        {items.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            {t('courseEditorForms.faqEmpty')}
          </div>
        )}

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="app-liquid-card border border-border rounded-xl p-4 bg-card space-y-3 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('courseEditorForms.faqItem', { count: idx + 1 })}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() => removeItem(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('courseEditorForms.question')}</label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={item.question}
                  onChange={e => updateItem(idx, 'question', e.target.value)}
                  placeholder={t('courseEditorForms.questionPlaceholder')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('courseEditorForms.answer')}</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  rows={3}
                  value={item.answer}
                  onChange={e => updateItem(idx, 'answer', e.target.value)}
                  placeholder={t('courseEditorForms.answerPlaceholder')}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-700 dark:text-teal-300">
        <strong>{t('courseEditorForms.note')}</strong> {t('courseEditorForms.faqNote')}
      </div>
    </div>
  );
}

export type { FaqItem };
