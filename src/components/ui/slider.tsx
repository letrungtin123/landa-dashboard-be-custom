// =========================
// File: src/components/ui/slider.tsx
// =========================
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useTranslation } from "react-i18next";

function cn(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { t } = useTranslation();

  return (
    <SliderPrimitive.Root
      ref={ref}
      orientation="horizontal"
      // Quan trọng: pointer-events auto + touch-action none để kéo mượt
      className={cn(
        "relative flex w-full items-center select-none pointer-events-auto",
        "touch-none", // tailwind -> touch-action:none
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-200",
          "pointer-events-auto" // track cho phép bắt pointer để drag
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full bg-blue-500",
            "pointer-events-none" // range không cần bắt sự kiện
          )}
        />
      </SliderPrimitive.Track>

      <SliderPrimitive.Thumb
        // Tăng hit-area + đảm bảo pointer-events hoạt động
        className={cn(
          "block h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          "pointer-events-auto cursor-grab active:cursor-grabbing",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
        aria-label={t("common.sliderThumb")}
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = "Slider";
