import { Vertex3D, ICOSIDODECAHEDRON_VERTICES } from './hobermanConstants';

export interface Point2D {
  x: number;
  y: number;
}

export interface ViewAngle {
  x: number; // Rotation around X axis (pitch) in radians
  y: number; // Rotation around Y axis (yaw) in radians
  z: number; // Rotation around Z axis (roll) in radians
}

/**
 * Rotate a 3D point around X axis
 */
function rotateX(point: Vertex3D, angle: number): Vertex3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

/**
 * Rotate a 3D point around Y axis
 */
function rotateY(point: Vertex3D, angle: number): Vertex3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

/**
 * Rotate a 3D point around Z axis
 */
function rotateZ(point: Vertex3D, angle: number): Vertex3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
    z: point.z,
  };
}

/**
 * Project 3D point to 2D using isometric projection
 */
export function project3DTo2D(
  vertex: Vertex3D,
  viewAngle: ViewAngle = { x: 0, y: 0, z: 0 },
  size: number = 200
): Point2D {
  // Apply rotations in order: X, Y, Z
  let rotated = { ...vertex };
  rotated = rotateX(rotated, viewAngle.x);
  rotated = rotateY(rotated, viewAngle.y);
  rotated = rotateZ(rotated, viewAngle.z);

  // Isometric projection (2:1 ratio)
  const scale = size / 2;
  const x = (rotated.x - rotated.y) * scale + size / 2;
  const y = (-rotated.z + (rotated.x + rotated.y) / 2) * scale + size / 2;

  return { x, y };
}

/**
 * Calculate scissor linkage positions for an edge
 * Returns endpoints and pivot point for the scissor mechanism
 */
export function calculateScissorLinkage(
  vertexA: Vertex3D,
  vertexB: Vertex3D,
  openness: number
): { outerA: Vertex3D; outerB: Vertex3D; pivot: Vertex3D } {
  // Clamp openness between 0 and 1
  const t = Math.max(0, Math.min(1, openness));

  // Radius multipliers for expansion
  const R_MIN = 0.25; // Collapsed state (25% of max)
  const R_MAX = 1.0;   // Expanded state (100%)

  // Calculate radius based on openness
  const radius = R_MIN + t * (R_MAX - R_MIN);

  // Normalize input vertices (they should already be normalized, but ensure)
  const lengthA = Math.sqrt(vertexA.x * vertexA.x + vertexA.y * vertexA.y + vertexA.z * vertexA.z);
  const lengthB = Math.sqrt(vertexB.x * vertexB.x + vertexB.y * vertexB.y + vertexB.z * vertexB.z);

  const normalizedA = {
    x: vertexA.x / lengthA,
    y: vertexA.y / lengthA,
    z: vertexA.z / lengthA,
  };

  const normalizedB = {
    x: vertexB.x / lengthB,
    y: vertexB.y / lengthB,
    z: vertexB.z / lengthB,
  };

  // Outer endpoints (move radially based on openness)
  const outerA = {
    x: normalizedA.x * radius,
    y: normalizedA.y * radius,
    z: normalizedA.z * radius,
  };

  const outerB = {
    x: normalizedB.x * radius,
    y: normalizedB.y * radius,
    z: normalizedB.z * radius,
  };

  // Pivot point (midpoint, moves less than endpoints)
  const pivotRadius = R_MIN + t * 0.6 * (R_MAX - R_MIN);
  const pivot = {
    x: (normalizedA.x + normalizedB.x) / 2,
    y: (normalizedA.y + normalizedB.y) / 2,
    z: (normalizedA.z + normalizedB.z) / 2,
  };

  // Normalize pivot to unit vector, then scale
  const pivotLength = Math.sqrt(pivot.x * pivot.x + pivot.y * pivot.y + pivot.z * pivot.z);
  const normalizedPivot = {
    x: pivot.x / pivotLength,
    y: pivot.y / pivotLength,
    z: pivot.z / pivotLength,
  };

  return {
    outerA,
    outerB,
    pivot: {
      x: normalizedPivot.x * pivotRadius,
      y: normalizedPivot.y * pivotRadius,
      z: normalizedPivot.z * pivotRadius,
    },
  };
}

/**
 * Get clip path definition for partial views
 */
export function getClipPath(
  partialView: 'full' | 'left' | 'right' | 'top' | 'bottom' | 'corner',
  size: number
): string {
  switch (partialView) {
    case 'left':
      return `inset(0% 50% 0% 0%)`;
    case 'right':
      return `inset(0% 0% 0% 50%)`;
    case 'top':
      return `inset(0% 0% 50% 0%)`;
    case 'bottom':
      return `inset(50% 0% 0% 0%)`;
    case 'corner':
      return `inset(0% 50% 50% 0%)`;
    case 'full':
    default:
      return 'none';
  }
}
