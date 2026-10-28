import type { Template } from '@/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  STUDIO EDITORIAL & COQUETTE PHOTO STRIP TEMPLATES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. Zebra Chic (4-Shot) - High-contrast black & white animal print
 *  2. Wild Safari (4-Shot) - Natural tan & golden cheetah/leopard print
 *  3. Vintage Lace (3-Shot) - Victorian antique charcoal embroidered lace
 *  4. Pastel Cow Print (4-Shot) - Y2K pink & brown cow spots on cream
 *  5. Rose Garden (2-Shot) - Romantic red roses & botanical climbing vines
 *  6. Burgundy Ribbon & Hearts (3-Shot) - Coquette white satin bows & 3D black hearts
 *  7. Good Things Coming (3-Shot) - Festive holiday cherries, silver baubles & typography
 *  8. Fallen Angel (4-Shot) - Dark maroon gothic fairy stars & editorial typography
 *  9. Crimson Kiss (2-Shot) - Noir black with intense red lipstick kiss prints
 */

// ── 1. ZEBRA CHIC (4-SHOT) ──────────────────────────────────────────────────
export const zebraStrip4: Template = {
  id: 'custom-zebra-strip-4',
  name: 'Zebra Chic (4-Shot)',
  category: 'custom',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/zebra-strip-4-overlay.png',
  background: {
    type: 'solid',
    color: '#0A0A0A',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 162,
    photoSpacing: 102,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 162,
      y: 124,
      width: 876,
      height: 844,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 162,
      y: 1087,
      width: 876,
      height: 901,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 162,
      y: 2109,
      width: 876,
      height: 897,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-3',
      x: 162,
      y: 3101,
      width: 876,
      height: 872,
      shape: 'rectangle',
      cornerRadius: 0,
    },
  ],
  textElements: [],
  decorationElements: [],
  defaultFilter: 'bnw',
  metadata: {
    author: 'Photobooth Studio',
    version: '1.0',
    tags: ['zebra', 'monochrome', 'black-and-white', 'animal-print', '4-photo'],
    description: 'Monochrome high-contrast zebra print border with sleek clean framing for 4 vertical portraits.',
  },
}

// ── 2. WILD SAFARI (4-SHOT) ─────────────────────────────────────────────────
export const leopardSafari4: Template = {
  id: 'custom-leopard-safari-4',
  name: 'Wild Safari (4-Shot)',
  category: 'custom',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/leopard-safari-4-overlay.png',
  background: {
    type: 'solid',
    color: '#110D0A',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 171,
    photoSpacing: 113,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 171,
      y: 124,
      width: 858,
      height: 868,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 171,
      y: 1125,
      width: 858,
      height: 864,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 171,
      y: 2113,
      width: 858,
      height: 868,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-3',
      x: 171,
      y: 3106,
      width: 858,
      height: 840,
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
    tags: ['leopard', 'cheetah', 'safari', 'wild', 'animal-print', 'warm', '4-photo'],
    description: 'Warm natural tan and gold cheetah/leopard print border with classic photo booth cutouts.',
  },
}

// ── 3. VINTAGE LACE (3-SHOT) ────────────────────────────────────────────────
export const vintageLace3: Template = {
  id: 'custom-vintage-lace-3',
  name: 'Vintage Lace (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/vintage-lace-3-overlay.png',
  background: {
    type: 'solid',
    color: '#0C0C0D',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 236,
    photoSpacing: 113,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 236,
      y: 304,
      width: 729,
      height: 1061,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 239,
      y: 1497,
      width: 725,
      height: 1098,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 239,
      y: 2720,
      width: 725,
      height: 1094,
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
    tags: ['vintage', 'lace', 'victorian', 'antique', 'embroidery', 'gothic', '3-photo'],
    description: 'Intricate Victorian antique charcoal lace with delicate embroidered filigree and scalloped borders.',
  },
}

// ── 4. PASTEL COW PRINT (4-SHOT) ───────────────────────────────────────────
export const pinkCow4: Template = {
  id: 'custom-pink-cow-4',
  name: 'Pastel Cow Print (4-Shot)',
  category: 'custom',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/pink-cow-4-overlay.png',
  background: {
    type: 'solid',
    color: '#FDF9F5',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 174,
    photoSpacing: 113,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 174,
      y: 111,
      width: 848,
      height: 860,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 174,
      y: 1104,
      width: 848,
      height: 881,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 174,
      y: 2108,
      width: 848,
      height: 836,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-3',
      x: 174,
      y: 3065,
      width: 848,
      height: 856,
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
    tags: ['cow-print', 'pink', 'pastel', 'y2k', 'cute', 'aesthetic', '4-photo'],
    description: 'Playful Y2K pastel pink and chocolate brown cow pattern on a warm cream aesthetic strip.',
  },
}

// ── 5. ROSE GARDEN (2-SHOT) ─────────────────────────────────────────────────
export const roseGarden2: Template = {
  id: 'custom-rose-garden-2',
  name: 'Rose Garden (2-Shot)',
  category: 'custom',
  supportedPhotoCounts: [2],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/rose-garden-2-overlay.png',
  background: {
    type: 'solid',
    color: '#0A0808',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 143,
    photoSpacing: 258,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 143,
      y: 834,
      width: 901,
      height: 1049,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 150,
      y: 2195,
      width: 901,
      height: 1045,
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
    tags: ['roses', 'floral', 'botanical', 'romantic', 'love', 'garden', '2-photo'],
    description: 'Romantic deep red garden roses, climbing botanical vines, and ornate scalloped framing for 2 portraits.',
  },
}

// ── 6. BURGUNDY RIBBON & HEARTS (3-SHOT) ───────────────────────────────────
export const burgundyRibbon3: Template = {
  id: 'custom-burgundy-ribbon-3',
  name: 'Burgundy Ribbon & Hearts (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/burgundy-ribbon-3-overlay.png',
  background: {
    type: 'solid',
    color: '#2C090D',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 130,
    photoSpacing: 138,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 130,
      y: 127,
      width: 936,
      height: 909,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 130,
      y: 1198,
      width: 936,
      height: 926,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 130,
      y: 2264,
      width: 936,
      height: 877,
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
    tags: ['burgundy', 'ribbon', 'bow', 'coquette', 'hearts', 'chic', '3-photo'],
    description: 'Rich velvet burgundy strip styled with delicate white satin ribbon bows and glossy 3D black hearts.',
  },
}

// ── 7. GOOD THINGS COMING (3-SHOT) ──────────────────────────────────────────
export const holidayCherries3: Template = {
  id: 'custom-holiday-cherries-3',
  name: 'Good Things Coming (3-Shot)',
  category: 'custom',
  supportedPhotoCounts: [3],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/holiday-cherries-3-overlay.png',
  background: {
    type: 'solid',
    color: '#28070B',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 154,
    photoSpacing: 135,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 154,
      y: 172,
      width: 891,
      height: 823,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 154,
      y: 1153,
      width: 891,
      height: 819,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 154,
      y: 2137,
      width: 891,
      height: 831,
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
    tags: ['holiday', 'cherries', 'festive', 'winter', 'sparkle', 'wine', '3-photo'],
    description: 'Deep wine festive strip featuring glossy cherry ornaments, sparkling silver baubles, and inspiring typography.',
  },
}

// ── 8. FALLEN ANGEL (4-SHOT) ────────────────────────────────────────────────
export const fallenAngel4: Template = {
  id: 'custom-fallen-angel-4',
  name: 'Fallen Angel (4-Shot)',
  category: 'custom',
  supportedPhotoCounts: [4],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/fallen-angel-4-overlay.png',
  background: {
    type: 'solid',
    color: '#2A080B',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 115,
    photoSpacing: 98,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 115,
      y: 156,
      width: 974,
      height: 750,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 115,
      y: 1022,
      width: 974,
      height: 753,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-2',
      x: 115,
      y: 1891,
      width: 974,
      height: 745,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-3',
      x: 115,
      y: 2740,
      width: 974,
      height: 708,
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
    tags: ['angel', 'gothic', 'stars', 'grunge', 'burgundy', 'maroon', 'editorial', '4-photo'],
    description: 'Editorial deep maroon strip with grunge fairy stars and "An angel has fallen" poetic gothic typography.',
  },
}

// ── 9. CRIMSON KISS (2-SHOT) ────────────────────────────────────────────────
export const crimsonKiss2: Template = {
  id: 'custom-crimson-kiss-2',
  name: 'Crimson Kiss (2-Shot)',
  category: 'custom',
  supportedPhotoCounts: [2],
  supportedOrientations: ['vertical'],
  canvas: {
    width: 1200,
    height: 4200,
  },
  overlayImageUrl: '/templates/crimson-kiss-2-overlay.png',
  background: {
    type: 'solid',
    color: '#000000',
  },
  border: {
    type: 'none',
  },
  spacing: {
    outerMargin: 155,
    photoSpacing: 136,
    padding: 0,
  },
  photoSlots: [
    {
      id: 'slot-0',
      x: 155,
      y: 438,
      width: 891,
      height: 1470,
      shape: 'rectangle',
      cornerRadius: 0,
    },
    {
      id: 'slot-1',
      x: 155,
      y: 2072,
      width: 891,
      height: 1484,
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
    tags: ['kiss', 'lips', 'red', 'crimson', 'glam', 'editorial', 'noir', '2-photo'],
    description: 'Edgy noir photo strip featuring high-contrast crimson lipstick kiss prints, crisp white photo borders, and rich black canvas.',
  },
}
