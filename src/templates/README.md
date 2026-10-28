# 📸 Custom Photobooth Templates Guide

Each template lives in its own file in this folder (`src/templates/`).

---

## 📐 Exact Pixel Measurements (300 DPI High-Resolution)

Our photobooth engine uses standard **300 DPI** print proportions:

### 1. 3-Photo Vertical Strip
- **Canvas Size**: `1200 px` width × `3600 px` height (Aspect ratio 1:3)
- **Outer Margins**: `80 px` (Left/Right)
- **Header Space**: `0` to `150 px` (Header text `y = 80 px`)
- **Slot Width**: `1040 px`
- **Slot Height**: `880 px`
- **Slot Gap**: `40 px`
- **Slot Coordinates**:
  - Slot 1: `x: 80, y: 160, width: 1040, height: 880`
  - Slot 2: `x: 80, y: 1080, width: 1040, height: 880`
  - Slot 3: `x: 80, y: 2000, width: 1040, height: 880`
- **Footer Space**: `2900` to `3600 px` (Footer text `y = 3380` and `y = 3460`)

---

### 2. 4-Photo Vertical Strip
- **Canvas Size**: `1200 px` width × `4400 px` height (Aspect ratio 1:3.67)
- **Outer Margins**: `80 px` (Left/Right)
- **Header Space**: `0` to `130 px` (Header text `y = 70 px`)
- **Slot Width**: `1040 px`
- **Slot Height**: `840 px`
- **Slot Gap**: `40 px`
- **Slot Coordinates**:
  - Slot 1: `x: 80, y: 140, width: 1040, height: 840`
  - Slot 2: `x: 80, y: 1020, width: 1040, height: 840`
  - Slot 3: `x: 80, y: 1900, width: 1040, height: 840`
  - Slot 4: `x: 80, y: 2780, width: 1040, height: 840`
- **Footer Space**: `3640` to `4400 px` (Footer text `y = 4180` and `y = 4260`)

---

## 🚀 How to Add a New Template in 3 Simple Steps:

1. **Copy the skeleton**:
   Duplicate [`TEMPLATE_SKELETON.ts`](file:///c:/projects/Photobooth/src/templates/TEMPLATE_SKELETON.ts) and rename it (e.g. `retroSunset.ts`).

2. **Customize your design**:
   - Change `id` and `name`.
   - Set background color, gradient, or custom Canva PNG image (`imageUrl: '/templates/my-bg.png'`).
   - Customize `textElements` (Header title, footer date, subtext).
   - Set `defaultFilter` (`'original'`, `'vintage'`, `'warm'`, `'bw'`, etc.).

3. **Register it in [`src/templates/index.ts`](file:///c:/projects/Photobooth/src/templates/index.ts)**:
   ```typescript
   import { retroSunset3, retroSunset4 } from './retroSunset'

   export const CUSTOM_TEMPLATES = [
     retroSunset3,
     retroSunset4,
   ]
   ```
   **Done!** It automatically shows up in the Photobooth with live previews, per-strip selection, and high-res print export.
