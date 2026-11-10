import { BranchLocation } from "../types";

/**
 * Calculate distance between two GPS coordinates in meters using the Haversine formula
 */
export function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // Distance rounded in meters
}

export interface GeofenceCheckResult {
  isWithinGeofence: boolean;
  closestBranch: BranchLocation | null;
  distanceMeters: number;
}

/**
 * Find closest branch location and check if user is within the allowed geofence radius
 */
export function checkGeofence(
  userLat: number,
  userLng: number,
  branches: BranchLocation[]
): GeofenceCheckResult {
  const activeBranches = branches.filter((b) => b.isActive);
  if (activeBranches.length === 0) {
    return { isWithinGeofence: false, closestBranch: null, distanceMeters: Infinity };
  }

  let closest: BranchLocation | null = null;
  let minDistance = Infinity;

  for (const branch of activeBranches) {
    const dist = getDistanceInMeters(userLat, userLng, branch.latitude, branch.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closest = branch;
    }
  }

  const isWithin = closest ? minDistance <= closest.radiusMeters : false;
  return {
    isWithinGeofence: isWithin,
    closestBranch: closest,
    distanceMeters: minDistance,
  };
}

export const DEFAULT_BRANCH_LOCATIONS: BranchLocation[] = [];
