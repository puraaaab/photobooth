import type { RankedLayout, Strip, PhotoSlot, SlotDefinition } from '@/types'
import { v4 as uuidv4 } from 'uuid'

// ─── Layout Engine ────────────────────────────────────────────────────────────
// Calculates all valid strip arrangements for a given photo count + photos per strip.
// Returns multiple ranked options for the user to choose from.

export class LayoutEngine {
  /**
   * Returns ALL valid arrangements (ordered distribution of photos across strips).
   * E.g., distribute(14, 4) → [[4,4,4,2], [4,4,3,3], [3,3,4,4], ...]
   */
  calculateExactLayouts(photoCount: number, photosPerStrip: number): number[][] {
    if (photoCount <= 0 || photosPerStrip <= 0) return []
    
    // Strict maximum: never more than 4 photos per strip
    const effectivePhotosPerStrip = Math.min(4, Math.max(1, photosPerStrip))
    const results: number[][] = []
    const minStrips = Math.ceil(photoCount / effectivePhotosPerStrip)
    
    // Generate distributions for each reasonable strip count
    for (let strips = minStrips; strips <= Math.min(minStrips + 2, 12); strips++) {
      const arrangements = this._distribute(photoCount, strips, effectivePhotosPerStrip)
      results.push(...arrangements)
    }
    
    // Deduplicate
    const seen = new Set<string>()
    return results.filter(arr => {
      const key = arr.join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  /**
   * Returns balanced distributions first (equal strip sizes preferred).
   */
  calculateBalancedLayouts(photoCount: number, photosPerStrip: number): number[][] {
    const all = this.calculateExactLayouts(photoCount, photosPerStrip)
    
    return all.sort((a, b) => {
      // Lower variance = more balanced
      const varA = this._variance(a)
      const varB = this._variance(b)
      return varA - varB
    })
  }

  /**
   * Returns arrangements that minimize strip count (fill strips as full as possible).
   */
  calculateMinimumStripLayouts(photoCount: number, photosPerStrip: number): number[][] {
    if (photoCount <= 0 || photosPerStrip <= 0) return []
    
    const effectivePhotosPerStrip = Math.min(4, Math.max(1, photosPerStrip))
    const minStrips = Math.ceil(photoCount / effectivePhotosPerStrip)
    const arrangements = this._distribute(photoCount, minStrips, effectivePhotosPerStrip)
    return arrangements
  }

  /**
   * Arrange photos into a user-specified number of strips.
   * Distributes as evenly as possible without exceeding maxPerStrip.
   */
  calculateUserRequestedStripCount(
    photoCount: number,
    stripCount: number,
    maxPerStrip: number = 4
  ): number[][] {
    if (photoCount <= 0 || stripCount <= 0) return []
    
    // Each strip must never exceed 4 photos
    const effectiveMax = Math.min(4, Math.max(1, maxPerStrip))
    const minStrips = Math.ceil(photoCount / effectiveMax)
    const validStripCount = Math.max(minStrips, stripCount)
    
    // Try distributing within effectiveMax
    const distributions = this._distribute(photoCount, validStripCount, effectiveMax)
    if (distributions.length > 0) return distributions
    
    // Fallback: even distribution clamped to effectiveMax
    const base = Math.min(effectiveMax, Math.floor(photoCount / validStripCount))
    const remainder = photoCount - base * validStripCount
    const arrangement: number[] = []
    for (let i = 0; i < validStripCount; i++) {
      arrangement.push(Math.min(maxPerStrip, base + (i < remainder ? 1 : 0)))
    }
    
    return [arrangement]
  }

  /**
   * Main entry: returns ranked layout suggestions for the UI to display.
   * Always returns at least 3 options when possible.
   */
  rankLayoutSuggestions(photoCount: number, photosPerStrip: number): RankedLayout[] {
    if (photoCount <= 0 || photosPerStrip <= 0) return []
    
    const allLayouts = this.calculateExactLayouts(photoCount, photosPerStrip)
    const ranked: RankedLayout[] = []
    
    // Sort by quality: prefer balanced, then compact
    const sorted = allLayouts.sort((a, b) => {
      const stripDiff = a.length - b.length
      if (stripDiff !== 0) return stripDiff
      return this._variance(a) - this._variance(b)
    })
    
    sorted.slice(0, 6).forEach((arrangement, idx) => {
      const unusedSlots = arrangement.reduce((sum, n) => sum + (photosPerStrip - n), 0)
      const totalSlots = arrangement.length * photosPerStrip
      
      let label = 'Option'
      if (idx === 0) {
        label = this._variance(arrangement) === 0 ? 'Balanced' : 'Recommended'
      } else if (arrangement.every(n => n === photosPerStrip || n === photosPerStrip - 1)) {
        label = 'Compact'
      } else if (arrangement.length === Math.ceil(photoCount / photosPerStrip)) {
        label = 'Minimal Strips'
      }
      
      ranked.push({
        arrangement,
        stripCount: arrangement.length,
        rank: idx + 1,
        label,
        totalPhotos: photoCount,
        unusedPhotos: totalSlots - photoCount,
      })
    })
    
    return ranked
  }

  /**
   * Build Strip objects from an arrangement.
   * Each strip gets empty slots that will be filled by PhotoAssignment.
   */
  buildStrips(
    arrangement: number[],
    templateSlotDef: Omit<SlotDefinition, 'id'>,
    canvasWidth: number,
    canvasHeight: number
  ): Strip[] {
    return arrangement.map((photoCount, stripIndex) => {
      const stripId = uuidv4()
      
      // Calculate slot positions dynamically
      const slotHeight = canvasHeight / arrangement.length * 0.85
      const slotWidth = canvasWidth * 0.85
      const slotX = (canvasWidth - slotWidth) / 2
      const stripHeight = canvasHeight / arrangement.length
      
      const slots: PhotoSlot[] = Array.from({ length: photoCount }, (_, slotIndex) => {
        const slotId = uuidv4()
        const slotH = (stripHeight * 0.85) / photoCount
        
        return {
          id: slotId,
          position: slotIndex,
          photoId: undefined,
          slotDefinition: {
            ...templateSlotDef,
            id: slotId,
            x: slotX,
            y: stripIndex * stripHeight + (stripHeight * 0.075) + slotIndex * slotH,
            width: slotWidth,
            height: slotH * 0.95,
          },
        }
      })
      
      return {
        id: stripId,
        index: stripIndex,
        slots,
        canvasElements: [],
      }
    })
  }

  /**
   * Auto-assign selected photos to strips in order.
   */
  autoAssignPhotos(
    photoIds: string[],
    strips: Strip[]
  ): import('@/types').PhotoAssignment[] {
    const assignments: import('@/types').PhotoAssignment[] = []
    let photoIdx = 0
    
    for (const strip of strips) {
      for (const slot of strip.slots) {
        if (photoIdx >= photoIds.length) break
        assignments.push({
          photoId: photoIds[photoIdx],
          stripId: strip.id,
          slotId: slot.id,
          position: slot.position,
        })
        photoIdx++
      }
    }
    
    return assignments
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recursively generate all ways to distribute `total` photos into `strips` strips,
   * where each strip has at most `maxPerStrip` photos and at least 1 photo.
   */
  private _distribute(
    total: number,
    strips: number,
    maxPerStrip: number
  ): number[][] {
    if (strips === 1) {
      if (total > 0 && total <= maxPerStrip) return [[total]]
      return []
    }
    
    const results: number[][] = []
    const minForRest = strips - 1 // Each remaining strip needs at least 1
    const maxFirst = Math.min(maxPerStrip, total - minForRest)
    const minFirst = Math.max(1, total - (strips - 1) * maxPerStrip)
    
    for (let first = maxFirst; first >= minFirst; first--) {
      const rest = this._distribute(total - first, strips - 1, maxPerStrip)
      for (const r of rest) {
        results.push([first, ...r])
      }
    }
    
    return results
  }

  /** Calculate variance of a number array (for balance scoring) */
  private _variance(arr: number[]): number {
    if (arr.length === 0) return 0
    const mean = arr.reduce((sum, n) => sum + n, 0) / arr.length
    return arr.reduce((sum, n) => sum + (n - mean) ** 2, 0) / arr.length
  }
}

// Singleton instance
export const layoutEngine = new LayoutEngine()
