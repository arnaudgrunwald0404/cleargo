'use client';

import React, { useMemo } from 'react';
import { ICOSIDODECAHEDRON_VERTICES, ICOSIDODECAHEDRON_EDGES } from './hobermanConstants';
import { project3DTo2D, calculateScissorLinkage, ViewAngle } from './hobermanUtils';
import { generateHoberman2DPattern } from './hoberman2DPattern';

export interface HobermanSphereProps {
  size?: number;
  openness?: number;
  pointedness?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  viewAngle?: ViewAngle;
  partialView?: 'full' | 'left' | 'right' | 'top' | 'bottom' | 'corner';
  clipPath?: boolean;
  className?: string;
  use2DPattern?: boolean;
  copperWire?: boolean;
  blur?: number;
}

export const HobermanSphere: React.FC<HobermanSphereProps> = ({
  size = 60,
  openness = 0.5,
  pointedness = 0.5,
  color = '#FF7A52',
  strokeWidth = 1.5,
  fill,
  opacity = 1,
  viewAngle = { x: 0, y: 0, z: 0 },
  partialView = 'full',
  clipPath = false,
  className = '',
  use2DPattern = false,
  copperWire = false,
  blur = 0,
}) => {
  const viewBoxCenter = size;

  const scissorPaths = useMemo(() => {
    if (use2DPattern) {
      return generateHoberman2DPattern({
        size,
        openness,
        pointedness,
        centerX: viewBoxCenter,
        centerY: viewBoxCenter,
      });
    }

    const paths: string[] = [];

    ICOSIDODECAHEDRON_EDGES.forEach(([i, j]) => {
      const vertexA = ICOSIDODECAHEDRON_VERTICES[i];
      const vertexB = ICOSIDODECAHEDRON_VERTICES[j];
      const linkage = calculateScissorLinkage(vertexA, vertexB, openness);
      const outerA2D = project3DTo2D(linkage.outerA, viewAngle, size);
      const outerB2D = project3DTo2D(linkage.outerB, viewAngle, size);
      const pivot2D = project3DTo2D(linkage.pivot, viewAngle, size);
      const translateOffset = size / 2;

      paths.push(`M ${outerA2D.x + translateOffset} ${outerA2D.y + translateOffset} L ${pivot2D.x + translateOffset} ${pivot2D.y + translateOffset}`);
      paths.push(`M ${outerB2D.x + translateOffset} ${outerB2D.y + translateOffset} L ${pivot2D.x + translateOffset} ${pivot2D.y + translateOffset}`);
    });

    return paths;
  }, [openness, pointedness, viewAngle, size, use2DPattern]);

  const clipPathId = useMemo(() => `hoberman-clip-${Math.random().toString(36).substr(2, 9)}`, []);
  const gradientId = useMemo(() => `copper-gradient-${Math.random().toString(36).substr(2, 9)}`, []);
  const needsClipping = partialView !== 'full';

  const getClipRect = () => {
    const centerX = size / 2;
    const centerY = size / 2;
    switch (partialView) {
      case 'left':
        return { x: 0, y: 0, width: size / 2, height: size };
      case 'right':
        return { x: size / 2, y: 0, width: size / 2, height: size };
      case 'top':
        return { x: 0, y: 0, width: size, height: size / 2 };
      case 'bottom':
        return { x: 0, y: size / 2, width: size, height: size / 2 };
      case 'corner':
        return { x: 0, y: 0, width: size / 2, height: size / 2 };
      default:
        return { x: 0, y: 0, width: size, height: size };
    }
  };

  const clipRect = needsClipping ? getClipRect() : null;
  const effectiveStrokeWidth = copperWire ? Math.max(strokeWidth, 2.5) : strokeWidth;
  const effectiveColor = copperWire ? `url(#${gradientId})` : (fill ? 'none' : color);
  const blurFilter = blur > 0 ? `blur(${blur}px)` : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${size / 2} ${size / 2} ${size} ${size}`}
      preserveAspectRatio="xMidYMid"
      className={className}
      style={{
        opacity,
        filter: blurFilter,
        overflow: 'hidden',
        display: 'block',
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {copperWire && (
          <linearGradient
            id={gradientId}
            x1={size / 2}
            y1={size / 2}
            x2={size * 1.5}
            y2={size * 1.5}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFD4BC" />
            <stop offset="50%" stopColor="#FF7A52" />
            <stop offset="100%" stopColor="#C97D60" />
          </linearGradient>
        )}
        {needsClipping && clipRect && (
          <clipPath id={clipPathId}>
            <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
          </clipPath>
        )}
      </defs>
      <g clipPath={needsClipping ? `url(#${clipPathId})` : undefined}>
        {copperWire ? (
          <g
            stroke={`url(#${gradientId})`}
            strokeWidth={effectiveStrokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {scissorPaths.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>
        ) : (
          <g
            stroke={effectiveColor}
            strokeWidth={effectiveStrokeWidth}
            fill={fill || 'none'}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {scissorPaths.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
};
