import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

/**
 * CrosswordPreviewInteractive
 * 
 * Logic chính xác theo la-crossword-xblock gốc:
 * - Mỗi word = 1 HÀNG NGANG (across), tất cả direction luôn là "across".
 * - word.row = chỉ số hàng (thường = index trong mảng).
 * - word.col = offset cột (thụt đầu hàng).
 * - keywordCol = cột dọc được highlight (tạo thành từ khóa chính).
 * 
 * Props:
 * - parsed.words: mảng CrosswordWord
 * - parsed.keyword_coordinates: mảng {row, col} hoặc rỗng
 * - showAnswers: nếu true, hiển thị đáp án sẵn (dùng trong Editor preview)
 */
export function CrosswordPreviewInteractive({ parsed, showAnswers = false }: { parsed: any; showAnswers?: boolean }) {
  const { t } = useTranslation();
  const words: any[] = parsed?.words || [];
  const keywordCoords: any[] = parsed?.keyword_coordinates || [];
  
  // Xác định keywordCol: lấy col từ phần tử đầu tiên của keyword_coordinates
  const keywordCol = keywordCoords.length > 0 ? (keywordCoords[0].col ?? -1) : -1;

  // Tính kích thước lưới
  // Mỗi word chiếm 1 row, bắt đầu từ word.col, dài bằng word.answer.length (hoặc word.length)
  const totalRows = words.length;
  const totalCols = Math.min(30, Math.max(0, ...words.map((w: any) => {
    const ansLen = w.answer ? w.answer.length : (w.length || 0);
    return Math.min((w.col || 0), 20) + ansLen;
  })));

  // State cho input của học viên (chỉ dùng khi showAnswers = false)
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [validationMsg, setValidationMsg] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  // Tạo map: key "row-col" → ký tự đáp án đúng
  const correctMap: Record<string, string> = {};
  // Tạo set: các ô hợp lệ (có thể gõ vào)
  const validCells = new Set<string>();
  // Tạo map: key "row-col" → true nếu ô đó là keyword column
  const keywordCells = new Set<string>();

  words.forEach((w: any, rowIndex: number) => {
    const row = rowIndex; // Mỗi word = 1 hàng, row = index
    const startCol = w.col || 0;
    const answerStr = w.answer || '';

    for (let i = 0; i < answerStr.length; i++) {
      const col = startCol + i;
      const key = `${row}-${col}`;
      validCells.add(key);
      correctMap[key] = answerStr[i].toUpperCase();

      if (col === keywordCol) {
        keywordCells.add(key);
      }
    }
  });

  // Auto-focus: trong crossword gốc tất cả đều ngang → nhảy sang phải
  const focusCell = useCallback((row: number, col: number) => {
    if (!gridRef.current) return;
    const el = gridRef.current.querySelector(`#cw-cell-${row}-${col}`) as HTMLInputElement;
    if (el && !el.disabled) el.focus();
  }, []);

  const renderGrid = () => {
    const rows = [];
    for (let r = 0; r < totalRows; r++) {
      const word = words[r];
      const startCol = word?.col || 0;
      const answerStr = word?.answer || '';
      const answerLen = answerStr.length || (word?.length || 0);
      const wordId = word?.id ?? (r + 1);
      const cols = [];

      for (let c = 0; c < totalCols; c++) {
        const key = `${r}-${c}`;
        const isValid = validCells.has(key);
        const isKeyword = keywordCells.has(key);

        if (!isValid) {
          // Ô trống (không thuộc từ nào)
          cols.push(<div key={key} className="w-12 h-12 shrink-0"></div>);
        } else {
          // Xác định style
          let bgClass = 'bg-background border-primary/30';
          let textColorClass = 'text-foreground';
          let focusStyle = 'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary';
          let extraStyle = '';

          if (isKeyword && !submitted) {
            bgClass = 'bg-primary border-primary';
            textColorClass = 'text-primary-foreground';
            focusStyle = 'focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/80';
          }

          if (showAnswers) {
            focusStyle = '';
            if (isKeyword) {
              bgClass = 'bg-primary border-primary';
              textColorClass = 'text-primary-foreground';
            } else {
              bgClass = 'bg-primary/10 border-primary';
              textColorClass = 'text-primary';
            }
          }

          if (submitted && !showAnswers) {
            focusStyle = '';
            // Giữ nguyên style keyword khi submitted, không highlight đúng/sai từng ô
            if (isKeyword) {
              bgClass = 'bg-primary border-primary';
              textColorClass = 'text-primary-foreground';
            } else {
              bgClass = 'bg-primary/10 border-primary';
              textColorClass = 'text-primary';
            }
          }

          const displayValue = showAnswers ? (correctMap[key] || '') : (inputs[key] || '');

          cols.push(
            <div key={key} className="relative w-12 h-12 shrink-0">
              <input
                id={`cw-cell-${r}-${c}`}
                maxLength={1}
                disabled={submitted || showAnswers}
                readOnly={showAnswers}
                className={`w-full h-full border-2 rounded-xl text-center font-bold text-xl uppercase transition-colors duration-200 ${bgClass} ${textColorClass} ${focusStyle}`}
                value={displayValue}
                onChange={e => {
                  if (showAnswers) return;
                  const val = e.target.value.toUpperCase().replace(/[^A-ZĐ0-9]/g, '');
                  if (val.length > 1) return;
                  setInputs(prev => ({ ...prev, [key]: val }));
                  if (val) focusCell(r, c + 1);
                }}
                onKeyDown={e => {
                  if (showAnswers) return;
                  if (e.key === 'Backspace' && !inputs[key]) {
                    e.preventDefault();
                    focusCell(r, c - 1);
                  }
                }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
            </div>
          );
        }
      }

      // Thêm số thứ tự hàng ở bên trái
      rows.push(
        <div key={r} className="flex items-center gap-2">
          <span className="w-8 text-right text-[15px] font-semibold text-muted-foreground select-none shrink-0">
            {wordId}.
          </span>
          {cols}
        </div>
      );
    }
    return (
      <div ref={gridRef} className="mx-auto flex w-fit max-w-none flex-col gap-2">
        {rows}
      </div>
    );
  };

  if (words.length === 0) {
    return (
      <div className="p-8 border-2 border-dashed border-primary/30 rounded-2xl text-center text-muted-foreground bg-background">
        {t('courseEditorForms.crosswordEmpty')}
      </div>
    );
  }

  return (
    <div className="h-full w-full min-w-0 overflow-hidden rounded-[24px] border border-border bg-muted/10 p-4 font-sans shadow-sm sm:p-6 lg:p-10">
      {/* Grid */}
      <div className="min-w-0">
        <div className="custom-scrollbar w-full min-w-0 overflow-x-auto pb-4 pt-2">
          {renderGrid()}
        </div>
      </div>

      {/* Danh sách câu hỏi */}
      <div className="app-liquid-card mt-6 min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:mt-10 sm:p-6">
        <h3 className="mb-4 text-lg font-bold text-card-foreground sm:mb-6">{t('courseEditorForms.crosswordQuestions')}</h3>
        <ul className="min-w-0 space-y-3 text-[15px] text-muted-foreground">
          {words.map((w: any, idx: number) => (
            <li
              key={w.id ?? idx}
              className="flex min-w-0 items-start gap-3 rounded-xl border border-transparent bg-muted/30 px-3 py-3.5 transition-colors hover:border-primary/30 sm:gap-4 sm:px-5"
            >
              <span className="font-bold text-primary shrink-0 mt-0.5">{w.id ?? idx + 1}.</span>
              <div className="min-w-0 flex-1">
                <span className="break-words leading-relaxed">{w.clue || t('courseEditorForms.noClue')}</span>
                {w.hint && (
                  <span className="mt-1 block break-words text-xs text-amber-600 dark:text-amber-400">
                    💡 {t('courseUnit.hint')}: {w.hint}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Thông báo chưa nhập đủ */}
      {validationMsg && !submitted && (
        <div className="mt-6 flex min-w-0 items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shrink-0">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          </div>
          <p className="min-w-0 break-words text-sm font-medium text-amber-700 dark:text-amber-300">{validationMsg}</p>
        </div>
      )}

      {/* Kết quả sau khi nộp bài — chỉ đúng/sai toàn bộ */}
      {!showAnswers && submitted && (() => {
        let allCorrect = true;
        for (const key of validCells) {
          const userVal = (inputs[key] || '').toUpperCase();
          const correctVal = correctMap[key] || '';
          if (userVal !== correctVal) { allCorrect = false; break; }
        }

        return (
          <div className={`mt-6 flex min-w-0 items-center gap-3 rounded-xl p-4 ${allCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            {allCorrect ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
            )}
            <p className="min-w-0 break-words text-sm font-bold text-foreground">
              {allCorrect ? t('courseEditorForms.crosswordCorrect') : t('courseEditorForms.crosswordIncorrect')}
            </p>
          </div>
        );
      })()}

      {/* Nút Submit — ẩn khi showAnswers */}
      {!showAnswers && (
        <div className="flex justify-center pt-6">
          <Button
            variant="default"
            className="min-w-[200px] h-12 rounded-full font-bold text-[15px] shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
            onClick={() => {
              if (submitted) {
                setSubmitted(false);
                setInputs({});
                setValidationMsg('');
              } else {
                // Validate: kiểm tra đã nhập đủ hết ô chưa
                let allFilled = true;
                for (const key of validCells) {
                  if (!(inputs[key] || '').trim()) { allFilled = false; break; }
                }
                if (!allFilled) {
                  setValidationMsg(t('courseEditorForms.crosswordCompleteRequired'));
                  return;
                }
                setValidationMsg('');
                setSubmitted(true);
              }
            }}
          >
            {submitted ? t('courseEditorForms.retry') : t('courseEditorForms.submitForReview')}
          </Button>
        </div>
      )}
    </div>
  );
}
