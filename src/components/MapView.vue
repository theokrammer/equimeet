<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { StartPoint, CenterPoint, TargetPoint, OptimizationMode, MODE_COLORS } from '../types'

const props = defineProps<{
  startPoints: StartPoint[]
  activeCenter: CenterPoint | null
  allCenters: {
    air: CenterPoint | null
    road: CenterPoint | null
    time: CenterPoint | null
    manual?: CenterPoint | null
  }
  visibleCenters: {
    air: boolean
    road: boolean
    time: boolean
    manual?: boolean
  }
  radiusKm: number
  activeMode: OptimizationMode
  targetPoints: TargetPoint[]
  selectedTargetId: string | null
  isSettingManualCenter?: boolean
}>()

const emit = defineEmits<{
  (e: 'map-click', coords: { lat: number; lon: number }): void
  (e: 'select-target', target: TargetPoint): void
  (e: 'select-mode', mode: OptimizationMode): void
  (e: 'set-manual-center', coords: { lat: number; lon: number }): void
  (e: 'cancel-set-manual-center'): void
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let startMarkersLayer = L.layerGroup()
let centersLayer = L.layerGroup()
let radiusCircle: L.Circle | null = null
let targetMarkersLayer = L.layerGroup()

// Create SVG string for the downward-pointing TriShield marker pin
function createTriShieldSvg(air: boolean, road: boolean, time: boolean, isSelected: boolean): string {
  const inactiveFill = '#64748b'
  const inactiveStroke = '#94a3b8'

  const airFill = air ? '#0284c7' : inactiveFill
  const airStroke = air ? '#38bdf8' : inactiveStroke

  const roadFill = road ? '#059669' : inactiveFill
  const roadStroke = road ? '#34d399' : inactiveStroke

  const timeFill = time ? '#ea580c' : inactiveFill
  const timeStroke = time ? '#fbbf24' : inactiveStroke

  const width = isSelected ? 46 : 34
  const height = isSelected ? 54 : 40
  const outerBorderColor = isSelected ? '#facc15' : '#ffffff'
  const outerBorderWidth = isSelected ? '5.5' : '4'
  const glow = isSelected
    ? 'filter: drop-shadow(0 0 16px rgba(250, 204, 21, 0.95)) drop-shadow(0 4px 8px rgba(0,0,0,0.6));'
    : 'filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));'

  return `
    <div style="width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; ${glow}">
      <svg viewBox="0 0 100 105" style="width: 100%; height: 100%;">
        <!-- Outer Base Contour -->
        <polygon points="8,10 92,10 50,94" fill="#334155" stroke="${outerBorderColor}" stroke-width="${outerBorderWidth}" stroke-linejoin="round" stroke-linecap="round"/>
        
        <!-- Facet 1: Top (Air) -->
        <polygon points="9,11 91,11 50,46" fill="${airFill}" stroke="${airStroke}" stroke-width="1.2" stroke-linejoin="round"/>
        
        <!-- Facet 2: Bottom-Left (Road) -->
        <polygon points="9,11 50,46 50,92" fill="${roadFill}" stroke="${roadStroke}" stroke-width="1.2" stroke-linejoin="round"/>
        
        <!-- Facet 3: Bottom-Right (Time) -->
        <polygon points="91,11 50,46 50,92" fill="${timeFill}" stroke="${timeStroke}" stroke-width="1.2" stroke-linejoin="round"/>
        
        <!-- Internal Seams -->
        <line x1="8" y1="10" x2="50" y2="46" stroke="${outerBorderColor}" stroke-width="${isSelected ? '2.5' : '2'}" stroke-linecap="round"/>
        <line x1="92" y1="10" x2="50" y2="46" stroke="${outerBorderColor}" stroke-width="${isSelected ? '2.5' : '2'}" stroke-linecap="round"/>
        <line x1="50" y1="46" x2="50" y2="94" stroke="${outerBorderColor}" stroke-width="${isSelected ? '3' : '2.5'}" stroke-linecap="round"/>
        
        <!-- Outer Border Highlight -->
        <polygon points="8,10 92,10 50,94" fill="none" stroke="${outerBorderColor}" stroke-width="${isSelected ? '4' : '3'}" stroke-linejoin="round"/>
        
        <!-- Center Accent Dot -->
        <circle cx="50" cy="46" r="3.5" fill="${outerBorderColor}" stroke="#1e293b" stroke-width="1"/>
      </svg>
    </div>
  `
}

onMounted(() => {
  if (!mapContainer.value) return

  // Default initial center: Berlin or Europe center
  const defaultLat = 52.5200
  const defaultLon = 13.4050

  map = L.map(mapContainer.value, {
    center: [defaultLat, defaultLon],
    zoom: 12,
    zoomControl: false,
  })

  // Free, keyless official OpenStreetMap tiles
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  }).addTo(map)

  // Zoom control top right
  L.control.zoom({ position: 'topright' }).addTo(map)

  // Add layers to map
  startMarkersLayer.addTo(map)
  centersLayer.addTo(map)
  targetMarkersLayer.addTo(map)

  // Map click listener
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (props.isSettingManualCenter) {
      emit('set-manual-center', { lat: e.latlng.lat, lon: e.latlng.lng })
    } else {
      emit('map-click', { lat: e.latlng.lat, lon: e.latlng.lng })
    }
  })

  // Attempt browser geolocation if available
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (map && props.startPoints.length === 0) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 12)
        }
      },
      () => {},
      { timeout: 4000 }
    )
  }

  updateMap()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})

// Watchers
watch(
  () => [
    props.startPoints,
    props.activeCenter,
    props.allCenters,
    props.visibleCenters,
    props.radiusKm,
    props.activeMode,
    props.targetPoints,
    props.selectedTargetId,
    props.isSettingManualCenter,
  ],
  () => {
    updateMap()
  },
  { deep: true }
)

function updateMap() {
  if (!map) return

  // 1. Render Start Point Markers
  startMarkersLayer.clearLayers()
  const bounds = L.latLngBounds([])

  props.startPoints.forEach((sp, idx) => {
    bounds.extend([sp.lat, sp.lon])
    const iconHtml = `
      <div style="background-color: ${sp.color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.4);">
        ${idx + 1}
      </div>
    `
    const markerIcon = L.divIcon({
      html: iconHtml,
      className: 'start-point-pin',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    })

    const marker = L.marker([sp.lat, sp.lon], { icon: markerIcon })
      .bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: bold;">Start-Point ${idx + 1}</div>
          <div style="font-weight: 600; font-size: 13px; color: #f1f5f9; margin-top: 2px;">${sp.name}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${sp.lat.toFixed(4)}, ${sp.lon.toFixed(4)}</div>
        </div>
      `)
    startMarkersLayer.addLayer(marker)
  })

  // 2. Render All Visible Centers & Search Radius Circles Simultaneously
  centersLayer.clearLayers()

  const modes: OptimizationMode[] = ['air', 'road', 'time', 'manual']
  modes.forEach((m) => {
    if (!props.visibleCenters[m]) return
    const center = props.allCenters[m]
    if (!center) return

    const centerLatLng = [center.lat, center.lon] as [number, number]
    bounds.extend(centerLatLng)

    const modeColor = MODE_COLORS[m]
    const isPrimaryActive = m === props.activeMode

    let centerIcon: L.DivIcon
    let centerMarker: L.Marker

    if (m === 'manual') {
      const size = isPrimaryActive ? 36 : 30
      const centerIconHtml = `
        <div style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; cursor: grab; filter: drop-shadow(0 0 ${isPrimaryActive ? 14 : 7}px rgba(139, 92, 246, 0.95)) drop-shadow(0 4px 6px rgba(0,0,0,0.5)); transition: transform 0.2s;">
          <svg viewBox="0 0 36 36" width="${size}" height="${size}">
            <!-- Diamond Shape (Visually distinct from circular A/R/T pins and TriShield) -->
            <polygon points="18,3 33,18 18,33 3,18" fill="#8b5cf6" stroke="#ffffff" stroke-width="${isPrimaryActive ? 3 : 2}" stroke-linejoin="round"/>
            <!-- Center Crosshair Reticle -->
            <circle cx="18" cy="18" r="7.5" fill="none" stroke="#ffffff" stroke-width="1.8"/>
            <circle cx="18" cy="18" r="2.8" fill="#ffffff"/>
            <line x1="18" y1="4" x2="18" y2="9" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            <line x1="18" y1="27" x2="18" y2="32" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            <line x1="4" y1="18" x2="9" y2="18" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            <line x1="27" y1="18" x2="32" y2="18" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      `
      centerIcon = L.divIcon({
        html: centerIconHtml,
        className: 'manual-center-pin',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })

      centerMarker = L.marker(centerLatLng, {
        icon: centerIcon,
        draggable: true,
        zIndexOffset: isPrimaryActive ? 700 : 450,
      }).bindPopup(`
        <div style="font-family: inherit;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; transform: rotate(45deg); background: #8b5cf6; display: inline-block;"></span>
            <span style="font-size: 11px; text-transform: uppercase; color: #a78bfa; font-weight: bold;">${center.label || 'Manual Center Point'}</span>
          </div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Search Radius: <strong>${props.radiusKm} km</strong></div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${center.lat.toFixed(5)}, ${center.lon.toFixed(5)}</div>
          <div style="font-size: 10px; color: #a78bfa; font-weight: 500; margin-top: 4px;">✥ Drag pin or click map to relocate</div>
          ${isPrimaryActive ? '<div style="font-size: 10px; color: #c084fc; font-weight: bold; margin-top: 3px;">★ Active Search Center</div>' : ''}
        </div>
      `)

      centerMarker.on('dragend', (e: any) => {
        const latLng = e.target.getLatLng()
        emit('set-manual-center', { lat: latLng.lat, lon: latLng.lng })
      })
    } else {
      const modeLetter = m === 'air' ? 'A' : m === 'road' ? 'R' : 'T'
      const centerIconHtml = `
        <div style="width: ${isPrimaryActive ? 28 : 24}px; height: ${isPrimaryActive ? 28 : 24}px; border-radius: 50%; background: ${modeColor}; border: ${isPrimaryActive ? 3.5 : 2.5}px solid white; box-shadow: 0 0 ${isPrimaryActive ? 14 : 8}px ${modeColor}; display: flex; align-items: center; justify-content: center; font-size: ${isPrimaryActive ? 12 : 10}px; font-weight: bold; color: white;">
          ${modeLetter}
        </div>
      `
      centerIcon = L.divIcon({
        html: centerIconHtml,
        className: 'center-point-pin',
        iconSize: [isPrimaryActive ? 28 : 24, isPrimaryActive ? 28 : 24],
        iconAnchor: [isPrimaryActive ? 14 : 12, isPrimaryActive ? 14 : 12],
      })

      centerMarker = L.marker(centerLatLng, {
        icon: centerIcon,
        zIndexOffset: isPrimaryActive ? 600 : 400,
      }).bindPopup(`
        <div style="font-family: inherit;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${modeColor};"></span>
            <span style="font-size: 11px; text-transform: uppercase; color: ${modeColor}; font-weight: bold;">${center.label}</span>
          </div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Search Radius: <strong>${props.radiusKm} km</strong></div>
          ${isPrimaryActive ? '<div style="font-size: 10px; color: #38bdf8; font-weight: bold; margin-top: 3px;">★ Active Search Center</div>' : ''}
        </div>
      `)
    }

    centerMarker.on('click', () => {
      emit('select-mode', m)
    })
    centersLayer.addLayer(centerMarker)

    // Radius Circle around this center
    const circle = L.circle(centerLatLng, {
      radius: props.radiusKm * 1000,
      color: modeColor,
      weight: isPrimaryActive ? 2.5 : 1.5,
      opacity: isPrimaryActive ? 0.95 : 0.6,
      dashArray: m === 'manual' ? (isPrimaryActive ? '8, 6' : '4, 6') : (isPrimaryActive ? '6, 6' : '3, 6'),
      fillColor: modeColor,
      fillOpacity: isPrimaryActive ? (m === 'manual' ? 0.10 : 0.09) : 0.04,
    })
    centersLayer.addLayer(circle)
    bounds.extend(circle.getBounds())
  })

  // 3. Render Target Point Markers with TriShield Icon
  targetMarkersLayer.clearLayers()
  props.targetPoints.forEach((target) => {
    bounds.extend([target.lat, target.lon])
    const isSelected = target.id === props.selectedTargetId

    const iconHtml = createTriShieldSvg(
      target.metrics.air.qualifies,
      target.metrics.road.qualifies,
      target.metrics.time.qualifies,
      isSelected
    )

    const size: [number, number] = isSelected ? [46, 54] : [34, 40]
    const anchor: [number, number] = isSelected ? [23, 53] : [17, 39]

    const markerIcon = L.divIcon({
      html: iconHtml,
      className: isSelected ? 'marker-highlight' : '',
      iconSize: size,
      iconAnchor: anchor,
      popupAnchor: [0, -anchor[1]],
    })

    const marker = L.marker([target.lat, target.lon], { icon: markerIcon, zIndexOffset: isSelected ? 1000 : 100 })

    const popupContent = `
      <div style="font-family: inherit; min-width: 200px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: #334155; color: #e2e8f0;">${target.category}</span>
          <span style="font-size: 11px; font-weight: bold; color: #38bdf8;">Score ${target.compositeScore}</span>
        </div>
        <div style="font-weight: bold; font-size: 14px; color: #f8fafc; margin-top: 2px;">${target.name}</div>
        ${target.address ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${target.address}</div>` : ''}
        
        <div style="display: flex; gap: 4px; margin-top: 8px; font-size: 10px;">
          <span style="padding: 2px 4px; border-radius: 4px; background: ${target.metrics.air.qualifies ? '#0369a1' : '#334155'}; color: white;">Air</span>
          <span style="padding: 2px 4px; border-radius: 4px; background: ${target.metrics.road.qualifies ? '#047857' : '#334155'}; color: white;">Road</span>
          <span style="padding: 2px 4px; border-radius: 4px; background: ${target.metrics.time.qualifies ? '#b45309' : '#334155'}; color: white;">Time</span>
        </div>

        ${target.openingHours?.raw ? `<div style="font-size: 11px; color: #cbd5e1; margin-top: 6px; padding-top: 6px; border-top: 1px solid #334155;">🕒 ${target.openingHours.raw}</div>` : ''}
      </div>
    `

    marker.bindPopup(popupContent)
    marker.on('click', () => {
      emit('select-target', target)
    })

    targetMarkersLayer.addLayer(marker)
    if (isSelected) {
      marker.openPopup()
    }
  })

  // Fit bounds if we have points and not manually interacting
  if (bounds.isValid() && (props.startPoints.length > 0 || props.targetPoints.length > 0)) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
  }
}

defineExpose({
  panTo(lat: number, lon: number, zoom = 15) {
    if (map) {
      map.setView([lat, lon], zoom, { animate: true })
    }
  },
})
</script>

<template>
  <div class="relative w-full h-full">
    <!-- Leaflet Map Canvas -->
    <div
      ref="mapContainer"
      class="w-full h-full z-0"
      :class="{ 'cursor-crosshair': isSettingManualCenter }"
    ></div>

    <!-- Active Manual Center Placement Banner -->
    <div v-if="isSettingManualCenter" class="absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div class="bg-violet-950/95 border border-violet-500/80 px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 text-violet-100 text-xs font-semibold backdrop-blur-md ring-2 ring-violet-500/40">
        <span class="w-2.5 h-2.5 rounded-full bg-violet-400 animate-ping"></span>
        <span>Click anywhere on the map to set the <strong>Manual Center Point</strong></span>
        <button
          type="button"
          @click="emit('cancel-set-manual-center')"
          class="ml-2 px-2.5 py-1 rounded-lg bg-violet-800 hover:bg-violet-700 text-white text-[11px] font-medium border border-violet-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Map Click Guidance Hint -->
    <div class="absolute bottom-4 left-4 z-10 pointer-events-none">
      <div class="bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-lg text-xs text-slate-300 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full" :class="isSettingManualCenter ? 'bg-violet-400 animate-ping' : 'bg-emerald-400 animate-ping'"></span>
        <span v-if="isSettingManualCenter">Click on the map to set the <strong>Manual Center Point</strong></span>
        <span v-else>Click anywhere on the map to add a <strong>Start-Point</strong></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-crosshair :deep(.leaflet-container) {
  cursor: crosshair !important;
}
</style>
