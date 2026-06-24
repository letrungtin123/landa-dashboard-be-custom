import { useEffect, useState } from 'react';

// Import video assets
import pcVideo from '@/assets/loginpage/pc-login.mp4';
import mobileVideo from '@/assets/loginpage/mobile-login.mp4';

/**
 * AnimatedBackground
 * Displays a looping background video (different versions for PC and Mobile).
 */
export function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  if (!mounted) {
    return <div className="fixed inset-0 pointer-events-none -z-10 bg-[#020617]" />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-[#020617]">
      <video
        key={isMobile ? 'mobile' : 'pc'}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src={isMobile ? mobileVideo : pcVideo} type="video/mp4" />
      </video>
      
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
