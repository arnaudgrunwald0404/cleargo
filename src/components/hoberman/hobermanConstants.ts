// Icosidodecahedron geometry constants for Hoberman Sphere
// 30 vertices, 60 edges

const φ = (1 + Math.sqrt(5)) / 2; // golden ratio ≈ 1.618

export interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

// 30 vertices of icosidodecahedron
// Normalized to unit sphere
export const ICOSIDODECAHEDRON_VERTICES: Vertex3D[] = [
  // (±1, 0, 0) and permutations
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },

  // Even permutations of (±φ, ±1/φ, ±1)
  { x: φ, y: φ, z: 1 / φ },
  { x: φ, y: -φ, z: -1 / φ },
  { x: -φ, y: φ, z: -1 / φ },
  { x: -φ, y: -φ, z: 1 / φ },

  { x: φ, y: 1 / φ, z: φ },
  { x: φ, y: -1 / φ, z: -φ },
  { x: -φ, y: 1 / φ, z: -φ },
  { x: -φ, y: -1 / φ, z: φ },

  { x: 1 / φ, y: φ, z: φ },
  { x: 1 / φ, y: -φ, z: -φ },
  { x: -1 / φ, y: φ, z: -φ },
  { x: -1 / φ, y: -φ, z: φ },

  { x: φ, y: φ, z: -1 / φ },
  { x: φ, y: -φ, z: 1 / φ },
  { x: -φ, y: φ, z: 1 / φ },
  { x: -φ, y: -φ, z: -1 / φ },

  { x: φ, y: 1 / φ, z: -φ },
  { x: φ, y: -1 / φ, z: φ },
  { x: -φ, y: 1 / φ, z: φ },
  { x: -φ, y: -1 / φ, z: -φ },

  { x: 1 / φ, y: φ, z: -φ },
  { x: 1 / φ, y: -φ, z: φ },
  { x: -1 / φ, y: φ, z: φ },
  { x: -1 / φ, y: -φ, z: -φ },
].map(v => {
  // Normalize to unit sphere
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return {
    x: v.x / length,
    y: v.y / length,
    z: v.z / length,
  };
});

// Edge list for icosidodecahedron (60 edges)
// Each vertex connects to 4 neighbors
// Calculated based on distance - vertices at edge length distance are connected
export const ICOSIDODECAHEDRON_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  const vertices = ICOSIDODECAHEDRON_VERTICES;

  // Calculate all pairwise distances to find the edge length
  // In an icosidodecahedron, edges have a specific length
  // After normalization, we need to find vertices that are neighbors
  const distances: { dist: number; i: number; j: number }[] = [];

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const dx = vertices[i].x - vertices[j].x;
      const dy = vertices[i].y - vertices[j].y;
      const dz = vertices[i].z - vertices[j].z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distances.push({ dist, i, j });
    }
  }

  // Sort by distance and find the edge length (should be the most common short distance)
  distances.sort((a, b) => a.dist - b.dist);

  // The edge length should be one of the smallest distances
  // Use a threshold slightly above the minimum to catch all edges
  // For icosidodecahedron, after normalization, edge length is approximately 1.0-1.5
  const minDist = distances[0].dist;
  const edgeThreshold = minDist * 1.3; // Allow tolerance for floating point errors

  // Build edge list - each vertex should connect to exactly 4 others
  const vertexConnections = new Map<number, number>();

  for (const { dist, i, j } of distances) {
    if (dist < edgeThreshold) {
      // Limit to 4 connections per vertex
      const connI = vertexConnections.get(i) || 0;
      const connJ = vertexConnections.get(j) || 0;

      if (connI < 4 && connJ < 4) {
        edges.push([i, j]);
        vertexConnections.set(i, connI + 1);
        vertexConnections.set(j, connJ + 1);
      }
    }
  }

  // If we don't have exactly 60 edges, use all edges within threshold
  if (edges.length < 60) {
    edges.length = 0; // Clear and rebuild
    vertexConnections.clear();

    for (const { dist, i, j } of distances) {
      if (dist < edgeThreshold) {
        edges.push([i, j]);
      }
    }
  }

  return edges;
})();
export interface ViewAngle {
  x: number;
  y: number;
  z: number;
}

export interface HobermanConfig {
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
  use2DPattern?: boolean;
  copperWire?: boolean;
  blur?: number;
}
