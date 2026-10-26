<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    air?: boolean
    road?: boolean
    time?: boolean
    size?: number
    strokeWidth?: number
    showBorder?: boolean
    highlighted?: boolean
  }>(),
  {
    air: false,
    road: false,
    time: false,
    size: 28,
    strokeWidth: 1.5,
    showBorder: true,
    highlighted: false,
  }
)

// Inverted Triangle / Shield geometry pointing DOWNWARD:
// Top-Left vertex: (8, 10)
// Top-Right vertex: (92, 10)
// Bottom sharp tip: (50, 94) -> points directly at map coordinate!
// Center junction: (50, 46)
//
// Facet 1 (Top / Air Distance):
// Points: 8,10 92,10 50,46
//
// Facet 2 (Bottom-Left / Road Distance):
// Points: 8,10 50,46 50,94
//
// Facet 3 (Bottom-Right / Driving Time):
// Points: 92,10 50,46 50,94

// Colors:
// Inactive / Unfilled: Clean Slate Gray (NOT black)
const inactiveFill = '#64748b' // Slate-500
const inactiveStroke = '#94a3b8' // Slate-400

// Air: Sky Blue
const airFill = computed(() => (props.air ? '#0284c7' : inactiveFill))
const airStroke = computed(() => (props.air ? '#38bdf8' : inactiveStroke))

// Road: Vivid high-contrast Emerald / Mint (distinct from map green)
const roadFill = computed(() => (props.road ? '#059669' : inactiveFill))
const roadStroke = computed(() => (props.road ? '#34d399' : inactiveStroke))

// Time: Vibrant Amber / Orange
const timeFill = computed(() => (props.time ? '#ea580c' : inactiveFill))
const timeStroke = computed(() => (props.time ? '#fbbf24' : inactiveStroke))

const fulfilledCount = computed(() => {
  let c = 0
  if (props.air) c++
  if (props.road) c++
  if (props.time) c++
  return c
})

const activeBorderColor = computed(() => (props.highlighted ? '#facc15' : '#ffffff'))
const activeBorderWidth = computed(() => (props.highlighted ? 5 : 3))
</script>

<template>
  <div
    class="relative inline-flex items-center justify-center select-none transition-transform duration-200"
    :class="{ 'scale-110': highlighted }"
    :style="{ width: `${size}px`, height: `${size * 1.12}px` }"
  >
    <svg
      viewBox="0 0 100 105"
      class="w-full h-full transition-all duration-300"
      :style="{ filter: highlighted ? 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.85)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.45))' : 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.45))' }"
    >
      <!-- Base Background & Outer Contour Line -->
      <polygon
        points="8,10 92,10 50,94"
        fill="#334155"
        :stroke="activeBorderColor"
        :stroke-width="highlighted ? 5 : 4"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- Facet 1: Top (Air Distance) -->
      <polygon
        points="9,11 91,11 50,46"
        :fill="airFill"
        :stroke="airStroke"
        stroke-width="1.2"
        stroke-linejoin="round"
        class="transition-colors duration-200"
      >
        <title>Minimal Air Distance: {{ air ? 'Fulfilled' : 'Not met' }}</title>
      </polygon>

      <!-- Facet 2: Bottom-Left (Road Distance) -->
      <polygon
        points="9,11 50,46 50,92"
        :fill="roadFill"
        :stroke="roadStroke"
        stroke-width="1.2"
        stroke-linejoin="round"
        class="transition-colors duration-200"
      >
        <title>Minimal Road Distance: {{ road ? 'Fulfilled' : 'Not met' }}</title>
      </polygon>

      <!-- Facet 3: Bottom-Right (Driving Time) -->
      <polygon
        points="91,11 50,46 50,92"
        :fill="timeFill"
        :stroke="timeStroke"
        stroke-width="1.2"
        stroke-linejoin="round"
        class="transition-colors duration-200"
      >
        <title>Minimal Driving Time: {{ time ? 'Fulfilled' : 'Not met' }}</title>
      </polygon>

      <!-- Internal Dividing Seams -->
      <line x1="8" y1="10" x2="50" y2="46" :stroke="activeBorderColor" stroke-width="2" stroke-linecap="round" />
      <line x1="92" y1="10" x2="50" y2="46" :stroke="activeBorderColor" stroke-width="2" stroke-linecap="round" />
      <line x1="50" y1="46" x2="50" y2="94" :stroke="activeBorderColor" stroke-width="2.5" stroke-linecap="round" />

      <!-- Outer Perimeter Border -->
      <polygon
        points="8,10 92,10 50,94"
        fill="none"
        :stroke="activeBorderColor"
        :stroke-width="activeBorderWidth"
        stroke-linejoin="round"
      />

      <!-- Center Accent Node -->
      <circle
        cx="50"
        cy="46"
        r="3"
        fill="#ffffff"
        stroke="#1e293b"
        stroke-width="1"
      />
    </svg>
  </div>
</template>
