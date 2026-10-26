import { GeocodingProvider } from '../interfaces'
import { StartPoint } from '../../types'

export class OsmGeocodingProvider implements GeocodingProvider {
  /**
   * Search for locations using Photon API (Komoot/OSM) with Nominatim fallback.
   */
  async search(query: string): Promise<Omit<StartPoint, 'color'>[]> {
    if (!query || query.trim().length < 2) return []

    try {
      // 1. Primary: Photon API (Fast, CORS-friendly, designed for autocomplete)
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7`
      const res = await fetch(photonUrl, {
        headers: { Accept: 'application/json' }
      })

      if (res.ok) {
        const data = await res.json()
        if (data && data.features && data.features.length > 0) {
          return data.features.map((f: any, idx: number) => {
            const props = f.properties || {}
            const parts = [
              props.name,
              props.street,
              props.housenumber,
              props.postcode,
              props.city || props.town || props.village,
              props.country
            ].filter(Boolean)

            const displayName = parts.length > 0 ? parts.join(', ') : (props.name || 'Unknown Location')
            return {
              id: `geo-${f.properties.osm_id || idx}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              name: displayName,
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
            }
          })
        }
      }
    } catch (err) {
      console.warn('Photon geocoding failed, trying Nominatim fallback:', err)
    }

    // 2. Fallback: Nominatim OpenStreetMap
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      const nomRes = await fetch(nomUrl, {
        headers: { Accept: 'application/json' }
      })
      if (nomRes.ok) {
        const nomData = await nomRes.json()
        return nomData.map((item: any) => ({
          id: `nom-${item.place_id}-${Date.now()}`,
          name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }))
      }
    } catch (fallbackErr) {
      console.error('All geocoding lookups failed:', fallbackErr)
    }

    return []
  }

  /**
   * Reverse geocode coordinates to get address or place name.
   */
  async reverse(lat: number, lon: number): Promise<string> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
      const res = await fetch(url, {
        headers: { Accept: 'application/json' }
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.display_name) {
          const addr = data.address || {}
          const namePart = addr.amenity || addr.leisure || addr.building || addr.shop || addr.road || addr.suburb || addr.city
          return namePart ? `${namePart}, ${addr.city || addr.town || addr.country || ''}` : data.display_name.split(',').slice(0, 3).join(',')
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err)
    }
    return `Point (${lat.toFixed(4)}, ${lon.toFixed(4)})`
  }
}
