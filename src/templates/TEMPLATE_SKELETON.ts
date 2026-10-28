import type { Template } from '@/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PHOTOBOOTH CUSTOM TEMPLATE SKELETON (BLUEPRINT)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Instructions:
 * 1. Duplicate this file and rename it (e.g. `myWeddingTemplate.ts`).
 * 2. Fill in the template details below (ID, Name, Colors, Text, Slots).
 * 3. Export your template and add it to `src/templates/index.ts`.
 * 
 * SIZES & MEASUREMENTS REFERENCE (at 300 DPI high-resolution):
 * ───────────────────────────────────────────────────────────────────────────
 * Format             Canvas Width × Height    Slot Width × Height     Outer Margin
 * 3-Photo Vertical   1200 × 3600 px           1040 × 880 px           80 px
 * 4-Photo Vertical   1200 × 4400 px           1040 × 840 px           80 px
 * ───────────────────────────────────────────────────────────────────────────
 */

// ─── 1. OPTION A: 3-PHOTO STRIP TEMPLATE ──────────────────────────────────
export const myCustomTemplate3: Template = {
  // Unique identifier (use lowercase, hyphens)
  id: 'my-custom-template-3',

  // Human-readable title displayed in the "Look" tab
  name: 'Custom Template (3-Shot)',

  // Category: 'classic' | 'modern' | 'fun' | 'vintage' | 'seasonal'
  category: 'classic',

  // Supported photo count
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],

  // Canvas total pixel dimensions
  canvas: {
    width: 1200,
    height: 3600,
  },

  // Background styling
  background: {
    // Type: 'solid' | 'gradient' | 'image'
    type: 'solid',
    color: '#FAF7F2', // Hex color code
    
    // If you want a gradient instead:
    // type: 'gradient',
    // gradient: {
    //   type: 'linear',
    //   angle: 135,
    //   stops: [
    //     { offset: 0, color: '#fdfbfb' },
    //     { offset: 1, color: '#ebedee' },
    //   ],
    // },

    // If you want a custom image background (e.g. from Canva):
    // type: 'image',
    // imageUrl: '/templates/my-custom-bg.png', // placed in public/templates/
  },

  // Outer border around the entire strip
  border: {
    // Type: 'none' | 'thin' | 'thick' | 'rounded' | 'double' | 'decorative'
    type: 'thin',
    color: '#D4CEBF',
    width: 2,
  },

  // Spacing metadata
  spacing: {
    outerMargin: 80,  // Margin from outer canvas edges (px)
    photoSpacing: 40, // Space between consecutive photo slots (px)
    padding: 0,
  },

  // Exact coordinates for each of the 3 photo slots
  photoSlots: [
    {
      id: 'slot-0',
      x: 80,
      y: 160,
      width: 1040,
      height: 880,
      shape: 'rectangle', // 'rectangle' | 'rounded' | 'circle' | 'polaroid' | 'film'
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 80,
      y: 1080,
      width: 1040,
      height: 880,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 80,
      y: 2000,
      width: 1040,
      height: 880,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],

  // Text Elements (Header & Footer text, dates, branding)
  textElements: [
    // Top Header
    {
      id: 'header-text',
      x: 0,
      y: 80, // Vertical center of header area
      width: 1200,
      defaultText: 'PHOTOBOOTH MEMORIES',
      fontSize: 44,
      fontFamily: 'Playfair Display, serif', // 'Inter' | 'Outfit' | 'DM Mono' | 'Playfair Display, serif'
      fontWeight: '700',
      color: '#1A1A1A',
      align: 'center',
      isEditable: true, // Allows user to customize this text
    },
    // Bottom Footer Title
    {
      id: 'footer-brand',
      x: 0,
      y: 3380,
      width: 1200,
      defaultText: '✦ SPECIAL MOMENTS ✦',
      fontSize: 34,
      fontFamily: 'Outfit',
      fontWeight: '600',
      color: '#2A2A2A',
      align: 'center',
      isEditable: true,
    },
    // Bottom Footer Subtitle / Date
    {
      id: 'footer-date',
      x: 0,
      y: 3460,
      width: 1200,
      defaultText: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      fontSize: 24,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: '#777777',
      align: 'center',
      isEditable: true,
    },
  ],

  decorationElements: [],

  // Default filter applied to photos with this look:
  // 'original' | 'bw' | 'warm' | 'vintage' | 'cold' | 'sepia'
  defaultFilter: 'original',

  metadata: {
    author: 'Custom Designer',
    version: '1.0',
    tags: ['custom', 'clean', '3-photo'],
  },
}


// ─── 2. OPTION B: 4-PHOTO STRIP TEMPLATE ──────────────────────────────────
export const myCustomTemplate4: Template = {
  id: 'my-custom-template-4',
  name: 'Custom Template (4-Shot)',
  category: 'classic',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],

  // Canvas height for 4-shot is 4400 px
  canvas: {
    width: 1200,
    height: 4400,
  },

  background: {
    type: 'solid',
    color: '#FAF7F2',
  },

  border: {
    type: 'thin',
    color: '#D4CEBF',
    width: 2,
  },

  spacing: {
    outerMargin: 80,
    photoSpacing: 40,
    padding: 0,
  },

  // Exact coordinates for 4 photo slots
  photoSlots: [
    {
      id: 'slot-0',
      x: 80,
      y: 140,
      width: 1040,
      height: 840,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 80,
      y: 1020,
      width: 1040,
      height: 840,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 80,
      y: 1900,
      width: 1040,
      height: 840,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-3',
      x: 80,
      y: 2780,
      width: 1040,
      height: 840,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],

  textElements: [
    {
      id: 'header-text',
      x: 0,
      y: 70,
      width: 1200,
      defaultText: 'PHOTOBOOTH MEMORIES',
      fontSize: 44,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '700',
      color: '#1A1A1A',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'footer-brand',
      x: 0,
      y: 4180,
      width: 1200,
      defaultText: '✦ SPECIAL MOMENTS ✦',
      fontSize: 34,
      fontFamily: 'Outfit',
      fontWeight: '600',
      color: '#2A2A2A',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'footer-date',
      x: 0,
      y: 4260,
      width: 1200,
      defaultText: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      fontSize: 24,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: '#777777',
      align: 'center',
      isEditable: true,
    },
  ],

  decorationElements: [],
  defaultFilter: 'original',

  metadata: {
    author: 'Custom Designer',
    version: '1.0',
    tags: ['custom', 'clean', '4-photo'],
  },
}
