import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import VajranadLogo from './VajranadLogo';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [showTagline, setShowTagline] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);

  useEffect(() => {
    // Staggered presentation timings within the 7-second limit
    const t1 = setTimeout(() => setShowFullTitle(true), 1500);
    const t2 = setTimeout(() => setShowTagline(true), 3200);
    const t3 = setTimeout(() => {
      onComplete();
    }, 7000); // exactly 7 seconds total duration

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  // Generate 25 floating golden particles for ambient background depth
  const particles = Array.from({ length: 25 }).map((_, i) => ({
    id: i,
    size: Math.random() * 4 + 1.5,
    x: Math.random() * 100, // percentage
    y: Math.random() * 100, // percentage
    delay: Math.random() * 3,
    duration: Math.random() * 5 + 4,
  }));

  return (
    <div
      id="splash-screen"
      className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#0a0002] via-[#000000] to-[#0d0003] flex flex-col items-center justify-center text-white px-6"
    >
      {/* Background Starry Golden Dust Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-80">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-gradient-to-b from-[#FFF59D] to-[#D4AF37]"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              boxShadow: '0 0 10px #FFD54F, 0 0 20px #FFB300',
            }}
            animate={{
              y: ['0px', '-120px', '0px'],
              x: ['0px', `${Math.random() * 40 - 20}px`, '0px'],
              opacity: [0.1, 0.9, 0.1],
              scale: [1, 1.4, 1],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Radial center golden glow */}
      <div className="absolute w-[300px] h-[300px] sm:w-[450px] sm:h-[450px] rounded-full bg-[#D4AF37] opacity-[0.06] blur-[100px] pointer-events-none" />

      {/* Logo & Branding Showcase Container */}
      <div className="z-10 flex flex-col items-center justify-center text-center max-w-lg">
        {/* Slowly zoom, fade-in Logo with metallic shine sweeps */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1.05 }}
          transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-8"
        >
          <VajranadLogo size={240} animate={true} />

          {/* Golden shine flare traversing the logo */}
          <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none mix-blend-color-dodge">
            <motion.div
              className="w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12"
              initial={{ x: '-150%' }}
              animate={{ x: '150%' }}
              transition={{ delay: 2.5, duration: 1.8, repeat: Infinity, repeatDelay: 2.5 }}
            />
          </div>
        </motion.div>

        {/* VAJRANAD Big Display Text */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
          className="text-4xl sm:text-5xl font-sans tracking-[0.15em] font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFF9C4] via-[#F1C40F] to-[#9A7D0A] uppercase"
          style={{
            textShadow: '0 4px 15px rgba(212, 175, 55, 0.15)',
          }}
        >
          VAJRANAD
        </motion.h1>

        {/* Full Name in Devanagari */}
        <AnimatePresence>
          {showFullTitle && (
            <motion.h2
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              className="mt-3 text-lg sm:text-xl font-medium tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#FFFEE0] to-[#E5C158]"
              style={{
                fontFamily: "'Noto Sans Devanagari', sans-serif",
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              }}
            >
              वज्रनाद ढोल ताशा पथक, बेळगाव
            </motion.h2>
          )}
        </AnimatePresence>

        {/* Traditional Tagline with golden quotation marks */}
        <div className="h-16 mt-6">
          <AnimatePresence>
            {showTagline && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2 }}
                className="flex flex-col items-center"
              >
                {/* Thin golden separator */}
                <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent mb-3" />
                <p
                  className="text-xs sm:text-sm italic font-medium tracking-wide text-neutral-300 px-4"
                  style={{
                    fontFamily: "'Noto Sans Devanagari', sans-serif",
                  }}
                >
                  "हृदयात घुमतो ज्याचा नाद, तो पथक म्हणजे वज्रनाद"
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Decorative Traditional Border Corner Accents */}
      <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-[#D4AF37]/30 rounded-tl-lg" />
      <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-[#D4AF37]/30 rounded-tr-lg" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-[#D4AF37]/30 rounded-bl-lg" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-[#D4AF37]/30 rounded-br-lg" />

      {/* Loader line indicator showing elapsed splash duration */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-neutral-900 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-[#D4AF37] to-[#FFA000]"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 6.8, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
