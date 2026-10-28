import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // File system (Strictly Sandboxed to %APPDATA%/sessions)
  fs: {
    getUserDataPath: () => ipcRenderer.invoke('fs:getUserDataPath'),
    getSessionsPath: () => ipcRenderer.invoke('fs:getSessionsPath'),
    ensureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, data: string) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    readJson: (filePath: string) => ipcRenderer.invoke('fs:readJson', filePath),
    writeJson: (filePath: string, data: unknown) => ipcRenderer.invoke('fs:writeJson', filePath, data),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    copyFile: (src: string, dest: string) => ipcRenderer.invoke('fs:copyFile', src, dest),
    deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
    deleteDir: (dirPath: string) => ipcRenderer.invoke('fs:deleteDir', dirPath),
    getFileSize: (filePath: string) => ipcRenderer.invoke('fs:getFileSize', filePath),
    listSessions: () => ipcRenderer.invoke('fs:listSessions'),
  },
  
  // Dialog
  dialog: {
    saveFile: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:saveFile', options),
    openFile: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:openFile', options),
  },
  
  // Shell (Sandboxed)
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  },
  
  // Window & Kiosk controls
  window: {
    setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:setFullscreen', fullscreen),
    setKioskMode: (kiosk: boolean) => ipcRenderer.invoke('window:setKioskMode', kiosk),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  
  // Print & Spooler
  print: {
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
    print: (options: Electron.WebContentsPrintOptions) => ipcRenderer.invoke('print:print', options),
    printSilent: (data: { sessionId: string; dataUrl?: string; imageBuffer?: string; printerName?: string; copies?: number; paperSize?: string }) =>
      ipcRenderer.invoke('print:silent', { ...data, dataUrl: data.dataUrl || data.imageBuffer }),
    getSpoolerQueue: () => ipcRenderer.invoke('print:getSpoolerQueue'),
  },
  
  // Server & Network
  server: {
    getPort: () => ipcRenderer.invoke('server:getPort'),
    getAddress: () => ipcRenderer.invoke('server:getAddress'),
  },

  // Hardware triggers (Physical arcade button / Spacebar / Enter)
  hardware: {
    onTrigger: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('hardware:trigger', handler)
      return () => {
        ipcRenderer.removeListener('hardware:trigger', handler)
      }
    },
  },
  onHardwareTrigger: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hardware:trigger', handler)
    return () => {
      ipcRenderer.removeListener('hardware:trigger', handler)
    }
  },
  // Camera server (Pi Booth mode — auto-starts/stops camera-server.js)
  camera: {
    start: () => ipcRenderer.invoke('camera:start'),
    stop:  () => ipcRenderer.invoke('camera:stop'),
    status: () => ipcRenderer.invoke('camera:status'),
  },

  // Device mode persistence
  deviceMode: {
    get: () => ipcRenderer.invoke('deviceMode:get'),
    set: (mode: string) => ipcRenderer.invoke('deviceMode:set', mode),
    clear: () => ipcRenderer.invoke('deviceMode:clear'),
  },
}

// Expose a typed API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI

// Type declarations for renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI & {
      camera?: {
        start: () => Promise<{ success: boolean; already?: boolean; error?: string }>
        stop:  () => Promise<{ success: boolean }>
        status: () => Promise<{ running: boolean }>
      }
      deviceMode?: {
        get: () => Promise<string | null>
        set: (mode: string) => Promise<{ success: boolean }>
        clear: () => Promise<{ success: boolean }>
      }
    }
  }
}
