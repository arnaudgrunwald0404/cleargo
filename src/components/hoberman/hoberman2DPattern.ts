/**
 * Generate a 2D Hoberman pattern with 7-fold symmetry (Heptagonal Rhombic Rosette)
 * Structure: Central 7-pointed star with rhombic connections between sectors
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Hoberman2DPatternOptions {
  size: number;
  openness: number; // 0-1, controls expansion and pattern density
  pointedness?: number; // 0-1, controls how pointed/sharp the original star spikes are (default: 0.5)
  centerX?: number;
  centerY?: number;
}

/**
 * Convert polar coordinates to Cartesian
 */
function getCoord(radius: number, angleDeg: number, center: Point2D): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(rad),
    y: center.y + radius * Math.sin(rad),
  };
}

/**
 * Reflect a point across a line defined by two points
 * Uses vector projection: reflect P across line AB
 */
function reflectPoint(point: Point2D, lineStart: Point2D, lineEnd: Point2D): Point2D {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1e-10) {
    return point;
  }

  const px = point.x - lineStart.x;
  const py = point.y - lineStart.y;
  const vx = dx;
  const vy = dy;
  const dot = px * vx + py * vy;
  const projX = (dot / lengthSq) * vx;
  const projY = (dot / lengthSq) * vy;
  const reflectedX = 2 * projX - px;
  const reflectedY = 2 * projY - py;

  return {
    x: reflectedX + lineStart.x,
    y: reflectedY + lineStart.y,
  };
}

/**
 * Calculate midpoint between two points
 */
function midpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Calculate intersection point of two lines
 */
function lineIntersection(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denom) < 1e-10) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  };
}

/**
 * Generate Hoberman pattern with recursive lozenge-building
 */
export function generateHoberman2DPattern(options: Hoberman2DPatternOptions): string[] {
  const { size, openness, pointedness = 0.5, centerX = size / 2, centerY = size / 2 } = options;
  const paths: string[] = [];

  const center: Point2D = { x: centerX, y: centerY };

  const scale = 0.4 + openness * 0.6;
  const baseRadius = (size / 2) * 0.85 * scale;

  const numSectors = 7;
  const angleStep = 360 / numSectors;
  const halfStep = angleStep / 2;

  const rSpike = baseRadius * (0.5 + openness * 0.3);
  const spikePoints: Point2D[] = [];

  for (let i = 0; i < numSectors; i++) {
    const thetaSpike = i * angleStep - 90;
    spikePoints.push(getCoord(rSpike, thetaSpike, center));
  }

  const valleyPointsRaw: Point2D[] = [];
  for (let i = 0; i < numSectors; i++) {
    const line1Start = spikePoints[i];
    const line1End = spikePoints[(i + 3) % numSectors];
    const line2Start = spikePoints[(i - 2 + numSectors) % numSectors];
    const line2End = spikePoints[(i + 1) % numSectors];

    const intersection = lineIntersection(line1Start, line1End, line2Start, line2End);
    if (intersection) {
      valleyPointsRaw.push(intersection);
    } else {
      const fallbackAngle = (i * angleStep + halfStep) % 360;
      const fallbackRadius = baseRadius * (0.2 + openness * 0.15);
      valleyPointsRaw.push(getCoord(fallbackRadius, fallbackAngle, center));
    }
  }

  const valleyPoints: Point2D[] = [];
  for (let i = 0; i < numSectors; i++) {
    const rawValley = valleyPointsRaw[i];
    const angle = Math.atan2(rawValley.y - center.y, rawValley.x - center.x);
    const rawDistance = Math.sqrt(
      Math.pow(rawValley.x - center.x, 2) + Math.pow(rawValley.y - center.y, 2)
    );
    const minValleyDistance = rawDistance * 1.8;
    const maxValleyDistance = 0;
    const adjustedDistance = minValleyDistance + pointedness * (maxValleyDistance - minValleyDistance);
    valleyPoints.push(getCoord(adjustedDistance, angle * 180 / Math.PI, center));
  }

  for (let i = 0; i < numSectors; i++) {
    const spike = spikePoints[i];
    const valleyLeft = valleyPoints[(i - 1 + numSectors) % numSectors];
    const valleyRight = valleyPoints[i];
    paths.push(`M ${spike.x} ${spike.y} L ${valleyLeft.x} ${valleyLeft.y}`);
    paths.push(`M ${spike.x} ${spike.y} L ${valleyRight.x} ${valleyRight.y}`);
  }

  const lozengePoints: Point2D[][] = [];

  for (let i = 0; i < numSectors; i++) {
    const spike1 = spikePoints[i];
    const spike2 = spikePoints[(i + 1) % numSectors];
    const valley = valleyPoints[i];
    const reflectedValley = reflectPoint(valley, spike1, spike2);

    const lozenge: Point2D[] = [spike1, valley, spike2, reflectedValley];
    lozengePoints.push(lozenge);

    paths.push(`M ${spike1.x} ${spike1.y} L ${valley.x} ${valley.y}`);
    paths.push(`M ${valley.x} ${valley.y} L ${spike2.x} ${spike2.y}`);
    paths.push(`M ${spike2.x} ${spike2.y} L ${reflectedValley.x} ${reflectedValley.y}`);
    paths.push(`M ${reflectedValley.x} ${reflectedValley.y} L ${spike1.x} ${spike1.y}`);
  }

  const outerStarSummits: Point2D[] = [];
  for (let i = 0; i < numSectors; i++) {
    const lozenge = lozengePoints[i];
    const reflectedValley = lozenge[3];
    outerStarSummits.push(reflectedValley);
  }

  for (let i = 0; i < numSectors; i++) {
    const summit1 = outerStarSummits[i];
    const summit2 = outerStarSummits[(i + 1) % numSectors];
    const lozenge1 = lozengePoints[i];
    const lozenge2 = lozengePoints[(i + 1) % numSectors];
    const spike2_lozenge1 = lozenge1[2];
    const spike1_lozenge2 = lozenge2[0];

    const valleyPoint = lineIntersection(spike2_lozenge1, summit1, spike1_lozenge2, summit2);

    let valley: Point2D;
    if (valleyPoint) {
      valley = valleyPoint;
    } else {
      const valley1 = lozenge1[1];
      const valley2 = lozenge2[1];
      const innerIntersection = lineIntersection(valley1, spike2_lozenge1, valley2, spike1_lozenge2);
      valley = innerIntersection || midpoint(summit1, summit2);
    }

    const reflectedValley = reflectPoint(valley, summit1, summit2);

    paths.push(`M ${summit1.x} ${summit1.y} L ${valley.x} ${valley.y}`);
    paths.push(`M ${valley.x} ${valley.y} L ${summit2.x} ${summit2.y}`);
    paths.push(`M ${summit2.x} ${summit2.y} L ${reflectedValley.x} ${reflectedValley.y}`);
    paths.push(`M ${reflectedValley.x} ${reflectedValley.y} L ${summit1.x} ${summit1.y}`);
  }

  return paths;
}
