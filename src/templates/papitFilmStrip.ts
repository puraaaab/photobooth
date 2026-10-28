import type { Template, DecorationDefinition } from '@/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAPIT — REALISTIC 35mm FILM STRIP TEMPLATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modeled after authentic 35mm film stock:
 *   - 3:2 rectangular rounded perforations (not square punches)
 *   - Solid black inter-frame divider bars & rebate margins
 *   - Warm celluloid black (#141210) over cream backing (#FBF7EE)
 *   - Subtle vintage amber edge markings (▶ 1A, ▶ 2A, etc.)
 */

const RAIL_WIDTH = 96
const PERF_WIDTH = 32
const PERF_HEIGHT = 48
const PERF_SPACING = 72
const PERF_RADIUS = 5
const CELLULOID_BLACK = '#141210'
const CREAM_BASE = '#FBF7EE'
const AMBER_CODE = '#D49B55' // Classic vintage film edge-marking tone

function generateSprockets(canvasHeight: number, railWidth: number): DecorationDefinition[] {
  const holes: DecorationDefinition[] = []
  const leftX = (railWidth - PERF_WIDTH) / 2
  const rightX = 1200 - railWidth + (railWidth - PERF_WIDTH) / 2
  const startY = 24

  let y = startY
  let i = 0
  while (y + PERF_HEIGHT < canvasHeight - startY) {
    holes.push(
      {
        id: `sprocket-left-${i}`,
        type: 'rect',
        x: leftX,
        y,
        width: PERF_WIDTH,
        height: PERF_HEIGHT,
        color: CREAM_BASE,
        cornerRadius: PERF_RADIUS,
      },
      {
        id: `sprocket-right-${i}`,
        type: 'rect',
        x: rightX,
        y,
        width: PERF_WIDTH,
        height: PERF_HEIGHT,
        color: CREAM_BASE,
        cornerRadius: PERF_RADIUS,
      }
    )
    y += PERF_SPACING
    i++
  }
  return holes
}

// ── 4-PHOTO FILM STRIP ───────────────────────────────────────────────────

const CANVAS_4_HEIGHT = 4400
const PHOTO_4_WIDTH = 1200 - RAIL_WIDTH * 2 // 1008px
const PHOTO_4_HEIGHT = 800
const GAP_4 = 28 // Solid black inter-frame line height

const PHOTO_4_Y = [
  210,
  210 + (PHOTO_4_HEIGHT + GAP_4) * 1, // 1038
  210 + (PHOTO_4_HEIGHT + GAP_4) * 2, // 1866
  210 + (PHOTO_4_HEIGHT + GAP_4) * 3, // 2694
]

export const papitFilmStrip: Template = {
  id: 'papit-film-strip-4',
  name: 'PapIt Film Strip (4-Photo)',
  category: 'custom',

  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],

  canvas: {
    width: 1200,
    height: CANVAS_4_HEIGHT,
  },

  background: {
    type: 'solid',
    color: CREAM_BASE,
  },

  border: {
    type: 'thin',
    color: CELLULOID_BLACK,
    width: 2,
  },

  spacing: {
    outerMargin: RAIL_WIDTH,
    photoSpacing: GAP_4,
    padding: 0,
  },

  photoSlots: [
    { id: 'slot-0', x: RAIL_WIDTH, y: PHOTO_4_Y[0], width: PHOTO_4_WIDTH, height: PHOTO_4_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
    { id: 'slot-1', x: RAIL_WIDTH, y: PHOTO_4_Y[1], width: PHOTO_4_WIDTH, height: PHOTO_4_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
    { id: 'slot-2', x: RAIL_WIDTH, y: PHOTO_4_Y[2], width: PHOTO_4_WIDTH, height: PHOTO_4_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
    { id: 'slot-3', x: RAIL_WIDTH, y: PHOTO_4_Y[3], width: PHOTO_4_WIDTH, height: PHOTO_4_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
  ],

  textElements: [
    // Top Brand Title
    {
      id: 'header-text',
      x: 0,
      y: 75,
      width: 1200,
      defaultText: 'PapIt',
      fontSize: 58,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '700',
      color: '#0F7766',
      align: 'center',
      isEditable: true,
    },

    // ── Film Edge Codes (Simulates 35mm factory rebate stamps) ──
    {
      id: 'edge-code-1',
      x: 104,
      y: PHOTO_4_Y[0] - 22,
      width: 200,
      defaultText: '▶ 1A',
      fontSize: 16,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: AMBER_CODE,
      align: 'left',
      isEditable: false,
    },
    {
      id: 'edge-code-2',
      x: 104,
      y: PHOTO_4_Y[1] - 22,
      width: 200,
      defaultText: '▶ 2A',
      fontSize: 16,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: AMBER_CODE,
      align: 'left',
      isEditable: false,
    },
    {
      id: 'edge-code-3',
      x: 104,
      y: PHOTO_4_Y[2] - 22,
      width: 200,
      defaultText: '▶ 3A',
      fontSize: 16,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: AMBER_CODE,
      align: 'left',
      isEditable: false,
    },
    {
      id: 'edge-code-4',
      x: 104,
      y: PHOTO_4_Y[3] - 22,
      width: 200,
      defaultText: '▶ 4A',
      fontSize: 16,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: AMBER_CODE,
      align: 'left',
      isEditable: false,
    },
    {
      id: 'edge-code-iso',
      x: 1200 - RAIL_WIDTH - 210,
      y: PHOTO_4_Y[0] - 22,
      width: 200,
      defaultText: 'PAPIT 400',
      fontSize: 15,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '600',
      color: AMBER_CODE,
      align: 'right',
      isEditable: false,
    },

    // ── Message & Footer ──
    {
      id: 'custom-message',
      x: 80,
      y: 3620,
      width: 1040,
      defaultText: 'YOUR MESSAGE HERE',
      fontSize: 30,
      fontFamily: 'Outfit',
      fontWeight: '500',
      color: '#2B2B2B',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'footer-brand',
      x: 0,
      y: 4130,
      width: 1200,
      defaultText: '✦ PapIt ✦',
      fontSize: 34,
      fontFamily: 'Playfair Display, serif',
      fontWeight: '700',
      color: '#0F7766',
      align: 'center',
      isEditable: true,
    },
    {
      id: 'footer-date',
      x: 0,
      y: 4205,
      width: 1200,
      defaultText: new Date()
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase(),
      fontSize: 22,
      fontFamily: 'DM Mono, monospace',
      fontWeight: '500',
      color: '#666666',
      align: 'center',
      isEditable: true,
    },
  ],

  decorationElements: [
    // Left & Right Perforated Rails
    { id: 'rail-left', type: 'rect', x: 0, y: 0, width: RAIL_WIDTH, height: CANVAS_4_HEIGHT, color: CELLULOID_BLACK },
    { id: 'rail-right', type: 'rect', x: 1200 - RAIL_WIDTH, y: 0, width: RAIL_WIDTH, height: CANVAS_4_HEIGHT, color: CELLULOID_BLACK },

    // Top & Bottom Film Gate Bars
    { id: 'gate-top', type: 'rect', x: RAIL_WIDTH, y: PHOTO_4_Y[0] - GAP_4, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'gate-bottom', type: 'rect', x: RAIL_WIDTH, y: PHOTO_4_Y[3] + PHOTO_4_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },

    // Inter-frame Dividers (Separates photos with black celluloid)
    { id: 'divider-1', type: 'rect', x: RAIL_WIDTH, y: PHOTO_4_Y[0] + PHOTO_4_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'divider-2', type: 'rect', x: RAIL_WIDTH, y: PHOTO_4_Y[1] + PHOTO_4_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'divider-3', type: 'rect', x: RAIL_WIDTH, y: PHOTO_4_Y[2] + PHOTO_4_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },

    // Authentic Sprocket Holes
    ...generateSprockets(CANVAS_4_HEIGHT, RAIL_WIDTH),

    // Logo watermark
    {
      id: 'footer-logo',
      type: 'image',
      x: 480,
      y: 3740,
      width: 240,
      height: 120,
      imageUrl: '/papit.png',
      src: '/papit.png',
    },
  ],

  defaultFilter: 'sepia',

  metadata: {
    author: 'PapIt',
    version: '2.0',
    tags: ['vintage', 'film-strip', 'sepia', '35mm', 'photobooth', '4-photo'],
  },
}

// ── 3-PHOTO FILM STRIP ───────────────────────────────────────────────────

const CANVAS_3_HEIGHT = 3600
const PHOTO_3_HEIGHT = 840
const PHOTO_3_Y = [
  210,
  210 + (PHOTO_3_HEIGHT + GAP_4) * 1, // 1078
  210 + (PHOTO_3_HEIGHT + GAP_4) * 2, // 1946
]

export const papitFilmStrip3: Template = {
  ...papitFilmStrip,
  id: 'papit-film-strip-3',
  name: 'PapIt Film Strip (3-Photo)',
  supportedPhotoCounts: [3],
  canvas: { width: 1200, height: CANVAS_3_HEIGHT },
  spacing: {
    outerMargin: RAIL_WIDTH,
    photoSpacing: GAP_4,
    padding: 0,
  },
  photoSlots: [
    { id: 'slot-0', x: RAIL_WIDTH, y: PHOTO_3_Y[0], width: PHOTO_4_WIDTH, height: PHOTO_3_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
    { id: 'slot-1', x: RAIL_WIDTH, y: PHOTO_3_Y[1], width: PHOTO_4_WIDTH, height: PHOTO_3_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
    { id: 'slot-2', x: RAIL_WIDTH, y: PHOTO_3_Y[2], width: PHOTO_4_WIDTH, height: PHOTO_3_HEIGHT, shape: 'rectangle', cornerRadius: 0 },
  ],
  textElements: [
    papitFilmStrip.textElements![0], // Header
    { ...papitFilmStrip.textElements![1], y: PHOTO_3_Y[0] - 22 },
    { ...papitFilmStrip.textElements![2], y: PHOTO_3_Y[1] - 22 },
    { ...papitFilmStrip.textElements![3], y: PHOTO_3_Y[2] - 22 },
    { ...papitFilmStrip.textElements![5], y: PHOTO_3_Y[0] - 22 }, // ISO mark
    { ...papitFilmStrip.textElements![6], y: 2920 }, // Message
    { ...papitFilmStrip.textElements![7], y: 3380 }, // Brand
    { ...papitFilmStrip.textElements![8], y: 3450 }, // Date
  ],
  decorationElements: [
    { id: 'rail-left', type: 'rect', x: 0, y: 0, width: RAIL_WIDTH, height: CANVAS_3_HEIGHT, color: CELLULOID_BLACK },
    { id: 'rail-right', type: 'rect', x: 1200 - RAIL_WIDTH, y: 0, width: RAIL_WIDTH, height: CANVAS_3_HEIGHT, color: CELLULOID_BLACK },
    { id: 'gate-top', type: 'rect', x: RAIL_WIDTH, y: PHOTO_3_Y[0] - GAP_4, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'gate-bottom', type: 'rect', x: RAIL_WIDTH, y: PHOTO_3_Y[2] + PHOTO_3_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'divider-1', type: 'rect', x: RAIL_WIDTH, y: PHOTO_3_Y[0] + PHOTO_3_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    { id: 'divider-2', type: 'rect', x: RAIL_WIDTH, y: PHOTO_3_Y[1] + PHOTO_3_HEIGHT, width: PHOTO_4_WIDTH, height: GAP_4, color: CELLULOID_BLACK },
    ...generateSprockets(CANVAS_3_HEIGHT, RAIL_WIDTH),
    {
      id: 'footer-logo',
      type: 'image',
      x: 480,
      y: 3040,
      width: 240,
      height: 120,
      imageUrl: '/papit.png',
      src: '/papit.png',
    },
  ],
}