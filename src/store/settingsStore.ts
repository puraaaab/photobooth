import { create } from 'zustand'
import type {
  AppSettings,
  KioskConfig,
  RetentionPolicy,
  ExportSettings,
  PrintSettings,
  PrinterRollConfig,
  SmtpConfig,
  TwilioConfig,
  EventAnalytics
} from '@/types'

const PIN_SALT = 'photobooth_kiosk_salt_v1'

// Synchronous SHA-256 string hash for client-side comparison
function sha256Sync(str: string): string {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }

  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while ((bytes.length % 64) !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push((bitLen >>> (i * 8)) & 0xff)

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]

  const w = new Array(64)
  for (let i = 0; i < bytes.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3]
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3)
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10)
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let j = 0; j < 64; j++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ ((~e) & g)
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0

      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + h) | 0
  }

  const toHex = (n: number) => ('00000000' + (n >>> 0).toString(16)).slice(-8)
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7)
}

export function hashPin(pin: string): string {
  return sha256Sync(`${PIN_SALT}_${pin}`)
}

const DEFAULT_SETTINGS: AppSettings = {
  kiosk: {
    enabled: true,
    idleTimeoutSeconds: 60,
    adminPinHash: hashPin('1234'),
    hideOsControls: true,
    preventWindowClose: true,
    autoResetAfterExport: false,
    autoResetDelaySeconds: 15,
    cameraSource: 'webcam',
    cameraCountdownSeconds: 3,
    retakeAllowance: 2,
    requireConsent: false,
    consentText: 'By tapping Start, you agree to our photo retention policy for this event.',
    captureMode: 'timed_session',
    sessionDurationSeconds: 60,
    intervalBetweenShotsSeconds: 2,
    photoCountPerSession: 30,
    queueModeEnabled: true,
    // Walk-ins buy a pass at the ticket desk; a guest-side "free walk-in pass" was a free session
    allowWalkIn: false,
  },
  retention: {
    keepSessionsDays: 7,
    deleteOriginalsAfterExport: false,
    autoArchiveCompleted: true,
    maxStorageGB: 20,
  },
  server: {
    port: 3847,
    requireAuth: false,
  },
  display: {
    orientation: 'landscape',
    dpi: 300,
  },
  printerRoll: {
    totalMediaCapacity: 400,
    printsUsed: 0,
    printsRemaining: 400,
    dyeSubGamma: 1.0,
    dyeSubBrightness: 0,
  },
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
    subject: 'Your Photobooth Strip!',
    bodyText: 'Thank you for stopping by! Here is your digital photo strip.',
  },
  twilio: {
    accountSid: '',
    authToken: '',
    fromNumber: '',
    smsTemplate: 'Here is your photo strip from the photobooth! Download: {url}',
  },
  analytics: {
    totalSessions: 0,
    totalPhotos: 0,
    totalPrints: 0,
    qrScans: 0,
    emailsSent: 0,
    smsSent: 0,
    lastResetAt: new Date().toISOString(),
  },
  defaultExport: {
    format: 'jpeg',
    quality: 95,
    dpi: 300,
    colorMode: 'rgb',
    paperSize: '4x6',
  },
  defaultPrint: {
    copies: 1,
    paperSize: '4x6',
    orientation: 'portrait',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    dpi: 300,
    sheetLayout: 'split-cut-2x6',
  },
}

const STORAGE_KEY = 'photobooth_app_settings'

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        kiosk: { ...DEFAULT_SETTINGS.kiosk, ...(parsed.kiosk || {}) },
        retention: { ...DEFAULT_SETTINGS.retention, ...(parsed.retention || {}) },
        server: { ...DEFAULT_SETTINGS.server, ...(parsed.server || {}) },
        display: { ...DEFAULT_SETTINGS.display, ...(parsed.display || {}) },
        printerRoll: { ...DEFAULT_SETTINGS.printerRoll, ...(parsed.printerRoll || {}) },
        smtp: { ...DEFAULT_SETTINGS.smtp, ...(parsed.smtp || {}) },
        twilio: { ...DEFAULT_SETTINGS.twilio, ...(parsed.twilio || {}) },
        analytics: { ...DEFAULT_SETTINGS.analytics, ...(parsed.analytics || {}) },
        defaultExport: { ...DEFAULT_SETTINGS.defaultExport, ...(parsed.defaultExport || {}) },
        defaultPrint: { ...DEFAULT_SETTINGS.defaultPrint, ...(parsed.defaultPrint || {}) },
      }

      // Auto-migrate legacy plaintext '1234' PIN to salted hash
      if (merged.kiosk.adminPinHash === '1234' || merged.kiosk.adminPinHash.length === 4) {
        merged.kiosk.adminPinHash = hashPin(merged.kiosk.adminPinHash)
      }

      // Clamp numerical bounds
      merged.kiosk.idleTimeoutSeconds = Math.max(15, Math.min(600, merged.kiosk.idleTimeoutSeconds || 60))
      merged.kiosk.autoResetDelaySeconds = Math.max(5, Math.min(120, merged.kiosk.autoResetDelaySeconds || 15))
      merged.kiosk.cameraCountdownSeconds = Math.max(1, Math.min(15, merged.kiosk.cameraCountdownSeconds || 3))
      merged.kiosk.retakeAllowance = Math.max(0, Math.min(10, merged.kiosk.retakeAllowance ?? 2))
      merged.retention.keepSessionsDays = Math.max(1, Math.min(365, merged.retention.keepSessionsDays || 7))

      return merged
    }
  } catch (err) {
    console.warn('[Settings] Failed to load saved settings, falling back to defaults:', err)
  }
  return DEFAULT_SETTINGS
}

function persistSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('[Settings] Failed to save settings to localStorage:', err)
  }
}

interface SettingsState {
  settings: AppSettings
  isAdminAuthenticated: boolean
  failedPinAttempts: number
  lockoutUntil: number | null
  
  // Actions
  updateKiosk: (config: Partial<KioskConfig>) => void
  updateRetention: (config: Partial<RetentionPolicy>) => void
  updatePrinterRoll: (config: Partial<PrinterRollConfig>) => void
  updateSmtp: (config: Partial<SmtpConfig>) => void
  updateTwilio: (config: Partial<TwilioConfig>) => void
  updateServer: (config: Partial<AppSettings['server']>) => void
  updateDisplay: (config: Partial<AppSettings['display']>) => void
  updateDefaultExport: (config: Partial<ExportSettings>) => void
  updateDefaultPrint: (config: Partial<PrintSettings>) => void
  
  // Auth & Lockout
  verifyAdminPin: (pin: string) => boolean
  setAdminPin: (newPin: string) => void
  setAdminAuthenticated: (auth: boolean) => void
  isLockedOut: () => boolean
  getRemainingLockoutSeconds: () => number
  resetToDefaults: () => void

  // Analytics & Printing
  recordSession: () => void
  recordPhoto: (count?: number) => void
  recordPrint: (copies?: number) => void
  recordPrintJob: (copies?: number) => void
  decrementRollCount: (count?: number) => void
  recordQrScan: () => void
  recordEmail: () => void
  recordSms: () => void
  resetAnalytics: () => void
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: loadSavedSettings(),
  isAdminAuthenticated: false,
  failedPinAttempts: 0,
  lockoutUntil: null,

  updateKiosk: (config) => {
    // Clamping bounds validation
    const sanitized = { ...config }
    if (sanitized.idleTimeoutSeconds !== undefined) {
      sanitized.idleTimeoutSeconds = Math.max(15, Math.min(600, sanitized.idleTimeoutSeconds))
    }
    if (sanitized.autoResetDelaySeconds !== undefined) {
      sanitized.autoResetDelaySeconds = Math.max(5, Math.min(120, sanitized.autoResetDelaySeconds))
    }
    if (sanitized.cameraCountdownSeconds !== undefined) {
      sanitized.cameraCountdownSeconds = Math.max(1, Math.min(15, sanitized.cameraCountdownSeconds))
    }
    if (sanitized.retakeAllowance !== undefined) {
      sanitized.retakeAllowance = Math.max(0, Math.min(10, sanitized.retakeAllowance))
    }

    const updated = {
      ...get().settings,
      kiosk: { ...get().settings.kiosk, ...sanitized },
    }
    persistSettings(updated)
    
    // Sync kiosk window state with Electron
    if (sanitized.enabled !== undefined && window.electronAPI?.window) {
      window.electronAPI.window.setKioskMode(sanitized.enabled)
    }

    set({ settings: updated })
  },

  updateRetention: (config) => {
    const sanitized = { ...config }
    if (sanitized.keepSessionsDays !== undefined) {
      sanitized.keepSessionsDays = Math.max(1, Math.min(365, sanitized.keepSessionsDays))
    }
    const updated = {
      ...get().settings,
      retention: { ...get().settings.retention, ...sanitized },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updatePrinterRoll: (config) => {
    const updated = {
      ...get().settings,
      printerRoll: { ...get().settings.printerRoll, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateSmtp: (config) => {
    const updated = {
      ...get().settings,
      smtp: { ...get().settings.smtp, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateTwilio: (config) => {
    const updated = {
      ...get().settings,
      twilio: { ...get().settings.twilio, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateServer: (config) => {
    const updated = {
      ...get().settings,
      server: { ...get().settings.server, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateDisplay: (config) => {
    const updated = {
      ...get().settings,
      display: { ...get().settings.display, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateDefaultExport: (config) => {
    const updated = {
      ...get().settings,
      defaultExport: { ...get().settings.defaultExport, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  updateDefaultPrint: (config) => {
    const updated = {
      ...get().settings,
      defaultPrint: { ...get().settings.defaultPrint, ...config },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  isLockedOut: () => {
    const { lockoutUntil } = get()
    if (!lockoutUntil) return false
    return Date.now() < lockoutUntil
  },

  getRemainingLockoutSeconds: () => {
    const { lockoutUntil } = get()
    if (!lockoutUntil) return 0
    return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000))
  },

  verifyAdminPin: (pin: string) => {
    if (get().isLockedOut()) return false

    const hashedInput = hashPin(pin)
    const valid = get().settings.kiosk.adminPinHash === hashedInput

    if (valid) {
      set({ isAdminAuthenticated: true, failedPinAttempts: 0, lockoutUntil: null })
      return true
    } else {
      const nextFailures = get().failedPinAttempts + 1
      if (nextFailures >= 5) {
        set({
          failedPinAttempts: nextFailures,
          lockoutUntil: Date.now() + 60000, // 60s lockout
        })
      } else {
        set({ failedPinAttempts: nextFailures })
      }
      return false
    }
  },

  setAdminPin: (newPin: string) => {
    const hashed = hashPin(newPin)
    const updated = {
      ...get().settings,
      kiosk: { ...get().settings.kiosk, adminPinHash: hashed },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  setAdminAuthenticated: (auth: boolean) => {
    set({ isAdminAuthenticated: auth })
  },

  resetToDefaults: () => {
    persistSettings(DEFAULT_SETTINGS)
    set({ settings: DEFAULT_SETTINGS, isAdminAuthenticated: false, failedPinAttempts: 0, lockoutUntil: null })
  },

  // Analytics incrementors
  recordSession: () => {
    const updated = {
      ...get().settings,
      analytics: {
        ...get().settings.analytics,
        totalSessions: (get().settings.analytics.totalSessions || 0) + 1,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  recordPhoto: (count: number = 1) => {
    const updated = {
      ...get().settings,
      analytics: {
        ...get().settings.analytics,
        totalPhotos: (get().settings.analytics.totalPhotos || 0) + count,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  recordPrint: (copies: number = 1) => {
    const currentRemaining = get().settings.printerRoll.printsRemaining
    const currentUsed = get().settings.printerRoll.printsUsed
    const newRemaining = Math.max(0, currentRemaining - copies)
    const newUsed = currentUsed + copies

    const updated = {
      ...get().settings,
      printerRoll: {
        ...get().settings.printerRoll,
        printsRemaining: newRemaining,
        printsUsed: newUsed,
      },
      analytics: {
        ...get().settings.analytics,
        totalPrints: (get().settings.analytics.totalPrints || 0) + copies,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  recordPrintJob: (copies = 1) => {
    get().recordPrint(copies)
  },

  decrementRollCount: (count = 1) => {
    const current = get().settings.printerRoll
    const printsUsed = (current.printsUsed || 0) + count
    const printsRemaining = Math.max(0, (current.totalMediaCapacity || 400) - printsUsed)
    get().updatePrinterRoll({ printsUsed, printsRemaining })
  },

  recordQrScan: () => {
    const updated = {
      ...get().settings,
      analytics: {
        ...get().settings.analytics,
        qrScans: (get().settings.analytics.qrScans || 0) + 1,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  recordEmail: () => {
    const updated = {
      ...get().settings,
      analytics: {
        ...get().settings.analytics,
        emailsSent: (get().settings.analytics.emailsSent || 0) + 1,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  recordSms: () => {
    const updated = {
      ...get().settings,
      analytics: {
        ...get().settings.analytics,
        smsSent: (get().settings.analytics.smsSent || 0) + 1,
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },

  resetAnalytics: () => {
    const updated = {
      ...get().settings,
      analytics: {
        totalSessions: 0,
        totalPhotos: 0,
        totalPrints: 0,
        qrScans: 0,
        emailsSent: 0,
        smsSent: 0,
        lastResetAt: new Date().toISOString(),
      },
    }
    persistSettings(updated)
    set({ settings: updated })
  },
}))
