<script setup lang="ts">
import { ref } from 'vue'
import { StartPoint, START_POINT_COLORS } from '../types'
import { GeocodingProvider } from '../services/interfaces'
import { Search, MapPin, X, Plus, Sparkles, Navigation, AlertCircle, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  startPoints: StartPoint[]
  geocodingProvider: GeocodingProvider
}>()

const emit = defineEmits<{
  (e: 'add-point', point: Omit<StartPoint, 'id' | 'color'>): void
  (e: 'remove-point', id: string): void
  (e: 'center-point', point: StartPoint): void
  (e: 'load-sample'): void
  (e: 'clear-all'): void
}>()

const searchQuery = ref('')
const suggestions = ref<Omit<StartPoint, 'color'>[]>([])
const isSearching = ref(false)
const showDropdown = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const onInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!searchQuery.value || searchQuery.value.trim().length < 2) {
    suggestions.value = []
    showDropdown.value = false
    return
  }

  debounceTimer = setTimeout(async () => {
    isSearching.value = true
    try {
      suggestions.value = await props.geocodingProvider.search(searchQuery.value)
      showDropdown.value = suggestions.value.length > 0
    } catch (err) {
      console.error('Search failed:', err)
      suggestions.value = []
    } finally {
      isSearching.value = false
    }
  }, 250)
}

const onBlur = () => {
  setTimeout(() => {
    showDropdown.value = false
  }, 180)
}

const selectSuggestion = (s: Omit<StartPoint, 'color'>) => {
  emit('add-point', s)
  searchQuery.value = ''
  suggestions.value = []
  showDropdown.value = false
}

const removePoint = (id: string) => {
  emit('remove-point', id)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Quick Action -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Start-Points ({{ startPoints.length }})
        </h3>
        <p class="text-xs text-slate-500">
          Add 2 or more places to find the equidistant meetup
        </p>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          v-if="startPoints.length > 0"
          @click="emit('clear-all')"
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 hover:border-rose-500/50 transition-colors shadow-sm"
          title="Clear all start-points"
        >
          <Trash2 class="w-3.5 h-3.5" />
          Clear
        </button>

        <button
          @click="emit('load-sample')"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg border border-slate-700 hover:border-sky-500/50 transition-colors shadow-sm"
          title="Load 3 sample locations to test immediately"
        >
          <Sparkles class="w-3.5 h-3.5 text-sky-400" />
          Sample Group
        </button>
      </div>
    </div>

    <!-- Autocomplete Search Input -->
    <div class="relative">
      <div class="relative">
        <input
          v-model="searchQuery"
          @input="onInput"
          @focus="showDropdown = suggestions.length > 0"
          @blur="onBlur"
          type="text"
          placeholder="Search address, station, city or click map..."
          class="w-full bg-slate-800/90 border border-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-400 outline-none transition-all"
        />
        <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />

        <div v-if="isSearching" class="absolute right-3.5 top-3.5">
          <div class="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>

      <!-- Autocomplete Dropdown -->
      <div
        v-if="showDropdown && suggestions.length > 0"
        class="absolute z-50 left-0 right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-700/50"
      >
        <button
          v-for="s in suggestions"
          :key="s.id"
          @click="selectSuggestion(s)"
          class="w-full text-left px-3.5 py-2.5 hover:bg-slate-700/70 text-xs flex items-start gap-2.5 transition-colors group"
        >
          <MapPin class="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
          <div class="flex-1 overflow-hidden">
            <div class="font-medium text-slate-200 truncate">{{ s.name }}</div>
            <div class="text-[10px] text-slate-400">{{ s.lat.toFixed(4) }}, {{ s.lon.toFixed(4) }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- List of Added Start Points -->
    <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
      <div
        v-for="(point, idx) in startPoints"
        :key="point.id"
        class="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 transition-all group"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm flex-shrink-0"
            :style="{ backgroundColor: point.color || START_POINT_COLORS[idx % START_POINT_COLORS.length] }"
          >
            {{ idx + 1 }}
          </div>
          <div class="truncate">
            <div class="text-xs font-medium text-slate-200 truncate" :title="point.name">
              {{ point.name }}
            </div>
            <div class="text-[10px] text-slate-400">
              {{ point.lat.toFixed(4) }}, {{ point.lon.toFixed(4) }}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            @click="emit('center-point', point)"
            class="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-sky-400 transition-colors"
            title="Focus on map"
          >
            <Navigation class="w-3.5 h-3.5" />
          </button>
          <button
            @click="removePoint(point.id)"
            class="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
            title="Remove location"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        v-if="startPoints.length < 2"
        class="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs"
      >
        <AlertCircle class="w-4 h-4 flex-shrink-0 text-amber-400" />
        <span>Add at least <strong>{{ 2 - startPoints.length }} more</strong> start-point to calculate optimal meetup centers.</span>
      </div>
    </div>
  </div>
</template>
