import React from 'react';
import logoImage from '../vajranad-logo.jpg';

interface VajranadLogoProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export default function VajranadLogo({ className = '', size = 200, animate = true }: VajranadLogoProps) {
  return (
    <img
      id="vajranad-logo"
      src={logoImage}
      alt="Vajranad Dhol Tasha Pathak, Belagavi"
      width={size}
      height={size}
      className={`select-none object-contain filter drop-shadow-xl ${animate ? 'animate-pulse-slow' : ''} ${className}`}
      style={{
        borderRadius: '50%',
        width: size,
        height: size,
      }}
    />
  );
}
