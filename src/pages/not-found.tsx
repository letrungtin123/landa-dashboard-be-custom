// ============================================================
// NotFoundPage — 404 page with theme support
// ============================================================

import { useNavigate } from 'react-router-dom';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-6">
      <div className="text-center max-w-md">
        {/* Animated icon */}
        <div className="relative mx-auto mb-8 w-28 h-28">
          <div className="absolute inset-0 rounded-3xl bg-destructive/10 animate-pulse" />
          <div className="absolute inset-2 rounded-2xl bg-destructive/5 flex items-center justify-center">
            <ShieldX className="h-14 w-14 text-destructive/60" />
          </div>
        </div>

        {/* Error code */}
        <h1 className="text-7xl font-black text-foreground/10 tracking-tighter leading-none mb-2 select-none">
          404
        </h1>

        {/* Title */}
        <h2 className="text-xl font-bold text-foreground mb-2">
          {t('notFound.title')}
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-xs mx-auto">
          {t('notFound.description')}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <Button
            onClick={() => navigate('/library')}
            className="gap-2 rounded-xl"
          >
            <Home className="h-4 w-4" />
            {t('notFound.home')}
          </Button>
        </div>
      </div>
    </div>
  );
}
