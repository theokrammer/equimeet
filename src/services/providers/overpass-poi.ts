import { TargetPointProvider } from '../interfaces'
import { TargetPoint, CATEGORY_PRESETS } from '../../types'
import { haversineDistance } from './osrm-routing'

export class OverpassPoiProvider implements TargetPointProvider {
  private overpassEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ]

  /**
   * Search for POIs around center coordinates within radiusMeters.
   * Multi-strategy: First queries Photon spatial OSM index (sub-100ms, real addresses & names),
   * then Overpass API, and Nominatim for rich real-world places.
   * NEVER returns simulated/mock sample data.
   */
  async searchPOIs(
    center: { lat: number; lon: number },
    radiusMeters: number,
    queryOrCategory: string
  ): Promise<TargetPoint[]> {
    const results: TargetPoint[] = []
    const seen = new Set<string>()

    // Determine query keywords
    const categoryInfo = this.getCategoryInfo(queryOrCategory)

    // Strategy 1: Photon Spatial Search (Backed by OpenStreetMap, fast and CORS-friendly)
    try {
      const photonPoints = await this.searchViaPhoton(center, radiusMeters, categoryInfo)
      for (const pt of photonPoints) {
        const key = `${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push(pt)
        }
      }
    } catch (err) {
      console.warn('Photon POI search error:', err)
    }

    // Strategy 2: Overpass API (If Photon returned few results or to enrich with more places)
    if (results.length < 15) {
      try {
        const overpassPoints = await this.searchViaOverpass(center, radiusMeters, categoryInfo)
        for (const pt of overpassPoints) {
          const key = `${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push(pt)
          }
        }
      } catch (err) {
        console.warn('Overpass POI search error:', err)
      }
    }

    // Strategy 3: Nominatim Bounding Box Search (If still needed)
    if (results.length < 5) {
      try {
        const nomPoints = await this.searchViaNominatim(center, radiusMeters, categoryInfo)
        for (const pt of nomPoints) {
          const key = `${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push(pt)
          }
        }
      } catch (err) {
        console.warn('Nominatim POI search error:', err)
      }
    }

    // Filter to ensure points are within search radius
    const filtered = results.filter((pt) => {
      const dist = haversineDistance(center.lat, center.lon, pt.lat, pt.lon)
      return dist <= radiusMeters * 1.15 // slight tolerance
    })

    return filtered.length > 0 ? filtered : results
  }

  /**
   * Photon POI spatial lookup
   */
  private async searchViaPhoton(
    center: { lat: number; lon: number },
    radiusMeters: number,
    catInfo: { label: string; searchTerm: string; osmKey?: string; osmVal?: string }
  ): Promise<TargetPoint[]> {
    const list: TargetPoint[] = []
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(catInfo.searchTerm)}&lat=${center.lat}&lon=${center.lon}&limit=35`

    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []

    const data = await res.json()
    if (!data || !Array.isArray(data.features)) return []

    for (const f of data.features) {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue

      const lon = coords[0]
      const lat = coords[1]
      const dist = haversineDistance(center.lat, center.lon, lat, lon)
      if (dist > radiusMeters * 1.25) continue

      const props = f.properties || {}

      // Build real address
      const streetParts = [props.street, props.housenumber].filter(Boolean).join(' ')
      const localityParts = [
        props.district || props.suburb,
        props.city || props.town || props.village,
        props.postcode
      ].filter(Boolean).join(', ')

      const fullAddress = [streetParts, localityParts].filter(Boolean).join(' • ') || undefined

      // Real name with fallback to location
      let name = props.name
      if (!name) {
        const streetRef = props.street || props.district || props.city || 'Nearby'
        name = `${catInfo.label} (${streetRef})`
      }

      list.push({
        id: `photon-${props.osm_id || Math.random().toString(36).substring(2, 7)}`,
        name,
        category: catInfo.label,
        lat,
        lon,
        address: fullAddress,
        phone: props.phone,
        website: props.website,
        metrics: {
          air: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          road: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          time: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
        },
        compositeScore: 0,
      })
    }

    return list
  }

  /**
   * Overpass QL lookup using GET query to prevent CORS preflight failures
   */
  private async searchViaOverpass(
    center: { lat: number; lon: number },
    radiusMeters: number,
    catInfo: { label: string; searchTerm: string; osmKey?: string; osmVal?: string }
  ): Promise<TargetPoint[]> {
    let filterClauses = ''
    if (catInfo.osmKey && catInfo.osmVal) {
      filterClauses = `
        node["${catInfo.osmKey}"~"^(${catInfo.osmVal})$"](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
        way["${catInfo.osmKey}"~"^(${catInfo.osmVal})$"](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
      `
    } else {
      const sanitized = catInfo.searchTerm.replace(/["\\]/g, '')
      filterClauses = `
        node["amenity"~"${sanitized}",i](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
        node["leisure"~"${sanitized}",i](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
        node["name"~"${sanitized}",i](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
        way["amenity"~"${sanitized}",i](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
        way["leisure"~"${sanitized}",i](around:${radiusMeters},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
      `
    }

    const ql = `[out:json][timeout:10];(${filterClauses});out center 35;`

    for (const endpoint of this.overpassEndpoints) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(ql)}`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)

        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
        clearTimeout(timeoutId)

        if (!res.ok) continue

        const data = await res.json()
        if (data && Array.isArray(data.elements) && data.elements.length > 0) {
          return this.transformOverpassElements(data.elements, catInfo.label)
        }
      } catch (err) {
        // Continue to next endpoint
      }
    }

    return []
  }

  /**
   * Nominatim Search fallback for specific bounding box
   */
  private async searchViaNominatim(
    center: { lat: number; lon: number },
    radiusMeters: number,
    catInfo: { label: string; searchTerm: string }
  ): Promise<TargetPoint[]> {
    const deltaLat = (radiusMeters / 111320)
    const deltaLon = (radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180)))
    const viewbox = `${(center.lon - deltaLon).toFixed(4)},${(center.lat + deltaLat).toFixed(4)},${(center.lon + deltaLon).toFixed(4)},${(center.lat - deltaLat).toFixed(4)}`

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(catInfo.searchTerm)}&viewbox=${viewbox}&bounded=1&addressdetails=1&limit=25`

    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data.map((item: any) => {
      const addr = item.address || {}
      const street = [addr.road, addr.house_number].filter(Boolean).join(' ')
      const city = addr.city || addr.town || addr.village || addr.suburb || ''
      const fullAddress = [street, city].filter(Boolean).join(', ') || item.display_name.split(',').slice(1, 3).join(',')

      return {
        id: `nom-target-${item.place_id}`,
        name: item.name || item.display_name.split(',')[0],
        category: catInfo.label,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        address: fullAddress,
        metrics: {
          air: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          road: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          time: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
        },
        compositeScore: 0,
      }
    })
  }

  private transformOverpassElements(elements: any[], defaultCategory: string): TargetPoint[] {
    const list: TargetPoint[] = []

    for (const el of elements) {
      const lat = el.lat || el.center?.lat
      const lon = el.lon || el.center?.lon
      if (lat == null || lon == null) continue

      const tags = el.tags || {}
      const category = tags.leisure || tags.amenity || tags.shop || tags.tourism || defaultCategory
      const catLabel = this.capitalize(category.replace(/_/g, ' '))

      const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
      const city = [tags['addr:postcode'], tags['addr:city'] || tags['addr:suburb']].filter(Boolean).join(' ')
      const address = [street, city].filter(Boolean).join(', ') || tags['addr:full'] || undefined

      const name = tags.name || tags['name:en'] || tags.operator || tags.brand || `${catLabel} (${tags['addr:street'] || 'Nearby'})`

      list.push({
        id: `osm-${el.type}-${el.id}`,
        name,
        category: catLabel,
        lat,
        lon,
        address,
        phone: tags.phone || tags['contact:phone'],
        website: tags.website || tags['contact:website'],
        openingHours: tags.opening_hours ? {
          raw: tags.opening_hours,
          isOpenNow: tags.opening_hours.toLowerCase().includes('24/7') ? true : undefined,
          weekdayText: [tags.opening_hours],
        } : undefined,
        metrics: {
          air: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          road: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
          time: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
        },
        compositeScore: 0,
      })
    }

    return list
  }

  private getCategoryInfo(queryOrCategory: string): { label: string; searchTerm: string; osmKey?: string; osmVal?: string } {
    const q = queryOrCategory.toLowerCase().trim()
    const preset = CATEGORY_PRESETS.find((p) => p.id === q || p.label.toLowerCase() === q)

    if (preset) {
      const [key, val] = preset.osmQuery.split('=')
      return {
        label: preset.label,
        searchTerm: preset.label.toLowerCase(),
        osmKey: key,
        osmVal: val,
      }
    }

    return {
      label: this.capitalize(queryOrCategory),
      searchTerm: queryOrCategory,
    }
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
}
