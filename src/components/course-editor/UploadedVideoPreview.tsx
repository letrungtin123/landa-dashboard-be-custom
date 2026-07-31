import { storageUrl } from '@/utils/storage-url';

interface UploadedVideoPreviewProps {
  storagePath?: string | null;
  src?: string | null;
  className?: string;
  videoClassName?: string;
  title?: string;
}

export default function UploadedVideoPreview({
  storagePath,
  src,
  className = 'aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm',
  videoClassName = 'h-full w-full object-contain',
  title = 'Uploaded video preview',
}: UploadedVideoPreviewProps) {
  const videoSrc = src || (storagePath ? storageUrl(storagePath) : '');
  if (!videoSrc) return null;

  return (
    <div className={className} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <video
        key={storagePath || videoSrc}
        src={videoSrc}
        controls
        className={videoClassName}
        preload="metadata"
        playsInline
        title={title}
      />
    </div>
  );
}