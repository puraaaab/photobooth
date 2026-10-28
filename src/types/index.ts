// ─── Core Types ──────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'waiting'
  | 'capturing'
  | 'receiving'
  | 'selecting'
  | 'designing'
  | 'editing'
  | 'preview'
  | 'exporting'
  | 'completed'
  | 'archived'

export type TicketStatus =
  | 'WAITING'
  | 'IN_BOOTH'
  | 'EDITING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'CANCELLED'

export type PaymentMethod = 'UPI' | 'CASH'
export type PaymentStatus = 'PAID' | 'PENDING'

// Current plans 99 / 169 / 229 (see src/constants/pricing.ts); 149 / 179 kept for tickets sold before the change
export type TicketPlan = 99 | 169 | 229 | 149 | 179

export interface Ticket {
  id: string              // e.g. "T-1001"
  code: string            // 4-digit numeric code e.g. "1001"
  customerName?: string   // e.g. "Alex & Sarah"
  customerPhone?: string  // e.g. "+1-555-0199"
  notes?: string
  status: TicketStatus
  createdAt: string
  claimedAt?: string      // when customer enters booth
  startedAt?: string      // when shoot begins
  completedAt?: string    // when printed / finished
  sessionId?: string      // bound photobooth session
  photoCount?: number
  printCount?: number
  paymentMethod?: PaymentMethod
  paymentAmount?: number
  paymentStatus?: PaymentStatus
  paidAt?: string
  upiTransactionRef?: string
  planType?: TicketPlan   // 99 = 2 strips, 169 = 4 strips, 229 = 6 strips (all on A5, 2 strips per sheet)
}

export interface Session {
  id: string
  createdAt: string
  status: SessionStatus
  piId?: string
  piName?: string
  ticketId?: string
  ticketCode?: string
  customerName?: string
  customerPhone?: string
  photos: Photo[]
  selectedPhotoIds: string[]
  assignments: PhotoAssignment[]
  strips: Strip[]
  layout: LayoutConfig
  template: Template | null
  globalFilter: FilterConfig | null
  canvasElements: CanvasElement[]
  exportSettings: ExportSettings
  printSettings: PrintSettings
  autosaveAt?: string
}

// ─── Photo ───────────────────────────────────────────────────────────────────

export interface Photo {
  id: string
  sessionId: string
  originalPath: string
  thumbnailPath: string
  previewPath: string
  originalUrl?: string
  thumbnailUrl: string
  previewUrl: string
  metadata: PhotoMetadata
  edits: PhotoEdits
  isFavorite: boolean
  uploadedAt: string
}

export interface PhotoMetadata {
  width: number
  height: number
  format: string
  size: number
  originalName?: string
}

export interface PhotoEdits {
  filter: string
  filterIntensity: number
  crop: CropRect
  rotation: number
  flipH: boolean
  flipV: boolean
  scale?: number          // 1 to 3 (zoom multiplier)
  panX?: number           // -100 to 100 px pan offset
  panY?: number           // -100 to 100 px pan offset
  brightness: number      // -100 to 100
  contrast: number        // -100 to 100
  saturation: number      // -100 to 100
  exposure: number        // -100 to 100
  temperature: number     // -100 to 100 (cool to warm)
  tint: number            // -100 to 100 (green to magenta)
  highlights: number      // -100 to 100
  shadows: number         // -100 to 100
  sharpness: number       // 0 to 100
  blur: number            // 0 to 100
  grain: number           // 0 to 100
  vignette: number        // 0 to 100
  fade: number            // 0 to 100
}

export interface CropRect {
  x: number       // 0–1 normalized
  y: number       // 0–1 normalized
  width: number   // 0–1 normalized
  height: number  // 0–1 normalized
}

// ─── Photo Assignment ─────────────────────────────────────────────────────────

export interface PhotoAssignment {
  photoId: string
  stripId: string
  slotId: string
  position: number
}

// ─── Strip ───────────────────────────────────────────────────────────────────

export interface Strip {
  id: string
  index: number
  slots: PhotoSlot[]
  stripFilter?: FilterConfig
  canvasElements: CanvasElement[]
  template?: Template
}

export interface PhotoSlot {
  id: string
  position: number
  photoId?: string
  slotDefinition: SlotDefinition
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface LayoutConfig {
  photosPerStrip: number
  stripCount: number
  arrangement: number[]    // e.g. [4, 4, 4, 2]
  orientation: 'vertical' | 'horizontal'
}

export interface RankedLayout {
  arrangement: number[]
  stripCount: number
  rank: number
  label: string           // "Balanced", "Compact", "Custom"
  totalPhotos: number
  unusedPhotos: number
}

// ─── Template ────────────────────────────────────────────────────────────────

export type TemplateCategory = 'classic' | 'modern' | 'fun' | 'vintage' | 'seasonal' | 'custom'

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  supportedPhotoCounts: number[]
  supportedOrientations: ('vertical' | 'horizontal')[]
  canvas: CanvasSize
  background: BackgroundConfig
  border: BorderConfig
  spacing: SpacingConfig
  photoSlots: SlotDefinition[]
  overlayImageUrl?: string
  thumbnailUrl?: string
  textElements?: TextElementDefinition[]
  stickerElements?: StickerElementDefinition[]
  decorationElements?: DecorationDefinition[]
  defaultFilter?: string
  defaultFilterIntensity?: number
  isLocked?: boolean
  description?: string
  createdAt?: string
  metadata?: Record<string, unknown>
  tags?: string[]
}

export interface CanvasSize {
  width: number
  height: number
}

export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'image' | 'pattern'
  color?: string
  gradient?: GradientConfig
  imageUrl?: string
  pattern?: string
}

export interface GradientConfig {
  type?: string
  angle: number
  stops: { color: string; offset: number }[]
}

export interface BorderConfig {
  type: 'none' | 'solid' | 'dashed' | 'double' | 'filmstrip' | 'polaroid' | 'custom' | 'thin' | 'thick' | 'decorative' | string
  color?: string
  width?: number
  radius?: number
  inset?: number
}

export interface SpacingConfig {
  outerMargin: number
  photoSpacing: number
  headerHeight?: number
  footerHeight?: number
  padding?: number
}

export interface SlotDefinition {
  id?: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  shape?: 'rectangle' | 'rounded' | 'circle' | 'heart' | 'star' | 'polaroid' | 'film'
  cornerRadius?: number
  border?: BorderConfig
  shadow?: ShadowConfig
}

export interface ShadowConfig {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface TextElementDefinition {
  id: string
  x: number
  y: number
  width?: number
  height?: number
  defaultText: string
  fontFamily: string
  fontSize: number
  fontWeight?: string
  letterSpacing?: number
  color: string
  align: 'left' | 'center' | 'right'
  isEditable?: boolean
}

export interface DecorationDefinition {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  [key: string]: unknown
}

export interface StickerElementDefinition {
  id: string
  x: number
  y: number
  width: number
  height: number
  url: string
  rotation?: number
}

// ─── Filter ──────────────────────────────────────────────────────────────────

export interface FilterConfig {
  filter?: string
  filterIntensity?: number
  brightness: number
  contrast: number
  saturation: number
  exposure: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  sharpness?: number
  blur?: number
  grain: number
  vignette: number
  fade: number
  sepia?: number
  hueRotate?: number
  grayscale?: number
  invert?: number
}

export interface FilterPreset {
  id: string
  name: string
  category: 'korean' | 'glam' | 'film' | 'vintage' | 'blackwhite' | 'cinematic' | 'natural' | 'fun' | 'color' | 'bw' | 'creative' | string
  thumbnailUrl?: string
  config: Partial<FilterConfig>
  description?: string
  badge?: string
}

export type FilterApplyScope = 'active_photo' | 'single_photo' | 'photos_in_strip' | 'all_photos'

// ─── Canvas Elements (Stickers, Text, Shapes) ─────────────────────────────────

export type CanvasElementType = 'text' | 'sticker' | 'shape' | 'drawing' | 'image'

export interface CanvasElement {
  id: string
  type: CanvasElementType
  stripId?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX?: number
  scaleY?: number
  zIndex: number
  opacity: number
  isLocked?: boolean
  locked?: boolean
  props?: TextElementProps | StickerElementProps | ShapeElementProps | ImageElementProps
  textProps?: TextElementProps
}

export interface TextElementProps {
  text: string
  fontFamily: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontWeight?: string
  fontStyle?: string
  letterSpacing?: number
  lineHeight?: number
  strokeColor?: string
  strokeWidth?: number
  shadowColor?: string
  shadowBlur?: number
}

export interface StickerElementProps {
  url: string
  category: string
  name: string
}

export interface ShapeElementProps {
  shapeType: 'rectangle' | 'circle' | 'heart' | 'star' | 'line' | 'arrow'
  fill: string
  stroke: string
  strokeWidth?: number
}

export interface ImageElementProps {
  src: string
  fit: 'cover' | 'contain' | 'fill'
}

// ─── Export / Print ──────────────────────────────────────────────────────────

export interface ExportSettings {
  format: 'jpeg' | 'png' | 'webp' | 'pdf'
  quality: number           // 1–100
  dpi: number               // 72–600
  colorMode: 'rgb' | 'cmyk'
  paperSize?: PaperSize
}

export type PaperSize = '2x6' | '4x6' | '5x7' | '6x8' | '8x10' | 'a4' | 'a5' | 'custom'

export interface PrintSettings {
  copies: number
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
  dpi: number
  printerId?: string
  sheetLayout: '1up' | '2up' | '4up' | 'split-cut-2x6' | 'custom'
}

// ─── History / Undo-Redo ──────────────────────────────────────────────────────

export type HistoryCommandType =
  | 'PHOTO_FILTER_CHANGED'
  | 'PHOTO_ADJUSTMENT_CHANGED'
  | 'PHOTO_CROP_CHANGED'
  | 'PHOTO_ROTATION_CHANGED'
  | 'PHOTO_ASSIGNED_TO_SLOT'
  | 'PHOTO_MOVED_BETWEEN_STRIPS'
  | 'PHOTO_REPLACED_IN_SLOT'
  | 'STRIP_TEMPLATE_CHANGED'
  | 'LAYOUT_CHANGED'
  | 'CANVAS_ELEMENT_ADDED'
  | 'CANVAS_ELEMENT_MOVED'
  | 'CANVAS_ELEMENT_RESIZED'
  | 'CANVAS_ELEMENT_DELETED'
  | 'TEXT_EDITED'
  | 'BACKGROUND_CHANGED'
  | 'BORDER_CHANGED'
  | 'FILTER_APPLIED_TO_SCOPE'
  | 'EDITS_PASTED'
  | 'STRIP_FILTER_CHANGED'

export interface HistoryCommand {
  id: string
  type: HistoryCommandType
  timestamp: string
  description: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

// ─── Connection / Server ──────────────────────────────────────────────────────

export interface PiConnectionStatus {
  connected: boolean
  ipAddress?: string
  lastPhotoAt?: string
  photosReceived: number
  latencyMs?: number
  sessionId?: string
}

export interface ServerStatus {
  running: boolean
  port: number
  address: string
}

// ─── Kiosk / Commercial Config ───────────────────────────────────────────────

export type CameraSource = 'webcam' | 'pi_network' | 'demo'

export interface KioskConfig {
  enabled: boolean
  idleTimeoutSeconds: number
  adminPinHash: string
  hideOsControls: boolean
  preventWindowClose: boolean
  autoResetAfterExport: boolean
  autoResetDelaySeconds: number
  cameraSource: CameraSource
  cameraDeviceId?: string
  cameraCountdownSeconds: number
  retakeAllowance: number
  requireConsent: boolean
  consentText: string
  privacyConsentEnabled?: boolean
  eventName?: string
  printGamma?: number
  printBrightness?: number
  attractVideoUrl?: string
  captureMode?: 'standard' | 'timed_session'
  sessionDurationSeconds?: number
  intervalBetweenShotsSeconds?: number
  photoCountPerSession?: number
  queueModeEnabled?: boolean
  allowWalkIn?: boolean
}

export interface RetentionPolicy {
  keepSessionsDays: number
  deleteOriginalsAfterExport: boolean
  autoArchiveCompleted: boolean
  maxStorageGB: number
}

export interface PrinterRollConfig {
  enabled?: boolean
  totalMediaCapacity: number
  printsUsed: number
  printsRemaining: number
  dyeSubGamma: number
  dyeSubBrightness: number
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  subject: string
  bodyText: string
}

export interface TwilioConfig {
  accountSid: string
  authToken: string
  fromNumber: string
  smsTemplate: string
}

export interface EventAnalytics {
  totalSessions: number
  totalPhotos: number
  totalPrints: number
  qrScans: number
  emailsSent: number
  smsSent: number
  lastResetAt: string
}

export interface AppSettings {
  printerName?: string
  kiosk: KioskConfig
  retention: RetentionPolicy
  server: {
    port: number
    requireAuth: boolean
  }
  display: {
    orientation: 'portrait' | 'landscape'
    dpi: number
  }
  printerRoll: PrinterRollConfig
  smtp: SmtpConfig
  twilio: TwilioConfig
  analytics: EventAnalytics
  defaultExport: ExportSettings
  defaultPrint: PrintSettings
}
