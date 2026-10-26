import { StartPoint, TargetPoint } from '../types'

/**
 * Geocoding Provider Interface
 * Decouples location lookup and reverse geocoding from specific third-party APIs.
 */
export interface GeocodingProvider {
  /**
   * Search for places or addresses matching the query.
   */
  search(query: string): Promise<Omit<StartPoint, 'color'>[]>

  /**
   * Reverse geocode coordinates to a readable address or place name.
   */
  reverse(lat: number, lon: number): Promise<string>
}

/**
 * Routing Provider Interface
 * Calculates distance and travel duration matrices between origins and destinations.
 */
export interface RoutingProvider {
  /**
   * Returns distance matrix in meters and duration matrix in seconds.
   * rows: origins, cols: destinations
   */
  getDistanceMatrix(
    origins: { lat: number; lon: number }[],
    destinations: { lat: number; lon: number }[]
  ): Promise<{
    roadDistances: number[][] // in meters
    drivingTimes: number[][]  // in seconds
    source?: 'osrm' | 'fallback'
  }>
}

/**
 * Target Point POI Provider Interface
 * Searches for amenities and points of interest within a specified search radius.
 */
export interface TargetPointProvider {
  /**
   * Search for POIs around center coordinates within radiusMeters.
   */
  searchPOIs(
    center: { lat: number; lon: number },
    radiusMeters: number,
    queryOrCategory: string
  ): Promise<TargetPoint[]>
}
