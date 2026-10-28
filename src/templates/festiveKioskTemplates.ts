import type { Template } from '@/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEW FESTIVE & GLAM PHOTO STRIP TEMPLATES (LAYERED WITH TRANSPARENT CUTOUTS)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modeled from high-resolution studio photo strips:
 *  1. Leopard Hearts (3-Shot) - Chic matte black with glossy 3D leopard puffy hearts
 *  2. Wild Leopard Border (3-Shot) - Editorial safari grunge border with white photo frames
 *  3. Navratri Celebration (3-Shot) - Festive Dandiya sticks, gold glitter typography & paisley
 *  4. Warm Fairy Lights (2-Shot) - Cozy bokeh string lights for 2-portrait strips
 *  5. Royal Heritage Textile (3-Shot) - Traditional Indian embroidered architectural border & gold trim
 */

// ── 1. LEOPARD HEARTS (3-SHOT) ─────────────────────────────────────────────
export const leopardHearts3: Template = {
  id: 'custom-leopard-hearts-3',
  name: 'Leopard Hearts (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/leopard-hearts-3-overlay.png',
  background: {
    type: 'solid',
    color: '#080808',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 137,
    photoSpacing: 67,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 137,
      y: 209,
      width: 927,
      height: 1131,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 137,
      y: 1419,
      width: 927,
      height: 1131,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 137,
      y: 2630,
      width: 927,
      height: 1131,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'warm',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['leopard', 'hearts', 'chic', 'trendy', 'animal-print', '3-photo'],
    description: 'Chic matte black photobooth strip with 3 photo frames and glossy 3D leopard print puffy hearts.',
  },
}

// ── 2. WILD LEOPARD BORDER (3-SHOT) ────────────────────────────────────────
export const leopardBorder3: Template = {
  id: 'custom-leopard-border-3',
  name: 'Wild Leopard (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/leopard-border-3-overlay.png',
  background: {
    type: 'solid',
    color: '#050505',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 130,
    photoSpacing: 103,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 130,
      y: 181,
      width: 929,
      height: 1164,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 130,
      y: 1468,
      width: 929,
      height: 1135,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 130,
      y: 2724,
      width: 929,
      height: 1057,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'warm',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['leopard', 'safari', 'wild', 'grunge', 'border', '3-photo'],
    description: 'Bold editorial black strip with textured leopard-print torn borders and crisp white photo framing.',
  },
}

// ── 3. NAVRATRI CELEBRATION (3-SHOT) ───────────────────────────────────────
export const navratriGold3: Template = {
  id: 'custom-navratri-gold-3',
  name: 'Navratri Celebration (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/navratri-gold-3-overlay.png',
  background: {
    type: 'solid',
    color: '#060606',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 120,
    photoSpacing: 78,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 120,
      y: 706,
      width: 957,
      height: 1057,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 127,
      y: 1854,
      width: 950,
      height: 996,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 127,
      y: 2938,
      width: 950,
      height: 1020,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'warm',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['navratri', 'garba', 'dandiya', 'indian', 'festive', 'gold', 'celebration', '3-photo'],
    description: 'Vibrant festive Garba & Dandiya strip with glittering gold typography, colorful crossed Dandiya sticks, and ornate golden paisley accents.',
  },
}

// ── 4. WARM FAIRY LIGHTS (2-SHOT) ──────────────────────────────────────────
export const fairyLights2: Template = {
  id: 'custom-fairy-lights-2',
  name: 'Warm Fairy Lights (2-Shot)',
  category: 'custom',
  supportedPhotoCounts: [2],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/fairy-lights-2-overlay.png',
  background: {
    type: 'solid',
    color: '#080808',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 106,
    photoSpacing: 93,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 106,
      y: 529,
      width: 988,
      height: 1503,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 106,
      y: 2141,
      width: 988,
      height: 1438,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'warm',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['lights', 'bokeh', 'cozy', 'warm', 'romance', 'night', '2-photo'],
    description: 'Intimate and cozy 2-portrait photobooth strip adorned with warm hanging bokeh string lights and clean white inner borders.',
  },
}

// ── 5. ROYAL HERITAGE TEXTILE (3-SHOT) ─────────────────────────────────────
export const royalHeritage3: Template = {
  id: 'custom-royal-heritage-3',
  name: 'Royal Heritage (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/royal-heritage-3-overlay.png',
  background: {
    type: 'solid',
    color: '#FFFDF7',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 239,
    photoSpacing: 138,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 239,
      y: 312,
      width: 725,
      height: 947,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 239,
      y: 1420,
      width: 725,
      height: 1089,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 239,
      y: 2671,
      width: 725,
      height: 1119,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'warm',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['ethnic', 'heritage', 'indian', 'wedding', 'royal', 'traditional', 'embroidery', '3-photo'],
    description: 'Opulent traditional Indian wedding & celebration strip featuring intricate Mughal-inspired embroidered textile borders, antique gold accents, and warm ivory backing.',
  },
}
