import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTooltip } from '@/components/ui/tooltip';

export interface CarouselOrderImage {
  id: string;
  src: string;
  alt?: string;
  isDeleting?: boolean;
}

interface CarouselImageOrderProps {
  images: CarouselOrderImage[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove?: (index: number) => void;
}

export default function CarouselImageOrder({ images, onMove, onRemove }: CarouselImageOrderProps) {
  if (!images.length) return null;

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= images.length || fromIndex === toIndex) return;
    onMove(fromIndex, toIndex);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image, index) => (
        <div key={image.id} className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          <div className="relative flex h-28 items-center justify-center bg-muted/30 p-2">
            <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-bold text-muted-foreground shadow-sm">
              #{index + 1}
            </span>
            <img
              src={image.src}
              alt={image.alt || `Ảnh carousel ${index + 1}`}
              className="max-h-full max-w-full rounded object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {image.alt || `Ảnh ${index + 1}`}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <AppTooltip content="Chuyển ảnh sang trái"><Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => moveImage(index, index - 1)}
                disabled={index === 0}

                aria-label={`Move image ${index + 1} left`}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button></AppTooltip>
              <AppTooltip content="Chuyển ảnh sang phải"><Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => moveImage(index, index + 1)}
                disabled={index === images.length - 1}

                aria-label={`Move image ${index + 1} right`}
              >
                <ArrowRight className="h-4 w-4" />
              </Button></AppTooltip>
              {onRemove && (
                <AppTooltip content="Xóa ảnh"><Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(index)}
                  disabled={image.isDeleting}

                  aria-label={`Remove image ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button></AppTooltip>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
