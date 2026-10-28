import type { Template } from '@/types'
import { CUSTOM_TEMPLATES } from '@/templates'

// ─── Template Registry ────────────────────────────────────────────────────────
// All templates are data-driven JSON objects.
// Adding a new template requires NO code changes — just add it to this array.

// Helper to generate photo slots for a vertical strip
function makeVerticalSlots(
  photoCount: number,
  canvasWidth: number,
  canvasHeight: number,
  margin: number,
  spacing: number,
  shape: 'rectangle' | 'rounded' | 'polaroid' | 'film' = 'rectangle',
  cornerRadius = 0,
  bottomMargin = margin
) {
  const usableHeight = canvasHeight - margin - bottomMargin - spacing * (photoCount - 1)
  const slotHeight = Math.floor(usableHeight / photoCount)
  const slotWidth = canvasWidth - margin * 2

  return Array.from({ length: photoCount }, (_, i) => ({
    id: `slot-${i}`,
    x: margin,
    y: margin + i * (slotHeight + spacing),
    width: slotWidth,
    height: slotHeight,
    shape,
    cornerRadius,
  }))
}

// ─── CLASSIC CHERRY RED TEMPLATES (DEFAULT) ──────────────────────────────────
export const classicCherry4: Template = {
  id: 'classic-cherry-4',
  name: 'Matte Cherry Red (4-Photo)',
  category: 'classic',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4200 },
  photoSlots: makeVerticalSlots(4, 1200, 4200, 54, 28, 'rectangle', 0, 440),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#6D0626' },
  border: { type: 'none' },
  spacing: { photoSpacing: 28, outerMargin: 54, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['cherry', 'matte', 'minimal', 'default', '4-photo'] },
}

export const classicCherry3: Template = {
  id: 'classic-cherry-3',
  name: 'Matte Cherry Red (3-Photo)',
  category: 'classic',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4200 },
  photoSlots: makeVerticalSlots(3, 1200, 4200, 54, 32, 'rectangle', 0, 500),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#6D0626' },
  border: { type: 'none' },
  spacing: { photoSpacing: 32, outerMargin: 54, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['cherry', 'matte', 'minimal', 'default', '3-photo'] },
}

export const classicCherry2: Template = {
  id: 'classic-cherry-2',
  name: 'Matte Cherry Red (2-Photo)',
  category: 'classic',
  supportedPhotoCounts: [2],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 2400 },
  photoSlots: makeVerticalSlots(2, 1200, 2400, 54, 32, 'rectangle', 0, 360),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#6D0626' },
  border: { type: 'none' },
  spacing: { photoSpacing: 32, outerMargin: 54, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['cherry', 'matte', 'minimal', 'default', '2-photo'] },
}

export const classicCherry1: Template = {
  id: 'classic-cherry-1',
  name: 'Matte Cherry Red (1-Photo)',
  category: 'classic',
  supportedPhotoCounts: [1],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 1800 },
  photoSlots: makeVerticalSlots(1, 1200, 1800, 54, 0, 'rectangle', 0, 320),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#6D0626' },
  border: { type: 'none' },
  spacing: { photoSpacing: 0, outerMargin: 54, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['cherry', 'matte', 'minimal', 'default', '1-photo'] },
}

// Helper for grid (2-column) layout
function makeGridSlots(
  photoCount: number,
  canvasWidth: number,
  canvasHeight: number,
  margin: number,
  spacing: number,
  cornerRadius = 0
) {
  const cols = 2
  const rows = Math.ceil(photoCount / cols)
  const slotWidth = (canvasWidth - margin * 2 - spacing * (cols - 1)) / cols
  const slotHeight = (canvasHeight - margin * 2 - spacing * (rows - 1)) / rows

  return Array.from({ length: photoCount }, (_, i) => ({
    id: `slot-${i}`,
    x: margin + (i % cols) * (slotWidth + spacing),
    y: margin + Math.floor(i / cols) * (slotHeight + spacing),
    width: slotWidth,
    height: slotHeight,
    shape: 'rounded' as const,
    cornerRadius,
  }))
}

// ─── CLASSIC TEMPLATES ────────────────────────────────────────────────────────

const classicWhite3: Template = {
  id: 'classic-white-3',
  name: 'Classic White',
  category: 'classic',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 48, 24),
  textElements: [
    {
      id: 'date-text',
      x: 400,
      y: 3480,
      width: 400,
      defaultText: new Date().toLocaleDateString(),
      fontSize: 36,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#999999',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#ffffff' },
  border: { type: 'none' },
  spacing: { photoSpacing: 24, outerMargin: 48, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['classic', 'clean', 'minimal'] },
}

const classicWhite4: Template = {
  ...classicWhite3,
  id: 'classic-white-4',
  name: 'Classic White',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(4, 1200, 3600, 48, 24),
  textElements: [
    {
      id: 'date-text',
      x: 400,
      y: 3480,
      width: 400,
      defaultText: new Date().toLocaleDateString(),
      fontSize: 36,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#999999',
      align: 'center',
      isEditable: true,
    },
  ],
}

const classicBlack4: Template = {
  id: 'classic-black-4',
  name: 'Classic Black',
  category: 'classic',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(4, 1200, 3600, 48, 24),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#6D0626' },
  border: { type: 'none' },
  spacing: { photoSpacing: 24, outerMargin: 48, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['classic', 'cherry', 'matte'] },
}

const minimalStrip3: Template = {
  id: 'minimal-3',
  name: 'Minimal',
  category: 'classic',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3000 },
  photoSlots: makeVerticalSlots(3, 1200, 3000, 0, 4),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#f8f8f8' },
  border: { type: 'none' },
  spacing: { photoSpacing: 4, outerMargin: 0, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['minimal', 'borderless'] },
}

const minimalStrip4: Template = {
  ...minimalStrip3,
  id: 'minimal-4',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4000 },
  photoSlots: makeVerticalSlots(4, 1200, 4000, 0, 4),
}

const polaroidStack4: Template = {
  id: 'polaroid-4',
  name: 'Polaroid Stack',
  category: 'classic',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4800 },
  photoSlots: makeVerticalSlots(4, 1200, 4800, 80, 80, 'polaroid', 0),
  textElements: [
    {
      id: 'caption',
      x: 0,
      y: 4660,
      width: 1200,
      defaultText: 'Our Moment',
      fontSize: 52,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#555555',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#f5f0e8' },
  border: { type: 'thin', color: '#e0d8cc', width: 2 },
  spacing: { photoSpacing: 80, outerMargin: 80, padding: 20 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['polaroid', 'retro', 'classic'] },
}

// ─── MODERN TEMPLATES ─────────────────────────────────────────────────────────

const modernGrid4: Template = {
  id: 'modern-grid-4',
  name: 'Modern Grid',
  category: 'modern',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 1400 },
  photoSlots: makeGridSlots(4, 1200, 1400, 40, 20, 12),
  textElements: [],
  decorationElements: [],
  background: { type: 'solid', color: '#1a1a2e' },
  border: { type: 'none' },
  spacing: { photoSpacing: 20, outerMargin: 40, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['modern', 'grid', 'dark'] },
}

const modernRounded4: Template = {
  id: 'modern-rounded-4',
  name: 'Rounded Cards',
  category: 'modern',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 80, 60, 'rounded', 24),
  textElements: [
    {
      id: 'brand',
      x: 0,
      y: 4280,
      width: 1200,
      defaultText: 'STUDIO',
      fontSize: 56,
      fontFamily: 'Outfit',
      fontWeight: '800',
      color: '#6c63ff',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#0f0f1a' }, { offset: 1, color: '#1a1a3e' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 80, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['modern', 'rounded', 'purple'] },
}

const luxuryGold4: Template = {
  id: 'luxury-gold-4',
  name: 'Luxury Gold',
  category: 'modern',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 50),
  textElements: [
    {
      id: 'luxury-title',
      x: 0,
      y: 4270,
      width: 1200,
      defaultText: '✦ MEMORIES ✦',
      fontSize: 44,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#d4af37',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#0d0d0d' },
  border: { type: 'thick', color: '#d4af37', width: 6 },
  spacing: { photoSpacing: 50, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['luxury', 'gold', 'elegant', 'dark'] },
}

const editorial3: Template = {
  id: 'editorial-3',
  name: 'Editorial',
  category: 'modern',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3400 },
  photoSlots: makeVerticalSlots(3, 1200, 3400, 60, 60),
  textElements: [
    {
      id: 'issue-text',
      x: 60,
      y: 3270,
      width: 500,
      defaultText: 'VOL. 01',
      fontSize: 32,
      fontFamily: 'Inter',
      fontWeight: '300',
      color: '#aaaaaa',
      align: 'left',
      isEditable: true,
    },
    {
      id: 'date-right',
      x: 640,
      y: 3270,
      width: 500,
      defaultText: new Date().getFullYear().toString(),
      fontSize: 32,
      fontFamily: 'Inter',
      fontWeight: '300',
      color: '#aaaaaa',
      align: 'right',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#f2f2f2' },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 60, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['editorial', 'magazine', 'clean'] },
}

// ─── FUN TEMPLATES ────────────────────────────────────────────────────────────

const partyConfetti4: Template = {
  id: 'party-confetti-4',
  name: 'Party Confetti',
  category: 'fun',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 60, 'rounded', 16),
  textElements: [
    {
      id: 'party-title',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: '🎉 PARTY TIME! 🎉',
      fontSize: 52,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#ff6b6b',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#1a0533' }, { offset: 0.5, color: '#0d1b4b' }, { offset: 1, color: '#001a3d' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['party', 'fun', 'celebration'] },
}

const birthdayTemplate4: Template = {
  id: 'birthday-4',
  name: 'Birthday',
  category: 'fun',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4500 },
  photoSlots: makeVerticalSlots(4, 1200, 4500, 100, 60, 'rounded', 20),
  textElements: [
    {
      id: 'birthday-text',
      x: 0,
      y: 4330,
      width: 1200,
      defaultText: '🎂 HAPPY BIRTHDAY! 🎂',
      fontSize: 48,
      fontFamily: 'Outfit',
      fontWeight: '800',
      color: '#ffffff',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#ff9a9e' }, { offset: 1, color: '#a18cd1' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['birthday', 'fun', 'celebration'] },
}

const valentineTemplate4: Template = {
  id: 'valentine-4',
  name: 'Valentine',
  category: 'fun',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 50, 'rounded', 16),
  textElements: [
    {
      id: 'love-text',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: '❤ With Love ❤',
      fontSize: 52,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#ff4466',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#fff0f3' }, { offset: 1, color: '#ffe4ea' }] } },
  border: { type: 'thin', color: '#ffb3c1', width: 3 },
  spacing: { photoSpacing: 50, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['valentine', 'love', 'romantic'] },
}

const weddingTemplate4: Template = {
  id: 'wedding-4',
  name: 'Wedding',
  category: 'fun',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4600 },
  photoSlots: makeVerticalSlots(4, 1200, 4600, 100, 60),
  textElements: [
    {
      id: 'names',
      x: 0,
      y: 40,
      width: 1200,
      defaultText: 'Sarah & John',
      fontSize: 60,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#c9a96e',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'wedding-date',
      x: 0,
      y: 4450,
      width: 1200,
      defaultText: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      fontSize: 36,
      fontFamily: 'Inter',
      fontWeight: '300',
      color: '#c9a96e',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#faf8f4' },
  border: { type: 'double', color: '#c9a96e', width: 4 },
  spacing: { photoSpacing: 60, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['wedding', 'elegant', 'gold'] },
}

const friendshipTemplate3: Template = {
  id: 'friendship-3',
  name: 'Friendship',
  category: 'fun',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3400 },
  photoSlots: makeVerticalSlots(3, 1200, 3400, 90, 60, 'rounded', 30),
  textElements: [
    {
      id: 'friends-text',
      x: 0,
      y: 3260,
      width: 1200,
      defaultText: '👯 Best Friends 👯',
      fontSize: 52,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#ffffff',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#4158d0' }, { offset: 0.46, color: '#c850c0' }, { offset: 1, color: '#ffcc70' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 90, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['friendship', 'fun', 'colorful'] },
}

// ─── VINTAGE TEMPLATES ────────────────────────────────────────────────────────

const retroFilm4: Template = {
  id: 'retro-film-4',
  name: 'Retro Film',
  category: 'vintage',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 80, 60, 'film'),
  textElements: [
    {
      id: 'film-code',
      x: 60,
      y: 4300,
      width: 500,
      defaultText: 'KODAK 400TX',
      fontSize: 28,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#8b7355',
      align: 'left',
      isEditable: true,
    },
    {
      id: 'frame-count',
      x: 640,
      y: 4300,
      width: 500,
      defaultText: '36 EXP',
      fontSize: 28,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#8b7355',
      align: 'right',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#1a1208' },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 80, padding: 0 },
  defaultFilter: 'retro',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['retro', 'film', 'vintage', 'dark'] },
}

const kodakMemories4: Template = {
  id: 'kodak-memories-4',
  name: 'Kodak Memories',
  category: 'vintage',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4600 },
  photoSlots: makeVerticalSlots(4, 1200, 4600, 100, 40),
  textElements: [
    {
      id: 'kodak-header',
      x: 0,
      y: 0,
      width: 1200,
      defaultText: 'KODAK',
      fontSize: 60,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#ffffff',
      align: 'center',
      isEditable: false,
    },
    {
      id: 'memories-footer',
      x: 0,
      y: 4480,
      width: 1200,
      defaultText: 'Gold 200',
      fontSize: 36,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#ffffff',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#f5c518' },
  border: { type: 'none' },
  spacing: { photoSpacing: 40, outerMargin: 100, padding: 0 },
  defaultFilter: 'kodak',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['kodak', 'yellow', 'vintage', 'film'] },
}

const nineties4: Template = {
  id: 'nineties-4',
  name: '90s Aesthetic',
  category: 'vintage',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 90, 60, 'rounded', 0),
  textElements: [
    {
      id: 'nineties-title',
      x: 0,
      y: 4270,
      width: 1200,
      defaultText: '• • • MEMORIES • • •',
      fontSize: 40,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#00ff88',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#0d0d2b' }, { offset: 1, color: '#1a0533' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 60, outerMargin: 90, padding: 0 },
  defaultFilter: 'nineties',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['90s', 'neon', 'retro', 'dark'] },
}

const vintagePostcard3: Template = {
  id: 'vintage-postcard-3',
  name: 'Vintage Postcard',
  category: 'vintage',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3200 },
  photoSlots: makeVerticalSlots(3, 1200, 3200, 120, 60),
  textElements: [
    {
      id: 'postcard-text',
      x: 0,
      y: 3050,
      width: 1200,
      defaultText: 'GREETINGS FROM THE PHOTO BOOTH',
      fontSize: 32,
      fontFamily: 'Inter',
      fontWeight: '300',
      color: '#8b6914',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#f4e8d0' },
  border: { type: 'decorative', color: '#8b6914', width: 8 },
  spacing: { photoSpacing: 60, outerMargin: 120, padding: 0 },
  defaultFilter: 'sepia',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['postcard', 'vintage', 'sepia'] },
}

// ─── SEASONAL TEMPLATES ───────────────────────────────────────────────────────

const christmasTemplate4: Template = {
  id: 'christmas-4',
  name: 'Christmas',
  category: 'seasonal',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 50, 'rounded', 12),
  textElements: [
    {
      id: 'xmas-title',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: '🎄 Merry Christmas 🎄',
      fontSize: 48,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#ffd700',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#1a4a1a' }, { offset: 1, color: '#0d2e0d' }] } },
  border: { type: 'thick', color: '#cc0000', width: 8 },
  spacing: { photoSpacing: 50, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['christmas', 'festive', 'seasonal'] },
}

const halloweenTemplate4: Template = {
  id: 'halloween-4',
  name: 'Halloween',
  category: 'seasonal',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 90, 50, 'rounded', 8),
  textElements: [
    {
      id: 'halloween-title',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: '🎃 BOO! 🕷',
      fontSize: 64,
      fontFamily: 'Outfit',
      fontWeight: '700',
      color: '#ff6600',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#0d0007' }, { offset: 1, color: '#1a0a00' }] } },
  border: { type: 'none' },
  spacing: { photoSpacing: 50, outerMargin: 90, padding: 0 },
  defaultFilter: 'dark',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['halloween', 'spooky', 'seasonal'] },
}

const newYearTemplate4: Template = {
  id: 'new-year-4',
  name: 'New Year',
  category: 'seasonal',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 60, 'rounded', 16),
  textElements: [
    {
      id: 'ny-title',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: `✨ Happy New Year ${new Date().getFullYear() + 1} ✨`,
      fontSize: 44,
      fontFamily: 'Outfit',
      fontWeight: '600',
      color: '#ffd700',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#0d0d1a' }, { offset: 1, color: '#1a1a0d' }] } },
  border: { type: 'thin', color: '#ffd700', width: 3 },
  spacing: { photoSpacing: 60, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['new year', 'celebration', 'gold'] },
}

const weddingElégant4: Template = {
  id: 'wedding-elegant-4',
  name: 'Wedding Elegant',
  category: 'seasonal',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4800 },
  photoSlots: makeVerticalSlots(4, 1200, 4800, 120, 60),
  textElements: [
    {
      id: 'we-header',
      x: 0,
      y: 20,
      width: 1200,
      defaultText: '— Wedding Day —',
      fontSize: 48,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#9b8260',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'we-date',
      x: 0,
      y: 4680,
      width: 1200,
      defaultText: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      fontSize: 34,
      fontFamily: 'Inter',
      fontWeight: '300',
      color: '#9b8260',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#faf7f2' },
  border: { type: 'double', color: '#c9a96e', width: 3 },
  spacing: { photoSpacing: 60, outerMargin: 120, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['wedding', 'elegant', 'ivory', 'gold'] },
}

const diwaliTemplate4: Template = {
  id: 'diwali-4',
  name: 'Diwali',
  category: 'seasonal',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 50, 'rounded', 12),
  textElements: [
    {
      id: 'diwali-title',
      x: 0,
      y: 4265,
      width: 1200,
      defaultText: '✨ दीपावली की शुभकामनाएं ✨',
      fontSize: 40,
      fontFamily: 'Outfit',
      fontWeight: '600',
      color: '#ffd700',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#1a0a00' }, { offset: 1, color: '#2d1700' }] } },
  border: { type: 'thick', color: '#ffa500', width: 6 },
  spacing: { photoSpacing: 50, outerMargin: 100, padding: 0 },
  metadata: { author: 'Photobooth', version: '1.0', tags: ['diwali', 'indian', 'festival', 'gold'] },
}

// ─── 3-photo variants for common templates ────────────────────────────────────

const classicBlack3: Template = {
  ...classicBlack4,
  id: 'classic-black-3',
  supportedPhotoCounts: [3],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 48, 24),
  textElements: [],
}

const modernRounded3: Template = {
  ...modernRounded4,
  id: 'modern-rounded-3',
  supportedPhotoCounts: [3],
  canvas: { width: 1200, height: 3400 },
  photoSlots: makeVerticalSlots(3, 1200, 3400, 80, 60, 'rounded', 24),
  textElements: [{ ...modernRounded4.textElements![0], y: 3270 }],
}

const friendshipTemplate4: Template = {
  ...friendshipTemplate3,
  id: 'friendship-4',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 90, 60, 'rounded', 30),
  textElements: [{ ...friendshipTemplate3.textElements![0], y: 4265 }],
}

const valentineTemplate3: Template = {
  ...valentineTemplate4,
  id: 'valentine-3',
  supportedPhotoCounts: [3],
  canvas: { width: 1200, height: 3400 },
  photoSlots: makeVerticalSlots(3, 1200, 3400, 100, 50, 'rounded', 16),
  textElements: [{ ...valentineTemplate4.textElements![0], y: 3265 }],
}

// ─── 1. Vintage 35mm Sprocket Film (User Request Image 1) ───────────────────
const vintage35mm3: Template = {
  id: 'vintage-35mm-3',
  name: 'Vintage 35mm',
  category: 'vintage',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 110, 48, 'film', 4),
  textElements: [
    {
      id: 'film-stock-header',
      x: 0,
      y: 80,
      width: 1200,
      defaultText: '35MM KODAK 400TX',
      fontSize: 32,
      fontFamily: 'DM Mono',
      fontWeight: '700',
      color: '#d4b26f',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'film-frame-footer',
      x: 0,
      y: 3480,
      width: 1200,
      defaultText: '▶ 24A · SAFETY FILM',
      fontSize: 28,
      fontFamily: 'DM Mono',
      fontWeight: '500',
      color: '#d4b26f',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#0d0d0d' },
  border: { type: 'thin', color: '#262626', width: 2 },
  spacing: { photoSpacing: 48, outerMargin: 110, padding: 0 },
  defaultFilter: 'warm',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['35mm', 'film', 'sprocket', 'vintage', 'dark'] },
}

const vintage35mm4: Template = {
  ...vintage35mm3,
  id: 'vintage-35mm-4',
  name: 'Vintage 35mm',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 110, 40, 'film', 4),
  textElements: [
    { ...vintage35mm3.textElements![0], y: 80 },
    { ...vintage35mm3.textElements![1], y: 4320 },
  ],
}

// ─── 2. Pixel Hearts / I ♥ US (User Request Image 2) ────────────────────────
const pixelRomance3: Template = {
  id: 'pixel-romance-3',
  name: 'Pixel Hearts',
  category: 'fun',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 100, 48, 'rounded', 8),
  textElements: [
    {
      id: 'pixel-brand-top',
      x: 0,
      y: 60,
      width: 1200,
      defaultText: 'snapobox',
      fontSize: 26,
      fontFamily: 'DM Mono',
      fontWeight: '700',
      color: '#c9182b',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'pixel-title-top',
      x: 0,
      y: 115,
      width: 1200,
      defaultText: 'I  ♥  US',
      fontSize: 52,
      fontFamily: 'Outfit',
      fontWeight: '900',
      color: '#c9182b',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'pixel-quote-bottom',
      x: 0,
      y: 3430,
      width: 1200,
      defaultText: 'in the mood for love',
      fontSize: 32,
      fontFamily: 'Inter',
      fontWeight: '600',
      color: '#c9182b',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'pixel-hearts-bottom',
      x: 0,
      y: 3500,
      width: 1200,
      defaultText: '♥  ♥  ♥',
      fontSize: 34,
      fontFamily: 'Inter',
      fontWeight: '900',
      color: '#c9182b',
      align: 'center',
      isEditable: true,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#FAF7F2' },
  border: { type: 'thin', color: '#F0ECE1', width: 2 },
  spacing: { photoSpacing: 48, outerMargin: 100, padding: 0 },
  defaultFilter: 'original',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['pixel', 'hearts', 'retro', 'love', 'fun'] },
}

const pixelRomance4: Template = {
  ...pixelRomance3,
  id: 'pixel-romance-4',
  name: 'Pixel Hearts',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 40, 'rounded', 8),
  textElements: [
    { ...pixelRomance3.textElements![0], y: 60 },
    { ...pixelRomance3.textElements![1], y: 115 },
    { ...pixelRomance3.textElements![2], y: 4230 },
    { ...pixelRomance3.textElements![3], y: 4300 },
  ],
}

// ─── 3. Vintage Cinema Ticket / Admit One (User Request Images 3 & 4) ────────
const cinemaTicket3: Template = {
  id: 'cinema-ticket-3',
  name: 'Cinema Ticket',
  category: 'vintage',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 100, 40, 'rounded', 6),
  textElements: [
    {
      id: 'admit-one-header',
      x: 0,
      y: 80,
      width: 1200,
      defaultText: 'ADMIT ONE  ♥',
      fontSize: 46,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '800',
      color: '#1a1a1a',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'cinema-ticket-title',
      x: 0,
      y: 3340,
      width: 1200,
      defaultText: 'CINEMA TICKET',
      fontSize: 42,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '800',
      color: '#1a1a1a',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'cinema-ticket-sub',
      x: 0,
      y: 3390,
      width: 1200,
      defaultText: '★ ★ ★  Admit One  ★ ★ ★',
      fontSize: 26,
      fontFamily: 'Inter',
      fontWeight: '600',
      color: '#666666',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'cinema-ticket-meta',
      x: 0,
      y: 3450,
      width: 1200,
      defaultText: 'ROW 38 · SEAT A45 · ADMIT ONE',
      fontSize: 28,
      fontFamily: 'DM Mono',
      fontWeight: '700',
      color: '#222222',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'cinema-barcode',
      x: 0,
      y: 3515,
      width: 1200,
      defaultText: '||| | ||||| || |||||| | |||',
      fontSize: 36,
      fontFamily: 'DM Mono',
      fontWeight: '400',
      color: '#222222',
      align: 'center',
      isEditable: false,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#8A1C24' },
  border: { type: 'none' },
  spacing: { photoSpacing: 40, outerMargin: 100, padding: 0 },
  defaultFilter: 'warm',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['cinema', 'ticket', 'admit-one', 'vintage', 'movie'] },
}

const cinemaTicket4: Template = {
  ...cinemaTicket3,
  id: 'cinema-ticket-4',
  name: 'Cinema Ticket',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 100, 36, 'rounded', 6),
  textElements: [
    { ...cinemaTicket3.textElements![0], y: 80 },
    { ...cinemaTicket3.textElements![1], y: 4140 },
    { ...cinemaTicket3.textElements![2], y: 4190 },
    { ...cinemaTicket3.textElements![3], y: 4250 },
    { ...cinemaTicket3.textElements![4], y: 4315 },
  ],
}

// ─── 4. Catch Yours / Scrapbook Ticket (User Request Image 5) ───────────────
const catchYours3: Template = {
  id: 'catch-yours-3',
  name: 'Catch Yours',
  category: 'vintage',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: { width: 1200, height: 3600 },
  photoSlots: makeVerticalSlots(3, 1200, 3600, 96, 44, 'polaroid', 2),
  textElements: [
    {
      id: 'catch-yours-header',
      x: 0,
      y: 90,
      width: 1200,
      defaultText: '♥ Catch Yours ♥',
      fontSize: 54,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '800',
      color: '#8A252C',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'scrapbook-note',
      x: 0,
      y: 3340,
      width: 1200,
      defaultText: 'Chilling out · Photo Place',
      fontSize: 30,
      fontFamily: 'Inter',
      fontWeight: '500',
      color: '#444444',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'photo-ticket-stub',
      x: 0,
      y: 3440,
      width: 1200,
      defaultText: '🎟 PHOTO TICKET · DAY PASS 🎟',
      fontSize: 36,
      fontFamily: 'DM Mono',
      fontWeight: '700',
      color: '#8A252C',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'ticket-number',
      x: 0,
      y: 3500,
      width: 1200,
      defaultText: 'No. 001064 · VALID FOR ADMISSION',
      fontSize: 24,
      fontFamily: 'DM Mono',
      fontWeight: '500',
      color: '#777777',
      align: 'center',
      isEditable: false,
    },
  ],
  decorationElements: [],
  background: { type: 'solid', color: '#EBE4D8' },
  border: { type: 'thick', color: '#8A252C', width: 4 },
  spacing: { photoSpacing: 44, outerMargin: 96, padding: 0 },
  defaultFilter: 'vintage',
  metadata: { author: 'Photobooth', version: '1.0', tags: ['catch-yours', 'scrapbook', 'polaroid', 'ticket', 'love'] },
}

const catchYours4: Template = {
  ...catchYours3,
  id: 'catch-yours-4',
  name: 'Catch Yours',
  supportedPhotoCounts: [4],
  canvas: { width: 1200, height: 4400 },
  photoSlots: makeVerticalSlots(4, 1200, 4400, 96, 36, 'polaroid', 2),
  textElements: [
    { ...catchYours3.textElements![0], y: 90 },
    { ...catchYours3.textElements![1], y: 4140 },
    { ...catchYours3.textElements![2], y: 4240 },
    { ...catchYours3.textElements![3], y: 4300 },
  ],
}

// ─── 1-photo variants ──────────────────────────────────────────────────────────
const classicWhite1: Template = {
  ...classicWhite3,
  id: 'classic-white-1',
  name: 'Classic White (1-Shot)',
  supportedPhotoCounts: [1],
  canvas: { width: 1200, height: 1800 },
  photoSlots: makeVerticalSlots(1, 1200, 1800, 60, 0),
  textElements: [
    {
      id: 'date-text-1',
      x: 300,
      y: 1720,
      width: 600,
      defaultText: new Date().toLocaleDateString(),
      fontSize: 34,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#999999',
      align: 'center',
      isEditable: true,
    },
  ],
}

const classicBlack1: Template = {
  ...classicBlack4,
  id: 'classic-black-1',
  name: 'Classic Black (1-Shot)',
  supportedPhotoCounts: [1],
  canvas: { width: 1200, height: 1800 },
  photoSlots: makeVerticalSlots(1, 1200, 1800, 60, 0),
  textElements: [],
}

const polaroid1: Template = {
  ...polaroidStack4,
  id: 'polaroid-1',
  name: 'Polaroid Single',
  supportedPhotoCounts: [1],
  canvas: { width: 1200, height: 1600 },
  photoSlots: makeVerticalSlots(1, 1200, 1600, 90, 0, 'polaroid', 0),
  textElements: [
    {
      id: 'polaroid-1-caption',
      x: 0,
      y: 1470,
      width: 1200,
      defaultText: 'Our Moment',
      fontSize: 48,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#555555',
      align: 'center',
      isEditable: true,
    },
  ],
}

const minimalStrip1: Template = {
  ...minimalStrip3,
  id: 'minimal-1',
  name: 'Minimal (1-Shot)',
  supportedPhotoCounts: [1],
  canvas: { width: 1200, height: 1600 },
  photoSlots: makeVerticalSlots(1, 1200, 1600, 0, 0),
}

const modernRounded1: Template = {
  ...modernRounded4,
  id: 'modern-rounded-1',
  name: 'Rounded Card (1-Shot)',
  supportedPhotoCounts: [1],
  canvas: { width: 1200, height: 1800 },
  photoSlots: makeVerticalSlots(1, 1200, 1800, 80, 0, 'rounded', 28),
  textElements: [
    {
      id: 'brand-1',
      x: 0,
      y: 1710,
      width: 1200,
      defaultText: 'STUDIO',
      fontSize: 44,
      fontFamily: 'Outfit',
      fontWeight: '800',
      color: '#6c63ff',
      align: 'center',
      isEditable: true,
    },
  ],
}

// ─── 2-photo variants ──────────────────────────────────────────────────────────
const classicWhite2: Template = {
  ...classicWhite3,
  id: 'classic-white-2',
  name: 'Classic White (2-Shot)',
  supportedPhotoCounts: [2],
  canvas: { width: 1200, height: 2400 },
  photoSlots: makeVerticalSlots(2, 1200, 2400, 50, 30),
  textElements: [
    {
      id: 'date-text-2',
      x: 300,
      y: 2310,
      width: 600,
      defaultText: new Date().toLocaleDateString(),
      fontSize: 34,
      fontFamily: 'Inter',
      fontWeight: '400',
      color: '#999999',
      align: 'center',
      isEditable: true,
    },
  ],
}

const classicBlack2: Template = {
  ...classicBlack4,
  id: 'classic-black-2',
  name: 'Classic Black (2-Shot)',
  supportedPhotoCounts: [2],
  canvas: { width: 1200, height: 2400 },
  photoSlots: makeVerticalSlots(2, 1200, 2400, 50, 30),
  textElements: [],
}

const polaroid2: Template = {
  ...polaroidStack4,
  id: 'polaroid-2',
  name: 'Polaroid Pair (2-Shot)',
  supportedPhotoCounts: [2],
  canvas: { width: 1200, height: 2700 },
  photoSlots: makeVerticalSlots(2, 1200, 2700, 80, 70, 'polaroid', 0),
  textElements: [
    {
      id: 'polaroid-2-caption',
      x: 0,
      y: 2560,
      width: 1200,
      defaultText: 'Double Trouble',
      fontSize: 48,
      fontFamily: 'Outfit',
      fontWeight: '300',
      color: '#555555',
      align: 'center',
      isEditable: true,
    },
  ],
}

const minimalStrip2: Template = {
  ...minimalStrip3,
  id: 'minimal-2',
  name: 'Minimal (2-Shot)',
  supportedPhotoCounts: [2],
  canvas: { width: 1200, height: 2400 },
  photoSlots: makeVerticalSlots(2, 1200, 2400, 0, 8),
}

const modernRounded2: Template = {
  ...modernRounded4,
  id: 'modern-rounded-2',
  name: 'Rounded Cards (2-Shot)',
  supportedPhotoCounts: [2],
  canvas: { width: 1200, height: 2500 },
  photoSlots: makeVerticalSlots(2, 1200, 2500, 80, 50, 'rounded', 24),
  textElements: [
    {
      id: 'brand-2',
      x: 0,
      y: 2410,
      width: 1200,
      defaultText: 'DUO EDITION',
      fontSize: 46,
      fontFamily: 'Outfit',
      fontWeight: '800',
      color: '#6c63ff',
      align: 'center',
      isEditable: true,
    },
  ],
}

// ─── Registry ──────────────────────────────────────────────────────────────────

const ALL_TEMPLATES: Template[] = [
  // Default Classic Matte Cherry Red Strips (Primary Default)
  classicCherry4,
  classicCherry3,
  classicCherry2,
  classicCherry1,

  // Custom User Templates from src/templates/
  ...CUSTOM_TEMPLATES,

  // 1-Photo Templates
  classicBlack1,
  classicWhite1,
  polaroid1,
  minimalStrip1,
  modernRounded1,

  // 2-Photo Templates
  classicBlack2,
  classicWhite2,
  polaroid2,
  minimalStrip2,
  modernRounded2,

  // User Requested New Featured Templates (3-Photo)
  vintage35mm3,
  pixelRomance3,
  cinemaTicket3,
  catchYours3,

  // User Requested New Featured Templates (4-Photo)
  vintage35mm4,
  pixelRomance4,
  cinemaTicket4,
  catchYours4,

  // Classic (3-photo)
  classicBlack3,
  classicWhite3,
  minimalStrip3,
  friendshipTemplate3,
  vintagePostcard3,
  valentineTemplate3,
  modernRounded3,
  
  // Classic (4-photo)
  classicBlack4,
  classicWhite4,
  minimalStrip4,
  polaroidStack4,
  
  // Modern
  modernGrid4,
  modernRounded4,
  luxuryGold4,
  editorial3,
  
  // Fun
  partyConfetti4,
  birthdayTemplate4,
  valentineTemplate4,
  weddingTemplate4,
  friendshipTemplate4,
  
  // Vintage
  retroFilm4,
  kodakMemories4,
  nineties4,
  
  // Seasonal
  christmasTemplate4,
  halloweenTemplate4,
  newYearTemplate4,
  weddingElégant4,
  diwaliTemplate4,
]

// All default superimposed texts removed per user specification: clean, unobstructed strips
export const TEMPLATES: Template[] = ALL_TEMPLATES.map(t => ({
  ...t,
  textElements: [],
}))

export function getTemplatesForPhotoCount(count: number): Template[] {
  return TEMPLATES.filter(t => t.supportedPhotoCounts.includes(count))
}

export function getDefaultTemplateForPhotoCount(count: number): Template {
  const found = TEMPLATES.find(t => t.id === `classic-cherry-${count}`)
  if (found) return found
  return TEMPLATES[0]
}

export function getTemplatesByCategory(category: Template['category']): Template[] {
  return TEMPLATES.filter(t => t.category === category)
}

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}

