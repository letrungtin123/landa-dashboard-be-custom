import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ImageCarouselProps {
  images: { src: string; alt: string }[];
}

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((i) => (i + 1) % images.length);
  };

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  };

  return (
    <div className="relative w-full mb-4 group rounded-lg overflow-hidden bg-muted/20 flex flex-col items-center justify-center border border-border shadow-sm">
      {/* Container ảnh với fixed chiều cao tối đa để tránh bị giật khi ảnh to nhỏ */}
      <div className="relative w-full h-[300px] flex items-center justify-center p-2">
        <img
          src={images[currentIndex].src}
          alt={images[currentIndex].alt || t('courseEditorForms.image', { count: currentIndex + 1 })}
          className="max-w-full max-h-full object-contain transition-opacity duration-300"
        />

        {/* Nút điều hướng */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={t('courseEditorForms.previousImage')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={t('courseEditorForms.nextImage')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Dấu chấm chỉ báo */}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentIndex ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/40'
              }`}
              aria-label={t('courseEditorForms.goToSlide', { count: idx + 1 })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
