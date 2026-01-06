"use client";

import { Box } from '@mantine/core';
import { useRef, useEffect } from 'react';

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

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

    video.addEventListener('loadedmetadata', () => {
      video.addEventListener('timeupdate', handleTimeUpdate);
    });

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  return (
    <Box style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
      <video
        ref={videoRef}
        src="/hero_video.mp4"
        autoPlay
        muted
        playsInline
        controls
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
        }}
      >
        Your browser does not support the video tag.
      </video>
    </Box>
  );
}

