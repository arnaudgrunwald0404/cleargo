'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HobermanSphere, HobermanSphereProps } from './HobermanSphere';

export interface HobermanLoaderProps extends Omit<HobermanSphereProps, 'pointedness' | 'viewAngle'> {
  pointednessMin?: number;
  pointednessMax?: number;
  breathDurationMs?: number;
  rotationDurationMs?: number;
  running?: boolean;
}

const DEFAULT_LOADER_PROPS = {
  openness: 0.5,
  pointednessMin: 0.2,
  pointednessMax: 0.8,
  breathDurationMs: 1500,
  rotationDurationMs: 3000,
  color: '#000000',
} as const;

export interface LoaderProps extends Partial<HobermanLoaderProps> {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Default app loader (Hoberman sphere). Use for all loading states.
 */
export const Loader: React.FC<LoaderProps> = (props) => (
  <HobermanLoader {...DEFAULT_LOADER_PROPS} size={80} {...props} />
);

/**
 * Animated Hoberman sphere loader: rotates while breathing (pointedness cycle).
 */
export const HobermanLoader: React.FC<HobermanLoaderProps> = ({
  pointednessMin = 0.2,
  pointednessMax = 0.8,
  breathDurationMs = 1500,
  rotationDurationMs = 3000,
  running = true,
  use2DPattern = true,
  size = 80,
  openness = 0.5,
  className,
  ...rest
}) => {
  const [pointedness, setPointedness] = useState(pointednessMin);
  const [rotationDeg, setRotationDeg] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!running) return;

    const start = performance.now();
    startRef.current = start;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;

      const breathT = (elapsed % breathDurationMs) / breathDurationMs;
      const pointednessValue =
        pointednessMin +
        (pointednessMax - pointednessMin) * 0.5 * (1 - Math.cos(breathT * Math.PI * 2));
      setPointedness(pointednessValue);

      if (rotationDurationMs > 0) {
        const rotationValue = (elapsed / rotationDurationMs) * 360;
        setRotationDeg(rotationValue % 360);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    running,
    breathDurationMs,
    rotationDurationMs,
    pointednessMin,
    pointednessMax,
  ]);

  return (
    <span
      className={className ? `inline-flex items-center justify-center ${className}` : 'inline-flex items-center justify-center'}
      style={{
        width: size,
        height: size,
        transform: rotationDurationMs > 0 ? `rotate(${rotationDeg}deg)` : undefined,
        transformOrigin: 'center center',
      }}
      aria-hidden
      role="img"
      aria-label="Loading"
    >
      <HobermanSphere
        size={size}
        openness={openness}
        pointedness={pointedness}
        use2DPattern={use2DPattern}
        {...rest}
      />
    </span>
  );
};
