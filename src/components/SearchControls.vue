<script setup lang="ts">
import { ref } from 'vue'
import {
  OptimizationMode,
  CenterPoint,
  MODE_LABELS,
  MODE_COLORS,
  MODE_DESCRIPTIONS,
  CATEGORY_PRESETS,
} from '../types'
import { GeocodingProvider } from '../services/interfaces'
import {
  Compass,
  Route,
  Clock,
  Target,
  Crosshair,
  MapPin,
  RotateCcw,
  Utensils,
  Smile,
  Coffee,
  Waves,
  Trees,
  Search,
  SlidersHorizontal,
  Trash2,
  Loader2,
} from 'lucide-vue-next'

const props = defineProps<{
  mode: OptimizationMode
  radiusKm: number
  selectedCategory: string
  customQuery: string
  canSearch: boolean
  isSearching: boolean
  hasTargetPoints?: boolean
  targetCount?: number
  manualCenter?: CenterPoint | null
  isSettingManualCenter?: boolean
  geocodingProvider?: GeocodingProvider
}>()

const emit = defineEmits<{
  (e: 'update:mode', mode: OptimizationMode): void
  (e: 'update:radiusKm', radius: number): void
  (e: 'update:selectedCategory', cat: string): void
  (e: 'update:customQuery', query: string): void
  (e: 'search'): void
  (e: 'clear-targets'): void
  (e: 'toggle-map-placement'): void
  (e: 'set-manual-center', coords: { lat: number; lon: number }, name?: string): void
  (e: 'reset-manual-center'): void
}>()

const localCustomQuery = ref(props.customQuery)
const manualAddressQuery = ref('')
const isSearchingAddress = ref(false)
const manualSearchResults = ref<{ name: string; lat: number; lon: number }[]>([])

const searchManualAddress = async () => {
  if (!manualAddressQuery.value.trim() || !props.geocodingProvider) return
  isSearchingAddress.value = true
  try {
    const results = await props.geocodingProvider.search(manualAddressQuery.value.trim())
    manualSearchResults.value = results.slice(0, 5)
    if (results.length === 1) {
      selectManualLocation(results[0])
    }
  } catch (err) {
    console.error('Manual address lookup error:', err)
  } finally {
    isSearchingAddress.value = false
  }
}

const selectManualLocation = (item: { name: string; lat: number; lon: number }) => {
  emit('set-manual-center', { lat: item.lat, lon: item.lon }, item.name)
  manualSearchResults.value = []
  manualAddressQuery.value = ''
}

const onManualAddressBlur = () => {
  setTimeout(() => {
    manualSearchResults.value = []
  }, 180)
}

const handleCategoryClick = (id: string) => {
  emit('update:selectedCategory', id)
  emit('update:customQuery', '')
  localCustomQuery.value = ''
}

const handleCustomQueryInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  localCustomQuery.value = val
  emit('update:customQuery', val)
  if (val.trim()) {
    emit('update:selectedCategory', 'custom')
  } else {
    emit('update:selectedCategory', 'restaurant')
  }
}

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'Utensils': return Utensils
    case 'Smile': return Smile
    case 'Coffee': return Coffee
    case 'Waves': return Waves
    case 'Trees': return Trees
    default: return Search
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 1. Optimization Mode Selection -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Optimization Center Mode
        </label>
        <span class="text-[11px] font-medium" :style="{ color: MODE_COLORS[mode] }">
          {{ MODE_LABELS[mode] }}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <!-- Air Distance Mode -->
        <button
          type="button"
          @click="emit('update:mode', 'air')"
          class="flex flex-col items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all"
          :class="[
            mode === 'air'
              ? 'bg-sky-950/60 border-sky-500 text-sky-300 shadow-md shadow-sky-950/40'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ]"
        >
          <Compass class="w-4 h-4" :class="mode === 'air' ? 'text-sky-400' : 'text-slate-400'" />
          <span class="text-[11px] leading-tight text-center">Air Dist</span>
        </button>

        <!-- Road Distance Mode -->
        <button
          type="button"
          @click="emit('update:mode', 'road')"
          class="flex flex-col items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all"
          :class="[
            mode === 'road'
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ]"
        >
          <Route class="w-4 h-4" :class="mode === 'road' ? 'text-emerald-400' : 'text-slate-400'" />
          <span class="text-[11px] leading-tight text-center">Road Dist</span>
        </button>

        <!-- Driving Time Mode -->
        <button
          type="button"
          @click="emit('update:mode', 'time')"
          class="flex flex-col items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all"
          :class="[
            mode === 'time'
              ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-md shadow-amber-950/40'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ]"
        >
          <Clock class="w-4 h-4" :class="mode === 'time' ? 'text-amber-400' : 'text-slate-400'" />
          <span class="text-[11px] leading-tight text-center">Drive Time</span>
        </button>

        <!-- Manual Center Mode -->
        <button
          type="button"
          @click="emit('update:mode', 'manual')"
          class="flex flex-col items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all"
          :class="[
            mode === 'manual'
              ? 'bg-violet-950/70 border-violet-500 text-violet-300 shadow-md shadow-violet-950/40 ring-1 ring-violet-500/40'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ]"
        >
          <Target class="w-4 h-4" :class="mode === 'manual' ? 'text-violet-400' : 'text-slate-400'" />
          <span class="text-[11px] leading-tight text-center">Manual</span>
        </button>
      </div>

      <p class="text-[11px] text-slate-400 mt-2 italic">
        {{ MODE_DESCRIPTIONS[mode] }}
      </p>

      <!-- Dedicated Manual Center Configuration Card (Visible when mode === 'manual') -->
      <div
        v-if="mode === 'manual'"
        class="mt-3 p-3 rounded-xl border border-violet-500/40 bg-violet-950/20 space-y-2.5 animate-fadeIn"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-sm rotate-45 bg-violet-400 shadow-sm"></span>
            <span class="text-xs font-bold text-violet-200 uppercase tracking-wider">Manual Center Point</span>
          </div>
          <span
            v-if="manualCenter"
            class="text-[10px] font-mono text-violet-300 bg-violet-900/60 border border-violet-700/60 px-2 py-0.5 rounded-full"
          >
            {{ manualCenter.lat.toFixed(4) }}, {{ manualCenter.lon.toFixed(4) }}
          </span>
        </div>

        <div v-if="manualCenter" class="text-xs text-slate-300 flex items-center gap-1.5 font-medium">
          <MapPin class="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
          <span class="truncate">{{ manualCenter.label }}</span>
        </div>

        <!-- Address Search for Manual Center -->
        <div class="relative">
          <input
            type="text"
            v-model="manualAddressQuery"
            @keydown.enter.prevent="searchManualAddress"
            @blur="onManualAddressBlur"
            placeholder="Search city or address for center..."
            class="w-full bg-slate-900/90 border border-violet-500/40 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 rounded-lg pl-8 pr-16 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all"
          />
          <Search class="w-3.5 h-3.5 text-violet-400/70 absolute left-2.5 top-2 pointer-events-none" />
          <button
            type="button"
            @click="searchManualAddress"
            :disabled="isSearchingAddress || !manualAddressQuery.trim()"
            class="absolute right-1 top-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
          >
            <Loader2 v-if="isSearchingAddress" class="w-3 h-3 animate-spin" />
            <span v-else>Find</span>
          </button>

          <!-- Autocomplete Dropdown -->
          <div
            v-if="manualSearchResults.length > 0"
            class="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-violet-500/50 rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-800"
          >
            <button
              v-for="(item, idx) in manualSearchResults"
              :key="idx"
              type="button"
              @click="selectManualLocation(item)"
              class="w-full text-left p-2 text-xs text-slate-200 hover:bg-violet-950/60 hover:text-violet-200 flex items-center gap-2 transition-colors"
            >
              <MapPin class="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span class="truncate">{{ item.name }}</span>
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 pt-1">
          <button
            type="button"
            @click="emit('toggle-map-placement')"
            class="flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
            :class="[
              isSettingManualCenter
                ? 'bg-violet-600 border-violet-400 text-white shadow-md animate-pulse'
                : 'bg-violet-950/60 border-violet-500/60 hover:bg-violet-900/60 text-violet-200'
            ]"
          >
            <Crosshair class="w-3.5 h-3.5 text-violet-300" />
            <span>{{ isSettingManualCenter ? 'Click Map Now...' : 'Click Map to Position' }}</span>
          </button>

          <button
            type="button"
            @click="emit('reset-manual-center')"
            class="py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors"
            title="Reset to center between all attendees"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 2. Search Radius Slider (1 km - 20 km in steps of 1 km) -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <SlidersHorizontal class="w-3.5 h-3.5 text-slate-400" />
          Search Radius
        </label>
        <div class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-sky-400">
          {{ radiusKm }} km
        </div>
      </div>

      <div class="space-y-1">
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          :value="radiusKm"
          @input="emit('update:radiusKm', parseInt(($event.target as HTMLInputElement).value))"
          class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
        <div class="flex justify-between text-[10px] text-slate-400 px-0.5">
          <span>1 km</span>
          <span>5 km</span>
          <span>10 km</span>
          <span>15 km</span>
          <span>20 km</span>
        </div>
      </div>
    </div>

    <!-- 3. Query / Category Selection -->
    <div>
      <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
        Target POI Search
      </label>

      <!-- Category Pills -->
      <div class="flex flex-wrap gap-1.5 mb-2.5">
        <button
          v-for="cat in CATEGORY_PRESETS"
          :key="cat.id"
          type="button"
          @click="handleCategoryClick(cat.id)"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
          :class="[
            selectedCategory === cat.id && !localCustomQuery
              ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-sm'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
          ]"
        >
          <component :is="getCategoryIcon(cat.icon)" class="w-3.5 h-3.5" />
          {{ cat.label }}
        </button>
      </div>

      <!-- Free-Text Search -->
      <div class="relative">
        <input
          type="text"
          :value="localCustomQuery"
          @input="handleCustomQueryInput"
          placeholder="Or type custom query (e.g., pizzeria, bakery, museum)..."
          class="w-full bg-slate-800/90 border border-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-400 outline-none transition-all"
        />
        <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
      </div>
    </div>

    <!-- 4. Action Button -->
    <button
      type="button"
      @click="emit('search')"
      :disabled="!canSearch || isSearching"
      class="w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
      :class="[
        !canSearch || isSearching
          ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-500 text-white hover:brightness-110 active:scale-[0.99] shadow-sky-500/20'
      ]"
    >
      <div v-if="isSearching" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <Search v-else class="w-4 h-4" />
      <span>{{ isSearching ? 'Evaluating Multi-Mode Meetups...' : 'Find Target Meetup Places' }}</span>
    </button>

    <!-- Clear Target-Points Button -->
    <button
      v-if="hasTargetPoints"
      type="button"
      @click="emit('clear-targets')"
      class="w-full py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-rose-950/60 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
    >
      <Trash2 class="w-3.5 h-3.5 text-rose-400" />
      <span>Clear Target-Points{{ targetCount ? ` (${targetCount})` : '' }}</span>
    </button>
  </div>
</template>
