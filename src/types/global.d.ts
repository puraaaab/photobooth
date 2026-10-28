// Global window extensions for Electron API

export interface ElectronWindowAPI {
  setFullscreen: (fullscreen: boolean) => Promise<void>
  setKioskMode: (kiosk: boolean) => Promise<void>
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
}

export interface ElectronPrintAPI {
  getPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>
  print: (options: Record<string, unknown>) => Promise<boolean>
  printSilent?: (options: {
    sessionId: string
    imageBuffer?: string
    dataUrl?: string
    printerName?: string
    copies?: number
    paperSize?: string
  }) => Promise<{ success: boolean; jobId?: string; error?: string }>
  getSpoolerQueue?: () => Promise<unknown[]>
}

export interface ElectronHardwareAPI {
  onTrigger?: (callback: () => void) => () => void
}

export interface ElectronServerAPI {
  getPort: () => Promise<number>
  getAddress: () => Promise<string>
}

export interface ElectronFsAPI {
  getUserDataPath: () => Promise<string>
  getSessionsPath: () => Promise<string>
  ensureDir: (dirPath: string) => Promise<void>
  readFile: (filePath: string) => Promise<Buffer>
  writeFile: (filePath: string, data: string) => Promise<void>
  readJson: (filePath: string) => Promise<unknown>
  writeJson: (filePath: string, data: unknown) => Promise<void>
  exists: (filePath: string) => Promise<boolean>
  readDir: (dirPath: string) => Promise<string[]>
  copyFile: (src: string, dest: string) => Promise<void>
  deleteFile: (filePath: string) => Promise<void>
  deleteDir: (dirPath: string) => Promise<void>
  getFileSize: (filePath: string) => Promise<number>
  listSessions: () => Promise<unknown[]>
}

export interface ElectronShellAPI {
  openPath: (filePath: string) => Promise<void>
  showItemInFolder: (filePath: string) => Promise<void>
}

export interface ElectronCameraAPI {
  start: () => Promise<{ success: boolean; already?: boolean; error?: string }>
  stop:  () => Promise<{ success: boolean }>
  status: () => Promise<{ running: boolean }>
}

export interface ElectronDeviceModeAPI {
  get: () => Promise<string | null>
  set: (mode: string) => Promise<{ success: boolean }>
  clear: () => Promise<{ success: boolean }>
}

export interface ElectronAPI {
  fs: ElectronFsAPI
  window: ElectronWindowAPI
  print: ElectronPrintAPI
  server: ElectronServerAPI
  shell: ElectronShellAPI
  hardware?: ElectronHardwareAPI
  onHardwareTrigger?: (callback: () => void) => () => void
  camera?: ElectronCameraAPI
  deviceMode?: ElectronDeviceModeAPI
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
