/**
 * V2TrafficPath — Bézier arc helpers for intersection turns
 *
 * Provides cubic Bézier evaluation for smooth vehicle turning at intersections.
 * Also includes angle utilities (lerpAngle, shortest-arc interpolation).
 */

import { TILE } from './V2Config';

// ─── Bézier helpers ───

export interface BezierArc {
  p0x: number; p0z: number;  // entry point
  p1x: number; p1z: number;  // control 1
  p2x: number; p2z: number;  // control 2
  p3x: number; p3z: number;  // exit point
}

/** Evaluate cubic Bézier at parameter t ∈ [0,1] */
export function bezierPoint(arc: BezierArc, t: number): { x: number; z: number } {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * arc.p0x + 3 * u2 * t * arc.p1x + 3 * u * t2 * arc.p2x + t3 * arc.p3x,
    z: u3 * arc.p0z + 3 * u2 * t * arc.p1z + 3 * u * t2 * arc.p2z + t3 * arc.p3z,
  };
}

/** Evaluate tangent of cubic Bézier at parameter t */
export function bezierTangent(arc: BezierArc, t: number): { x: number; z: number } {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: 3 * u2 * (arc.p1x - arc.p0x) + 6 * u * t * (arc.p2x - arc.p1x) + 3 * t2 * (arc.p3x - arc.p2x),
    z: 3 * u2 * (arc.p1z - arc.p0z) + 6 * u * t * (arc.p2z - arc.p1z) + 3 * t2 * (arc.p3z - arc.p2z),
  };
}

/** Approximate arc length by sampling N points */
export function bezierLength(arc: BezierArc, samples = 16): number {
  let length = 0;
  let prev = bezierPoint(arc, 0);
  for (let i = 1; i <= samples; i++) {
    const curr = bezierPoint(arc, i / samples);
    const dx = curr.x - prev.x;
    const dz = curr.z - prev.z;
    length += Math.sqrt(dx * dx + dz * dz);
    prev = curr;
  }
  return length;
}

// ─── Turn arc construction ───

/** Direction index: 0=+X, 1=-X, 2=+Z, 3=-Z */
export type DirIndex = 0 | 1 | 2 | 3;

/** Directional unit vectors */
const DIR_VEC: Array<{ x: number; z: number }> = [
  { x: 1, z: 0 },   // 0: +X
  { x: -1, z: 0 },  // 1: -X
  { x: 0, z: 1 },   // 2: +Z
  { x: 0, z: -1 },  // 3: -Z
];

/**
 * Build a Bézier arc for a vehicle turning at an intersection.
 *
 * @param cx  Intersection center X (world-space)
 * @param cz  Intersection center Z (world-space)
 * @param fromDir  Direction the vehicle is coming FROM (its travel direction)
 * @param toDir    Direction the vehicle will go TO
 * @param laneOffset  Lateral offset within lane (signed)
 */
export function buildTurnArc(
  cx: number,
  cz: number,
  fromDir: DirIndex,
  toDir: DirIndex,
  laneOffset: number,
): BezierArc {
  const fd = DIR_VEC[fromDir];
  const td = DIR_VEC[toDir];
  const halfTile = TILE / 2;

  // Entry: approaching from fromDir, offset by lane perpendicular
  const perpFrom = perpendicular(fd);
  const p0x = cx - fd.x * halfTile + perpFrom.x * laneOffset;
  const p0z = cz - fd.z * halfTile + perpFrom.z * laneOffset;

  // Exit: leaving toward toDir, offset by lane perpendicular
  const perpTo = perpendicular(td);
  const p3x = cx + td.x * halfTile + perpTo.x * laneOffset;
  const p3z = cz + td.z * halfTile + perpTo.z * laneOffset;

  // Control points: pull toward center for smooth curve
  const pull = halfTile * 0.6;
  const p1x = p0x + fd.x * pull;
  const p1z = p0z + fd.z * pull;
  const p2x = p3x - td.x * pull;
  const p2z = p3z - td.z * pull;

  return { p0x, p0z, p1x, p1z, p2x, p2z, p3x, p3z };
}

function perpendicular(d: { x: number; z: number }): { x: number; z: number } {
  // Rotate 90° CW: (x,z) → (z, -x)
  return { x: d.z, z: -d.x };
}

// ─── Turn decision ───

/** Possible exit directions from a given entry direction */
const TURN_OPTIONS: Record<DirIndex, DirIndex[]> = {
  0: [0, 2, 3],  // entering +X → can go straight(+X), left(+Z), right(-Z)
  1: [1, 3, 2],  // entering -X → can go straight(-X), left(-Z), right(+Z)
  2: [2, 1, 0],  // entering +Z → can go straight(+Z), left(-X), right(+X)
  3: [3, 0, 1],  // entering -Z → can go straight(-Z), left(+X), right(-X)
};

/**
 * Deterministic turn decision based on seed value.
 * Returns [straight, left, right] with weighted probabilities:
 * straight=50%, left=25%, right=25%
 */
export function decideTurn(fromDir: DirIndex, seedVal: number): DirIndex {
  const options = TURN_OPTIONS[fromDir];
  // seedVal in [0,1)
  if (seedVal < 0.5) return options[0];       // straight 50%
  if (seedVal < 0.75) return options[1];      // left 25%
  return options[2];                           // right 25%
}

/** Get the yaw angle (rotation.y) for a direction index */
export function dirToYaw(dir: DirIndex): number {
  switch (dir) {
    case 0: return Math.PI / 2;    // +X
    case 1: return -Math.PI / 2;   // -X
    case 2: return 0;              // +Z
    case 3: return Math.PI;        // -Z
  }
}

// ─── Angle utilities ───

/** Lerp between two angles using shortest arc */
export function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Normalize to [-π, π]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

/** Normalize angle to [0, 2π) */
export function normalizeAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}
