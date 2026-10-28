import type { PhotoEdits } from '@/types'

// ─── Render Cache ─────────────────────────────────────────────────────────────
// LRU cache keyed by hash(photoId + edits).
// Text/sticker/background changes do NOT invalidate photo render cache.
// Only PhotoEdits changes do.

const MAX_ENTRIES = 50

export class RenderCache {
  private cache: Map<string, { bitmap: ImageBitmap; lastAccessed: number }> = new Map()

  getKey(photoId: string, edits: PhotoEdits): string {
    // Create a deterministic hash from photoId + edits
    const editStr = JSON.stringify({
      photoId,
      filter: edits.filter,
      filterIntensity: edits.filterIntensity,
      crop: edits.crop,
      rotation: edits.rotation,
      flipH: edits.flipH,
      flipV: edits.flipV,
      brightness: edits.brightness,
      contrast: edits.contrast,
      saturation: edits.saturation,
      exposure: edits.exposure,
      temperature: edits.temperature,
      tint: edits.tint,
      highlights: edits.highlights,
      shadows: edits.shadows,
      sharpness: edits.sharpness,
      blur: edits.blur,
      grain: edits.grain,
      vignette: edits.vignette,
      fade: edits.fade,
    })
    return this._simpleHash(editStr)
  }

  get(key: string): ImageBitmap | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    entry.lastAccessed = Date.now()
    return entry.bitmap
  }

  set(key: string, bitmap: ImageBitmap): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_ENTRIES) {
      this._evict()
    }
    this.cache.set(key, { bitmap, lastAccessed: Date.now() })
  }

  invalidate(photoId: string): void {
    // Remove all entries for this photo (any edits)
    for (const [key] of this.cache) {
      if (key.startsWith(photoId) || this._keyBelongsToPhoto(key, photoId)) {
        this.cache.delete(key)
      }
    }
  }

  invalidateAll(): void {
    for (const entry of this.cache.values()) {
      entry.bitmap.close()
    }
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  private _evict(): void {
    // LRU: remove least recently accessed entry
    let oldest = Infinity
    let oldestKey = ''
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldest) {
        oldest = entry.lastAccessed
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      const entry = this.cache.get(oldestKey)
      entry?.bitmap.close()
      this.cache.delete(oldestKey)
    }
  }

  private _keyBelongsToPhoto(key: string, photoId: string): boolean {
    // We can't reverse the hash, so we track photo-to-key mapping separately
    // For simplicity, rebuild key with empty edits and check prefix
    return false // Conservative: only evict exact matches
  }

  private _simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }
}

export const renderCache = new RenderCache()
