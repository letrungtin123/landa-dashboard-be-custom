import { useEffect, useState } from 'react';

// Import video assets
import pcVideo from '@/assets/loginpage/pc-login.mp4';
import mobileVideo from '@/assets/loginpage/mobile-login.mp4';
// First frame of the PC video (40 KB): shown at once, the video then plays over it.
// The mobile video starts on black, so the dark background is its poster.
import pcPoster from '@/assets/loginpage/pc-login-poster.webp';

/** The browser's data saver is on: keep the still first frame, skip the video download. */
function prefersReducedData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * AnimatedBackground
 * Displays a looping background video (different versions for PC and Mobile).
 * The video (2.6 MB PC, 6.2 MB mobile) is requested only after the page has
 * loaded, so the sign-in form's script, styles and images download first.
 */
export function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [videoAllowed, setVideoAllowed] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check initial screen width
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();

    // Listen for resize to switch video if needed
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (prefersReducedData()) return;
    const allowVideo = () => setVideoAllowed(true);
    if (document.readyState === 'complete') {
      allowVideo();
      return;
    }
    window.addEventListener('load', allowVideo, { once: true });
    return () => window.removeEventListener('load', allowVideo);
  }, []);

  if (!mounted) {
    return <div className="fixed inset-0 pointer-events-none -z-10 bg-[#020617]" />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-[#020617]">
      {!isMobile && (
        <img
          src={pcPoster}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {videoAllowed && (
        <video
          key={isMobile ? 'mobile' : 'pc'}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          poster={isMobile ? undefined : pcPoster}
        >
          <source src={isMobile ? mobileVideo : pcVideo} type="video/mp4" />
        </video>
      )}

      {/* Vignette Overlay for better text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(2, 6, 23, 0.8) 120%)'
        }}
      />
    </div>
  );
}
