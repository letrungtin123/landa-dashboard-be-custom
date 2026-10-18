import { useTranslation } from 'react-i18next';

/** Last row of a Select list whose options come in pages: loads the next page. */
export function SelectLoadMore({ shown, total, loading, onLoadMore }: {
  shown: number;
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
      disabled={loading}
      onClick={onLoadMore}
    >
      {loading ? t('common.loading') : t('common.loadMoreShown', { shown, total })}
    </button>
  );
}
