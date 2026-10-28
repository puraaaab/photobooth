import type { PhotoEdits, FilterConfig, FilterPreset } from '@/types'

// ─── Filter Engine ────────────────────────────────────────────────────────────
// Dual-path: CSS filters for fast real-time UI preview,
// Canvas 2D for export-quality rendering.
// Both paths use the SAME FilterConfig definition for consistency.

export class FilterEngine {
  
  // ─── CSS Preview Path ─────────────────────────────────────────────────────
  // Returns a CSS filter string for fast UI preview (GPU-accelerated)
  
  getCSSFilter(edits: PhotoEdits): string {
    const filterId = edits.filter || 'original'
    const targetId = filterId === 'bw' || filterId === 'bnw' ? 'bw_classic'
      : (filterId === 'raw' || filterId === 'none') ? 'original'
      : filterId

    const preset = FILTER_PRESETS.find(p => p.id === targetId || p.id === filterId)
    const config = this._mergeWithPreset(edits, preset)
    const rawIntensity = edits.filterIntensity !== undefined ? edits.filterIntensity : 100
    const intensity = Math.max(0, Math.min(100, rawIntensity)) / 100
    
    const brightness = 1 + (config.brightness + config.exposure) / 100
    const contrast = 1 + config.contrast / 100
    const saturation = Math.max(0, 1 + config.saturation / 100)
    
    // Temperature + tint + hueRotate
    const hueRotateDeg = (config.temperature * 0.3) + (config.tint * 0.35) + (config.hueRotate || 0)
    
    // Sepia: either explicit config.sepia or derived from temperature/sepia preset
    let sepia = config.sepia !== undefined ? config.sepia / 100 : 0
    if (filterId === 'sepia' || filterId === 'retro_sepia') {
      sepia = Math.max(sepia, 0.75 * intensity)
    } else if (config.temperature > 0 && config.sepia === undefined) {
      sepia = Math.max(sepia, config.temperature / 400)
    }
    
    // Fade → reduce contrast + add brightness
    const fadeContrast = contrast * (1 - config.fade / 200)
    const fadeBrightness = brightness + config.fade / 300
    
    // Grayscale
    const isFullGrayscale = (config.grayscale !== undefined && config.grayscale >= 95) || config.saturation <= -95
    const partialGrayscale = (config.grayscale !== undefined && config.grayscale > 0 && config.grayscale < 95)
      ? config.grayscale / 100
      : (config.saturation < 0 && config.saturation > -95 ? Math.min(1, -config.saturation / 100 * 0.5) : 0)

    const parts = [
      `brightness(${Math.max(0, fadeBrightness).toFixed(3)})`,
      `contrast(${Math.max(0, fadeContrast).toFixed(3)})`,
      isFullGrayscale 
        ? 'grayscale(1)' 
        : partialGrayscale > 0 
          ? `grayscale(${partialGrayscale.toFixed(3)}) saturate(${saturation.toFixed(3)})` 
          : `saturate(${saturation.toFixed(3)})`,
      sepia > 0.005 ? `sepia(${Math.min(1, sepia).toFixed(3)})` : '',
      Math.abs(hueRotateDeg) > 0.1 ? `hue-rotate(${hueRotateDeg.toFixed(1)}deg)` : '',
      config.invert && config.invert > 0 ? `invert(${(config.invert / 100).toFixed(2)})` : '',
      config.blur && config.blur > 0 ? `blur(${(config.blur * 0.5).toFixed(1)}px)` : '',
    ].filter(Boolean)
    
    return parts.length > 0 ? parts.join(' ') : 'none'
  }

  // ─── Canvas Render Path ───────────────────────────────────────────────────
  // Renders a photo with all edits to a canvas element (high quality)
  
  async renderToCanvas(
    image: HTMLImageElement | ImageBitmap,
    edits: PhotoEdits,
    outputCanvas: HTMLCanvasElement,
    outputWidth: number,
    outputHeight: number
  ): Promise<void> {
    const ctx = outputCanvas.getContext('2d')
    if (!ctx) return
    
    outputCanvas.width = outputWidth
    outputCanvas.height = outputHeight
    
    ctx.clearRect(0, 0, outputWidth, outputHeight)
    
    const filterId = edits.filter || 'original'
    const targetId = filterId === 'bw' || filterId === 'bnw' ? 'bw_classic'
      : (filterId === 'raw' || filterId === 'none') ? 'original'
      : filterId

    const preset = FILTER_PRESETS.find(p => p.id === targetId || p.id === filterId)
    const config = this._mergeWithPreset(edits, preset)
    
    // Save state
    ctx.save()
    
    // ─── Apply transformations ────────────────────────────────────────────
    ctx.translate(outputWidth / 2, outputHeight / 2)
    
    if (edits.flipH) ctx.scale(-1, 1)
    if (edits.flipV) ctx.scale(1, -1)
    
    const angle = (edits.rotation * Math.PI) / 180
    ctx.rotate(angle)
    
    // ─── Calculate crop region ────────────────────────────────────────────
    const srcWidth = (image instanceof HTMLImageElement ? image.naturalWidth : image.width) * edits.crop.width
    const srcHeight = (image instanceof HTMLImageElement ? image.naturalHeight : image.height) * edits.crop.height
    const srcX = (image instanceof HTMLImageElement ? image.naturalWidth : image.width) * edits.crop.x
    const srcY = (image instanceof HTMLImageElement ? image.naturalHeight : image.height) * edits.crop.y
    
    // Draw image
    ctx.drawImage(
      image,
      srcX, srcY, srcWidth, srcHeight,
      -outputWidth / 2, -outputHeight / 2, outputWidth, outputHeight
    )
    
    ctx.restore()
    
    // ─── Apply pixel-level adjustments ───────────────────────────────────
    const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight)
    this._applyPixelAdjustments(imageData, config)
    ctx.putImageData(imageData, 0, 0)
    
    // ─── Post-process effects ─────────────────────────────────────────────
    if (config.vignette > 0) {
      this._applyVignette(ctx, outputWidth, outputHeight, config.vignette)
    }
    
    if (config.grain > 0) {
      this._applyGrain(ctx, outputWidth, outputHeight, config.grain)
    }
  }

  // ─── Pixel-level adjustments ──────────────────────────────────────────────
  
  private _applyPixelAdjustments(
    imageData: ImageData,
    config: FilterConfig
  ): void {
    const data = imageData.data
    
    // Pre-compute lookup tables for performance
    const brightness = config.brightness + config.exposure
    const contrast = config.contrast
    const saturation = config.saturation
    const temperature = config.temperature
    const tint = config.tint
    const highlights = config.highlights
    const shadows = config.shadows
    const fade = config.fade
    const sepia = config.sepia !== undefined ? config.sepia / 100 : (config.filter === 'sepia' || config.filter === 'retro_sepia' ? 0.75 : 0)
    const isFullGrayscale = (config.grayscale !== undefined && config.grayscale >= 95) || saturation <= -95
    const partialGrayscale = (config.grayscale !== undefined && config.grayscale > 0 && config.grayscale < 95) ? config.grayscale / 100 : 0
    
    // Contrast multiplier
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      
      // Brightness
      if (brightness !== 0) {
        r += brightness * 2.55
        g += brightness * 2.55
        b += brightness * 2.55
      }
      
      // Contrast
      if (contrast !== 0) {
        r = contrastFactor * (r - 128) + 128
        g = contrastFactor * (g - 128) + 128
        b = contrastFactor * (b - 128) + 128
      }
      
      // Temperature (warm/cool)
      if (temperature !== 0) {
        r += temperature * 0.5
        b -= temperature * 0.5
      }
      
      // Tint (green/magenta)
      if (tint !== 0) {
        g += tint * 0.3
        r -= tint * 0.15
        b -= tint * 0.15
      }
      
      // Saturation
      if (saturation !== 0 && !isFullGrayscale) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = gray + (r - gray) * (1 + saturation / 100)
        g = gray + (g - gray) * (1 + saturation / 100)
        b = gray + (b - gray) * (1 + saturation / 100)
      }

      // Grayscale
      if (isFullGrayscale) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        r = gray
        g = gray
        b = gray
      } else if (partialGrayscale > 0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        r = r * (1 - partialGrayscale) + gray * partialGrayscale
        g = g * (1 - partialGrayscale) + gray * partialGrayscale
        b = b * (1 - partialGrayscale) + gray * partialGrayscale
      }

      // Sepia
      if (sepia > 0) {
        const sR = (r * 0.393) + (g * 0.769) + (b * 0.189)
        const sG = (r * 0.349) + (g * 0.686) + (b * 0.168)
        const sB = (r * 0.272) + (g * 0.534) + (b * 0.131)
        r = r * (1 - sepia) + sR * sepia
        g = g * (1 - sepia) + sG * sepia
        b = b * (1 - sepia) + sB * sepia
      }
      
      // Highlights / Shadows (simple tone mapping)
      if (highlights !== 0 || shadows !== 0) {
        const luminance = (r + g + b) / 3 / 255
        
        if (highlights !== 0 && luminance > 0.5) {
          const factor = (luminance - 0.5) * 2
          const adj = highlights * 0.5 * factor
          r += adj; g += adj; b += adj
        }
        
        if (shadows !== 0 && luminance < 0.5) {
          const factor = (0.5 - luminance) * 2
          const adj = shadows * 0.5 * factor
          r += adj; g += adj; b += adj
        }
      }
      
      // Fade (reduce contrast toward gray)
      if (fade > 0) {
        const fadeAmount = fade / 100
        r = r * (1 - fadeAmount * 0.4) + 128 * fadeAmount * 0.4
        g = g * (1 - fadeAmount * 0.4) + 128 * fadeAmount * 0.4
        b = b * (1 - fadeAmount * 0.4) + 128 * fadeAmount * 0.4
      }
      
      // Clamp
      data[i] = Math.max(0, Math.min(255, r))
      data[i + 1] = Math.max(0, Math.min(255, g))
      data[i + 2] = Math.max(0, Math.min(255, b))
    }
  }
  
  private _applyVignette(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number
  ): void {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.3,
      width / 2, height / 2, Math.max(width, height) * 0.7
    )
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, `rgba(0,0,0,${intensity / 100})`)
    
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
  
  private _applyGrain(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number
  ): void {
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const grainAmount = intensity * 0.5
    
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * grainAmount * 2
      data[i] = Math.max(0, Math.min(255, data[i] + noise))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
    }
    
    ctx.putImageData(imageData, 0, 0)
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private _mergeWithPreset(
    edits: PhotoEdits,
    preset?: FilterPreset
  ): FilterConfig {
    const base: FilterConfig = {
      filter: edits.filter || 'original',
      filterIntensity: edits.filterIntensity ?? 100,
      brightness: edits.brightness,
      contrast: edits.contrast,
      saturation: edits.saturation,
      exposure: edits.exposure,
      temperature: edits.temperature,
      tint: edits.tint,
      highlights: edits.highlights,
      shadows: edits.shadows,
      sharpness: edits.sharpness ?? 0,
      blur: edits.blur ?? 0,
      grain: edits.grain,
      vignette: edits.vignette,
      fade: edits.fade,
      sepia: (edits as any).sepia ?? 0,
      hueRotate: (edits as any).hueRotate ?? 0,
      grayscale: (edits as any).grayscale ?? 0,
      invert: (edits as any).invert ?? 0,
    }
    
    if (!preset || preset.id === 'original' || !preset.config) return base
    
    const rawIntensity = edits.filterIntensity !== undefined ? edits.filterIntensity : 100
    const intensity = Math.max(0, Math.min(100, rawIntensity)) / 100
    
    // Merge preset deltas scaled by filter intensity over base edits
    const merged: FilterConfig = { ...base }
    for (const key of Object.keys(preset.config) as (keyof FilterConfig)[]) {
      const presetVal = preset.config[key]
      if (typeof presetVal === 'number') {
        const baseNum = typeof base[key] === 'number' ? (base[key] as number) : 0
        ;(merged as Record<string, any>)[key] = baseNum + presetVal * intensity
      }
    }
    
    return merged
  }
}

// ─── Filter Presets ───────────────────────────────────────────────────────────

export const FILTER_PRESETS: FilterPreset[] = [
  // ─── Korean Photobooth (K-Booth) ──────────────────────────────────────────
  {
    id: 'haru_soft',
    name: 'Haru Soft',
    category: 'korean',
    badge: 'K-BOOTH',
    description: 'Iconic Korean self-studio high-key bright look with soft shadows and porcelain clarity',
    config: { brightness: 12, contrast: -6, saturation: 8, temperature: 6, tint: -2, highlights: 10, shadows: 15, fade: 8 },
  },
  {
    id: 'life4cuts_pink',
    name: 'Life4Cuts Pink',
    category: 'korean',
    badge: 'POPULAR',
    description: 'Youthful Korean 4-cut peachy blush tone with rosy skin glow',
    config: { brightness: 10, contrast: 4, saturation: 18, temperature: 10, tint: 22, highlights: 8, fade: 6 },
  },
  {
    id: 'photoism_studio',
    name: 'Photoism Studio',
    category: 'korean',
    badge: 'STUDIO',
    description: 'Crisp studio-grade portrait lighting with true neutral skin tones and high clarity',
    config: { brightness: 8, contrast: 14, saturation: 4, temperature: -2, highlights: 6, shadows: -4 },
  },
  {
    id: 'porcelain_glow',
    name: 'Porcelain Glow',
    category: 'korean',
    badge: 'BEAUTY',
    description: 'Airbrushed soft glow, luminous skin highlights, and velvety soft shadows',
    config: { brightness: 16, contrast: -10, saturation: -6, temperature: 4, fade: 18, highlights: 12 },
  },
  {
    id: 'chocoberry',
    name: 'Chocoberry K-Pop',
    category: 'korean',
    description: 'Cozy honey-chocolate warmth with rich Idol photobooth vibes',
    config: { brightness: 2, contrast: 12, saturation: 12, temperature: 24, tint: 8, shadows: 8, vignette: 15 },
  },
  {
    id: 'k_soft_mono',
    name: 'K-Monochrome',
    category: 'korean',
    description: 'Milky high-key Korean studio monochrome with glowing white tones',
    config: { grayscale: 100, saturation: -100, brightness: 12, contrast: -5, fade: 14, highlights: 10 },
  },

  // ─── Glam & Celebrity Red Carpet ───────────────────────────────────────────
  {
    id: 'kardashian_glam',
    name: 'Kardashian Glam',
    category: 'glam',
    badge: 'SIGNATURE',
    description: 'World-famous signature high-contrast B&W with luminous skin and deep inky blacks',
    config: { grayscale: 100, saturation: -100, brightness: 6, contrast: 48, highlights: 20, shadows: -16 },
  },
  {
    id: 'glam_hollywood',
    name: 'Hollywood Gold',
    category: 'glam',
    badge: 'LUXURY',
    description: 'Warm champagne luxury glow with flattering skin tones and soft gold highlights',
    config: { brightness: 10, contrast: 8, saturation: 14, temperature: 28, highlights: 12, sepia: 8, fade: 5 },
  },
  {
    id: 'met_gala_noir',
    name: 'Met Gala Noir',
    category: 'glam',
    description: 'High-fashion dramatic monochrome with deep sculpted blacks and silver whites',
    config: { grayscale: 100, saturation: -100, brightness: -4, contrast: 65, highlights: 25, shadows: -25, vignette: 25 },
  },
  {
    id: 'airbrush_glow',
    name: 'Airbrush Glow',
    category: 'glam',
    description: 'Diffused beauty dish lighting with skin smoothing glow',
    config: { brightness: 14, contrast: -8, saturation: 6, temperature: 8, fade: 12, blur: 0.3, highlights: 14 },
  },
  {
    id: 'silk_portrait',
    name: 'Silk Portrait',
    category: 'glam',
    description: 'Silky smooth contrast with subtle desaturation for timeless weddings and galas',
    config: { brightness: 4, contrast: 12, saturation: -12, temperature: 6, fade: 8, highlights: 5, shadows: 5 },
  },

  // ─── Analog Film Stocks ───────────────────────────────────────────────────
  {
    id: 'portra_400',
    name: 'Kodak Portra 400',
    category: 'film',
    badge: 'PRO FILM',
    description: 'Legendary portrait film stock with warm creamy skin tones and gentle highlights',
    config: { temperature: 16, saturation: 8, contrast: 6, highlights: -8, shadows: 12, grain: 18, fade: 8 },
  },
  {
    id: 'kodak_gold',
    name: 'Kodak Gold 200',
    category: 'film',
    description: 'Sunny afternoon amber warmth, rich yellow-orange mids, and vibrant holiday feel',
    config: { temperature: 32, saturation: 22, contrast: 12, brightness: 4, highlights: -4, grain: 22, sepia: 6 },
  },
  {
    id: 'kodak_ektar',
    name: 'Kodak Ektar 100',
    category: 'film',
    description: 'Ultra-vivid saturation with deep punchy contrast and crisp vivid details',
    config: { contrast: 24, saturation: 32, brightness: 2, temperature: 4, shadows: -8, grain: 12 },
  },
  {
    id: 'fuji_pro_400h',
    name: 'Fuji Pro 400H',
    category: 'film',
    badge: 'AESTHETIC',
    description: 'Iconic airy cool mint-cyan undertones, soft pastel highlights, and flattering tones',
    config: { temperature: -14, tint: -8, saturation: 12, brightness: 8, contrast: -4, fade: 12, grain: 16 },
  },
  {
    id: 'fuji_velvia',
    name: 'Fuji Velvia 50',
    category: 'film',
    description: 'Hyper-saturated jewel tones with bold contrast and rich dramatic color',
    config: { contrast: 28, saturation: 42, brightness: -2, temperature: -6, tint: 6, grain: 10 },
  },
  {
    id: 'cinestill_800t',
    name: 'CineStill 800T',
    category: 'film',
    badge: 'CINEMA',
    description: 'Tungsten cinema stock with cool teal shadows and glowing amber halation highlights',
    config: { temperature: -18, tint: -10, contrast: 18, saturation: 14, brightness: -4, highlights: 16, grain: 24 },
  },
  {
    id: 'ilford_hp5',
    name: 'Ilford HP5 Plus',
    category: 'film',
    description: 'Classic British documentary 35mm silver grain B&W with balanced gradation',
    config: { grayscale: 100, saturation: -100, contrast: 16, brightness: 2, grain: 28, shadows: 6 },
  },
  {
    id: 'kodak_tri_x',
    name: 'Kodak Tri-X 400',
    category: 'film',
    description: 'Gritty street photography B&W with punchy contrast, deep blacks, and bold grain',
    config: { grayscale: 100, saturation: -100, contrast: 52, brightness: -6, grain: 38, shadows: -12 },
  },
  {
    id: 'polaroid_600',
    name: 'Polaroid 600',
    category: 'film',
    description: 'Instant film nostalgia with warm lifted cream shadows and gentle vintage fade',
    config: { temperature: 18, saturation: 12, contrast: -4, fade: 24, brightness: 6, sepia: 10, vignette: 18, grain: 20 },
  },
  {
    id: 'disposable_90s',
    name: '90s Disposable',
    category: 'film',
    description: 'Authentic 90s party disposable flash camera with punchy saturation and film grain',
    config: { contrast: 22, saturation: 26, temperature: 14, tint: -6, grain: 40, brightness: 4, fade: 12, vignette: 20 },
  },
  // Legacy film aliases
  { id: 'kodak', name: 'Kodak Classic', category: 'film', config: { temperature: 10, saturation: 10, contrast: 5, highlights: -5, shadows: 10 } },
  { id: 'fuji', name: 'Fuji Classic', category: 'film', config: { temperature: -10, saturation: 15, contrast: 8, tint: 5 } },
  { id: 'polaroid', name: 'Polaroid Classic', category: 'film', config: { saturation: 15, contrast: -5, fade: 20, temperature: 15, brightness: 5 } },
  { id: 'disposable', name: 'Disposable Flash', category: 'film', config: { saturation: 20, contrast: 15, grain: 35, temperature: 10, fade: 10 } },
  { id: 'instant', name: 'Instant Film', category: 'film', config: { saturation: -10, fade: 25, temperature: 20, brightness: 5, vignette: 20 } },

  // ─── Retro & Y2K Nostalgia ────────────────────────────────────────────────
  {
    id: 'y2k_digicam',
    name: 'Y2K Digicam',
    category: 'vintage',
    badge: 'TRENDING',
    description: '2000s direct flash snapshot look with cyber-cool highlights and punchy contrast',
    config: { brightness: 8, contrast: 26, saturation: 16, temperature: -12, tint: -4, highlights: 15, grain: 18 },
  },
  {
    id: 'retro_mall_booth',
    name: 'Mall Photobooth',
    category: 'vintage',
    badge: 'RETRO',
    description: 'Authentic 1980s 4-strip analog photobooth warmth with dye-sub fade and vignette',
    config: { temperature: 24, saturation: -8, contrast: 10, fade: 26, grain: 25, vignette: 32 },
  },
  {
    id: 'vhs_1994',
    name: '1994 VHS',
    category: 'vintage',
    description: 'Retro home camcorder magnetic warmth with soft contrast and nostalgic haze',
    config: { brightness: 6, contrast: -12, saturation: 8, temperature: 15, fade: 32, grain: 32 },
  },
  {
    id: 'super_8',
    name: 'Super 8mm',
    category: 'vintage',
    description: 'Golden-sepia vintage home movie reel with sunny haze and nostalgic grain',
    config: { temperature: 35, saturation: 10, contrast: 12, fade: 28, grain: 45, sepia: 22, vignette: 35 },
  },
  {
    id: 'faded_polaroid',
    name: 'Faded Instant',
    category: 'vintage',
    description: 'Washed matte blacks with dreamy muted pastel tones and vintage softness',
    config: { fade: 42, saturation: -22, temperature: 16, brightness: 4, shadows: 18, vignette: 16 },
  },
  {
    id: 'retro_sepia',
    name: 'Retro Sepia',
    category: 'vintage',
    description: 'Antique coffee-toned photobooth style with warm monochrome depth',
    config: { saturation: -80, temperature: 45, sepia: 65, fade: 18, contrast: 8, brightness: -2 },
  },
  {
    id: 'vintage_warm',
    name: '70s Sunburst',
    category: 'vintage',
    description: 'Sunburst amber hues, warm glowing shadows, and vintage disco party vibes',
    config: { temperature: 38, saturation: 18, contrast: 8, fade: 18, grain: 20, vignette: 22 },
  },
  // Legacy vintage aliases
  { id: 'vintage', name: 'Vintage Classic', category: 'vintage', config: { temperature: 20, saturation: -15, fade: 20, vignette: 30, contrast: -5 } },
  { id: 'retro', name: 'Retro Film', category: 'vintage', config: { temperature: 25, saturation: -20, fade: 30, grain: 25, contrast: 10 } },
  { id: 'sepia', name: 'Classic Sepia', category: 'vintage', config: { saturation: -80, temperature: 40, fade: 20, brightness: -5, sepia: 65 } },
  { id: 'faded_film', name: 'Faded Film', category: 'vintage', config: { fade: 40, saturation: -25, temperature: 15, shadows: 20 } },
  { id: 'old_camera', name: 'Old Camera', category: 'vintage', config: { saturation: -40, temperature: 15, grain: 30, vignette: 40, fade: 25 } },
  { id: 'nineties', name: '90s Film', category: 'vintage', config: { saturation: 20, temperature: -10, contrast: -5, fade: 15, grain: 15 } },

  // ─── Black & White ────────────────────────────────────────────────────────
  {
    id: 'bw_classic',
    name: 'Classic B&W',
    category: 'blackwhite',
    description: 'Balanced timeless monochrome with natural contrast and smooth tonality',
    config: { grayscale: 100, saturation: -100, contrast: 12, brightness: 2 },
  },
  {
    id: 'bw_hicon',
    name: 'High Contrast',
    category: 'blackwhite',
    description: 'Punchy graphic black and white with deep shadows and bright whites',
    config: { grayscale: 100, saturation: -100, contrast: 55, brightness: -5 },
  },
  {
    id: 'bw_soft',
    name: 'Soft Monochrome',
    category: 'blackwhite',
    description: 'Gentle matte gray scale with lifted shadows for an airy portrait feel',
    config: { grayscale: 100, saturation: -100, contrast: -12, brightness: 12, fade: 20 },
  },
  {
    id: 'film_noir',
    name: 'Film Noir',
    category: 'blackwhite',
    description: 'Dramatic chiaroscuro shadows with heavy vignette and silver highlights',
    config: { grayscale: 100, saturation: -100, contrast: 62, brightness: -16, vignette: 52 },
  },
  {
    id: 'matte_silver',
    name: 'Matte Silver',
    category: 'blackwhite',
    description: 'Archival platinum print finish with smooth silver gradients and matte blacks',
    config: { grayscale: 100, saturation: -100, contrast: 5, brightness: 6, fade: 25, grain: 15 },
  },
  // Template aliases
  { id: 'bw', name: 'B&W', category: 'blackwhite', config: { grayscale: 100, saturation: -100, contrast: 12, brightness: 2 } },
  { id: 'bnw', name: 'B&W Studio', category: 'blackwhite', config: { grayscale: 100, saturation: -100, contrast: 15, brightness: 2 } },

  // ─── Cinematic ────────────────────────────────────────────────────────────
  {
    id: 'teal_orange',
    name: 'Teal & Orange',
    category: 'cinematic',
    badge: 'CINEMATIC',
    description: 'Blockbuster movie color grade with warm golden skin and cool teal tones',
    config: { temperature: 16, tint: -14, saturation: 16, contrast: 20, highlights: 8, shadows: -8 },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    category: 'cinematic',
    badge: 'SUNLIT',
    description: 'Sun-drenched late-afternoon bronze glow with rich amber radiance',
    config: { temperature: 42, saturation: 22, contrast: 12, brightness: 6, highlights: -6, sepia: 12 },
  },
  {
    id: 'moody_noir',
    name: 'Moody Night',
    category: 'cinematic',
    description: 'Deep cinematic shadows, muted colors, and atmospheric midnight drama',
    config: { contrast: 32, brightness: -16, saturation: -18, temperature: -12, vignette: 42 },
  },
  {
    id: 'wes_pastel',
    name: 'Wes Pastel',
    category: 'cinematic',
    description: 'Whimsical storybook pastel yellow-pink wash with balanced symmetry',
    config: { brightness: 12, contrast: -6, saturation: 18, temperature: 20, tint: 14, fade: 16 },
  },
  {
    id: 'neo_tokyo',
    name: 'Neo Tokyo',
    category: 'cinematic',
    description: 'Cyberpunk night atmosphere with deep contrast and indigo-violet shadows',
    config: { contrast: 26, saturation: 22, temperature: -28, tint: 18, brightness: -8, vignette: 30 },
  },
  {
    id: 'emerald_cinema',
    name: 'Emerald Film',
    category: 'cinematic',
    description: 'Deep forest-green shadow tones with muted highlights and indie film grade',
    config: { temperature: -10, tint: -22, contrast: 18, saturation: -8, shadows: -10, vignette: 28 },
  },
  // Legacy cinematic aliases
  { id: 'cinematic', name: 'Cinematic Movie', category: 'cinematic', config: { contrast: 20, saturation: -10, temperature: -5, vignette: 25 } },
  { id: 'moody', name: 'Moody Shadows', category: 'cinematic', config: { contrast: 30, brightness: -15, saturation: -20, temperature: -10, shadows: -10, vignette: 40 } },
  { id: 'dark', name: 'Dark Contrast', category: 'cinematic', config: { brightness: -20, contrast: 25, saturation: -10, vignette: 50 } },

  // ─── Natural & Clean ──────────────────────────────────────────────────────
  {
    id: 'original',
    name: 'Original (Raw)',
    category: 'natural',
    description: 'Direct unadjusted camera capture',
    config: {},
  },
  {
    id: 'apple_true_tone',
    name: 'Apple True Tone',
    category: 'natural',
    badge: 'TRUE TONE',
    description: 'iPhone portrait tuning that removes sensor blue tint for crisp healthy skin',
    config: { brightness: 3, contrast: 8, saturation: 14, temperature: 10, sepia: 6 },
  },
  {
    id: 'clean_bright',
    name: 'Clean Bright',
    category: 'natural',
    description: 'High-key clean portrait with crisp clarity and pure whites',
    config: { brightness: 16, contrast: 8, saturation: 6, temperature: 2 },
  },
  {
    id: 'studio_crisp',
    name: 'Studio Crisp',
    category: 'natural',
    description: 'High dynamic range with enhanced clarity and punchy clean contrast',
    config: { brightness: 3, contrast: 18, saturation: 10, highlights: 6, shadows: -4 },
  },
  {
    id: 'soft_sunlight',
    name: 'Soft Sunlight',
    category: 'natural',
    description: 'Gentle morning daylight radiance with warm natural tones',
    config: { brightness: 8, contrast: 4, saturation: 10, temperature: 20, highlights: 6 },
  },
  {
    id: 'cool_breeze',
    name: 'Cool Breeze',
    category: 'natural',
    description: 'Fresh crisp cool tones that neutralize indoor redness',
    config: { brightness: 6, contrast: 10, saturation: 4, temperature: -24 },
  },
  // Legacy natural aliases
  { id: 'bright', name: 'Bright Boost', category: 'natural', config: { brightness: 15, contrast: 5, saturation: 10 } },
  { id: 'warm', name: 'Warm Daylight', category: 'natural', config: { temperature: 30, saturation: 5, brightness: 5 } },
  { id: 'cool', name: 'Cool Tone', category: 'natural', config: { temperature: -30, saturation: 5 } },
  { id: 'clean', name: 'Clean Neutral', category: 'natural', config: { brightness: 8, contrast: 12, saturation: -5 } },

  // ─── Fun & Creative Tones ─────────────────────────────────────────────────
  {
    id: 'sakura_pink',
    name: 'Sakura Blush',
    category: 'fun',
    badge: 'CUTE',
    description: 'Delicate pastel pink cherry blossom glow with soft romantic tones',
    config: { brightness: 12, contrast: 2, saturation: 16, temperature: 14, tint: 32, fade: 12 },
  },
  {
    id: 'lavender_haze',
    name: 'Lavender Haze',
    category: 'fun',
    description: 'Dreamy soft violet-magenta highlights and cool lavender shadows',
    config: { brightness: 8, contrast: 10, saturation: 18, temperature: -16, tint: 35, fade: 10 },
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    category: 'fun',
    badge: 'VIVID',
    description: 'Ultra-saturated pop-art neon vibrancy with punchy contrast',
    config: { saturation: 85, contrast: 32, brightness: -8 },
  },
  {
    id: 'sunset_glow',
    name: 'Sunset Flare',
    category: 'fun',
    description: 'Deep warm crimson-orange dusk glow with golden accents',
    config: { temperature: 48, saturation: 28, contrast: 14, highlights: -12, tint: 12 },
  },
  {
    id: 'dreamy_glow',
    name: 'Dreamy Mist',
    category: 'fun',
    description: 'Ethereal romantic haze with soft focus and bright highlights',
    config: { brightness: 18, saturation: -14, fade: 32, temperature: 10, blur: 0.4 },
  },
  {
    id: 'electric_blue',
    name: 'Electric Blue',
    category: 'fun',
    description: 'Deep cool cyan-blue mood with vivid contrast',
    config: { temperature: -52, saturation: 24, brightness: 4, contrast: 12 },
  },
  // Legacy fun aliases
  { id: 'dreamy', name: 'Dreamy Soft', category: 'fun', config: { brightness: 15, saturation: -20, fade: 30, temperature: 10 } },
  { id: 'pink', name: 'Pastel Pink', category: 'fun', config: { temperature: 20, tint: 20, saturation: 10, brightness: 10 } },
  { id: 'blue', name: 'Cyan Blue', category: 'fun', config: { temperature: -40, saturation: 15, brightness: 5 } },
  { id: 'purple', name: 'Purple Dream', category: 'fun', config: { temperature: -20, tint: 25, saturation: 10 } },
  { id: 'sunset', name: 'Sunset Warmth', category: 'fun', config: { temperature: 40, saturation: 20, contrast: 10, highlights: -10 } },
  { id: 'neon', name: 'Neon Glow', category: 'fun', config: { saturation: 80, contrast: 30, brightness: -10 } },
]

export const filterEngine = new FilterEngine()
