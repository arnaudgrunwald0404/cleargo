"use client";

import { Box } from '@mantine/core';
import { useRef, useEffect, useState } from 'react';

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Estimate frame rate (common values: 24, 30, 60 fps)
    // We'll use 30fps as default, which gives us 12 frames = 0.4 seconds
    // For 24fps: 12 frames = 0.5 seconds
    // For 60fps: 12 frames = 0.2 seconds
    const framesToCut = 12;
    const estimatedFps = 30; // Default assumption
    const frameDuration = framesToCut / estimatedFps; // ~0.4 seconds for 30fps

    const handleTimeUpdate = () => {
      if (video.duration && video.currentTime >= video.duration - frameDuration) {
        video.pause();
        video.currentTime = Math.max(0, video.duration - frameDuration);
      }
    };

    const handleError = (e: Event) => {
      // Only log in development to reduce console noise
      if (process.env.NODE_ENV === 'development') {
        console.warn('Video failed to load:', e);
      }
      setError('Failed to load video');
    };

    const handleLoadedMetadata = () => {
      video.addEventListener('timeupdate', handleTimeUpdate);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);

    // Try to play the video
    video.play().catch((err) => {
      // Autoplay might be blocked, but video should still be playable via controls
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Autoplay prevented:', err);
      }
    });

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <Box style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
      {error ? (
        <Box style={{ padding: '40px', textAlign: 'center', color: '#CBD5E1' }}>
          <p>Video unavailable</p>
        </Box>
      ) : (
        <video
          ref={videoRef}
          src="/hero_video.mp4"
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          controls
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
          }}
        >
          Your browser does not support the video tag.
        </video>
      )}
    </Box>
  );
}

