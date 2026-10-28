import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  Event as ElectronEvent,
  Input as ElectronInput,
  IpcMainInvokeEvent,
  SaveDialogOptions,
  OpenDialogOptions,
  WebContentsPrintOptions
} from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { startServer, stopServer } from './server/index'
import { FileSystemManager } from './fileManager'
import { FileLogger } from './logger'
import { PrintSpooler, PrintJob } from './printSpooler'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let fileManager: FileSystemManager
let logger: FileLogger
let printSpooler: PrintSpooler
let isKioskLocked = !isDev
let appIsQuitting = false
let cameraServerProcess: ChildProcess | null = null

// Device mode stored in userData (persists across reboots)
function getDeviceModePath(): string {
  return path.join(app.getPath('userData'), 'device_mode.txt')
}

function getSafeStorageDir(): string {
  return path.resolve(app.getPath('userData'), 'sessions')
}

function getSafeLogsDir(): string {
  return path.resolve(app.getPath('userData'), 'logs')
}

function assertSafePath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const allowedStorage = getSafeStorageDir()
  const allowedLogs = getSafeLogsDir()

  const isUnderStorage = resolved.startsWith(allowedStorage)
  const isUnderLogs = resolved.startsWith(allowedLogs)

  if (!isUnderStorage && !isUnderLogs) {
    logger?.security('Attempted path traversal outside allowed sandbox', { targetPath, resolved })
    throw new Error(`Access Denied: Path outside allowed sandbox (${targetPath})`)
  }
  return resolved
}

function createWindow() {
  const userDataDir = app.getPath('userData')
  const sessionsDir = getSafeStorageDir()
  fs.mkdirSync(sessionsDir, { recursive: true })
  fileManager = new FileSystemManager(sessionsDir)
  logger = new FileLogger(userDataDir)
  printSpooler = new PrintSpooler(userDataDir)

  logger.info(`Starting Photobooth Editor (isDev: ${isDev}, platform: ${process.platform})`)

  printSpooler.setExecutor(executeSilentPrint)

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 768,
    frame: isDev,
    kiosk: isKioskLocked,
    fullscreen: isKioskLocked,
    alwaysOnTop: isKioskLocked,
    titleBarStyle: isDev ? 'default' : 'hidden',
    backgroundColor: '#050d0e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,
  })

  nativeTheme.themeSource = 'dark'

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    logger.info('Main window shown to user')
  })

  // Prevent context menus in kiosk / production
  mainWindow.webContents.on('context-menu', (e: any) => {
    if (!isDev) e.preventDefault()
  })

  // Intercept keyboard events (Kiosk escape prevention & physical hardware trigger)
  mainWindow.webContents.on('before-input-event', (event: any, input: ElectronInput) => {
    // In dev mode allow DevTools
    if (isDev && input.control && input.shift && input.key.toLowerCase() === 'i') {
      return
    }

    // Hardware arcade push-button trigger via Spacebar or Enter
    if ((input.key === ' ' || input.key === 'Enter') && !input.isAutoRepeat) {
      mainWindow?.webContents.send('hardware:trigger')
    }

    // Block escape keys in kiosk / production
    if (isKioskLocked) {
      const isAltF4 = input.alt && input.key.toLowerCase() === 'f4'
      const isCtrlW = input.control && input.key.toLowerCase() === 'w'
      const isCtrlR = input.control && input.key.toLowerCase() === 'r'
      const isF11 = input.key === 'F11'
      const isF5 = input.key === 'F5'
      const isF12 = input.key === 'F12'
      const isDevTools = input.control && input.shift && input.key.toLowerCase() === 'i'

      if (isAltF4 || isCtrlW || isCtrlR || isF11 || isF5 || isF12 || isDevTools) {
        event.preventDefault()
        logger.security(`Blocked kiosk escape keystroke: ${input.key}`, { alt: input.alt, ctrl: input.control })
      }
    }
  })

  // Prevent navigation away from the application
  mainWindow.webContents.on('will-navigate', (event: any, url: string) => {
    const appUrl = isDev ? 'http://localhost:5173' : 'file://'
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      logger.warn(`Blocked navigation outside app origin: ${url}`)
    }
  })

  mainWindow.on('close', (e: any) => {
    if (!appIsQuitting && isKioskLocked) {
      e.preventDefault()
      logger.warn('Blocked window close in kiosk mode')
    } else {
      mainWindow = null
    }
  })
}

// ─── Silent Printing Executor ──────────────────────────────────────────────
async function executeSilentPrint(job: PrintJob): Promise<boolean> {
  return new Promise((resolve) => {
    let printWin: BrowserWindow | null = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const tempDir = path.join(app.getPath('temp'), 'photobooth-print')
    fs.mkdirSync(tempDir, { recursive: true })
    const tempImgPath = path.join(tempDir, `${job.id}.png`)
    const tempHtmlPath = path.join(tempDir, `${job.id}.html`)

    let imgSrc = job.dataUrl
    if (job.dataUrl.startsWith('data:image/')) {
      try {
        const base64Data = job.dataUrl.replace(/^data:image\/\w+;base64,/, '')
        fs.writeFileSync(tempImgPath, Buffer.from(base64Data, 'base64'))
        imgSrc = `file://${tempImgPath.replace(/\\/g, '/')}`
      } catch (e) {
        logger.error(`Failed to write temp print image: ${e}`)
      }
    }

    const isA5 = job.paperSize?.toLowerCase() === 'a5'
    const is4x6 = job.paperSize?.toLowerCase() === '4x6'
    const is4x5 = job.paperSize?.toLowerCase() === '4x5'
    const pageCssSize = isA5 ? 'A5 portrait' : is4x6 ? '4in 6in' : is4x5 ? '4in 5in' : 'A4 portrait'
    const electronPageSize = isA5 ? 'A5' : is4x6 ? { width: 101600, height: 152400 } : is4x5 ? { width: 101600, height: 127000 } : 'A4'

    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    @page { margin: 0; size: ${pageCssSize}; }
    html, body { width: 100vw; height: 100vh; margin: 0; padding: 0; background: #fff; overflow: hidden; }
    img { width: 100vw; height: 100vh; object-fit: fill; display: block; margin: 0; }
  </style>
</head>
<body>
  <img id="printImg" src="${imgSrc}" />
</body>
</html>`

    try {
      fs.writeFileSync(tempHtmlPath, html, 'utf-8')
      printWin.loadFile(tempHtmlPath)
    } catch {
      printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }

    const cleanup = () => {
      try { if (fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath) } catch {}
      try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath) } catch {}
    }

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!printWin) {
          cleanup()
          return resolve(false)
        }
        const printOptions: WebContentsPrintOptions = {
          silent: true,
          printBackground: true,
          deviceName: job.printerName || undefined,
          copies: job.copies || 1,
          pageSize: electronPageSize as any,
        }

        printWin.webContents.print(printOptions, (success: boolean, errorType: string) => {
          if (printWin) {
            printWin.close()
            printWin = null
          }
          cleanup()
          if (success) {
            logger.info(`Silent print succeeded for job ${job.id}`)
            resolve(true)
          } else {
            logger.error(`Silent print failed for job ${job.id}: ${errorType}`)
            resolve(false)
          }
        })
      }, 500)
    })

    printWin.webContents.once('did-fail-load', () => {
      if (printWin) {
        printWin.close()
        printWin = null
      }
      cleanup()
      logger.error(`Silent print window failed to load image for job ${job.id}`)
      resolve(false)
    })
  })
}

// ─── IPC Handlers: Sandboxed File System ────────────────────────────────────

ipcMain.handle('fs:getUserDataPath', () => app.getPath('userData'))
ipcMain.handle('fs:getSessionsPath', () => getSafeStorageDir())

ipcMain.handle('fs:ensureDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
  const safePath = assertSafePath(dirPath)
  fs.mkdirSync(safePath, { recursive: true })
})

ipcMain.handle('fs:readFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  return fs.readFileSync(safePath)
})

ipcMain.handle('fs:writeFile', async (_event: IpcMainInvokeEvent, filePath: string, data: string) => {
  const safePath = assertSafePath(filePath)
  fs.mkdirSync(path.dirname(safePath), { recursive: true })
  fs.writeFileSync(safePath, data, 'utf-8')
})

ipcMain.handle('fs:readJson', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  if (!fs.existsSync(safePath)) return null
  return JSON.parse(fs.readFileSync(safePath, 'utf-8'))
})

ipcMain.handle('fs:writeJson', async (_event: IpcMainInvokeEvent, filePath: string, data: unknown) => {
  const safePath = assertSafePath(filePath)
  fs.mkdirSync(path.dirname(safePath), { recursive: true })
  fs.writeFileSync(safePath, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('fs:exists', async (_event: IpcMainInvokeEvent, filePath: string) => {
  try {
    const safePath = assertSafePath(filePath)
    return fs.existsSync(safePath)
  } catch {
    return false
  }
})

ipcMain.handle('fs:readDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
  const safePath = assertSafePath(dirPath)
  if (!fs.existsSync(safePath)) return []
  return fs.readdirSync(safePath)
})

ipcMain.handle('fs:copyFile', async (_event: IpcMainInvokeEvent, src: string, dest: string) => {
  const safeSrc = assertSafePath(src)
  const safeDest = assertSafePath(dest)
  fs.mkdirSync(path.dirname(safeDest), { recursive: true })
  fs.copyFileSync(safeSrc, safeDest)
})

ipcMain.handle('fs:deleteFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  if (fs.existsSync(safePath)) fs.unlinkSync(safePath)
})

ipcMain.handle('fs:deleteDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
  const safePath = assertSafePath(dirPath)
  if (fs.existsSync(safePath)) fs.rmSync(safePath, { recursive: true, force: true })
})

ipcMain.handle('fs:getFileSize', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  if (!fs.existsSync(safePath)) return 0
  return fs.statSync(safePath).size
})

ipcMain.handle('fs:listSessions', async () => {
  return fileManager.listSessions()
})

// ─── Dialog operations ──────────────────────────────────────────────────────
ipcMain.handle('dialog:saveFile', async (_event: IpcMainInvokeEvent, options: SaveDialogOptions) => {
  const result = await dialog.showSaveDialog(mainWindow!, options)
  return result
})

ipcMain.handle('dialog:openFile', async (_event: IpcMainInvokeEvent, options: OpenDialogOptions) => {
  const result = await dialog.showOpenDialog(mainWindow!, options)
  return result
})

// ─── Shell operations (Sandboxed) ──────────────────────────────────────────
ipcMain.handle('shell:openPath', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  await shell.openPath(safePath)
})

ipcMain.handle('shell:showItemInFolder', async (_event: IpcMainInvokeEvent, filePath: string) => {
  const safePath = assertSafePath(filePath)
  shell.showItemInFolder(safePath)
})

// ─── Window operations ─────────────────────────────────────────────────────
ipcMain.handle('window:setFullscreen', async (_event: IpcMainInvokeEvent, fullscreen: boolean) => {
  mainWindow?.setFullScreen(fullscreen)
})

ipcMain.handle('window:setKioskMode', async (_event: IpcMainInvokeEvent, kiosk: boolean) => {
  isKioskLocked = kiosk
  mainWindow?.setKiosk(kiosk)
  if (kiosk) {
    mainWindow?.setAlwaysOnTop(true)
    mainWindow?.setMenuBarVisibility(false)
  } else {
    mainWindow?.setAlwaysOnTop(false)
    mainWindow?.setMenuBarVisibility(true)
  }
  logger.info(`Kiosk mode updated: ${kiosk}`)
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  appIsQuitting = true
  mainWindow?.close()
})

// ─── Native & Silent Printing ──────────────────────────────────────────────
ipcMain.handle('print:getPrinters', async () => {
  return mainWindow?.webContents.getPrintersAsync() ?? []
})

ipcMain.handle('print:print', async (_event: IpcMainInvokeEvent, options: WebContentsPrintOptions) => {
  return new Promise((resolve, reject) => {
    mainWindow?.webContents.print(options, (success: boolean, errorType: string) => {
      if (success) resolve(true)
      else reject(new Error(errorType))
    })
  })
})

ipcMain.handle('print:silent', async (_event: IpcMainInvokeEvent, data: { sessionId: string; dataUrl: string; printerName?: string; copies?: number; paperSize?: string }) => {
  try {
    const job = printSpooler.addJob({
      sessionId: data.sessionId,
      dataUrl: data.dataUrl,
      printerName: data.printerName,
      copies: data.copies || 1,
      paperSize: data.paperSize,
    })
    return { success: true, jobId: job.id }
  } catch (err) {
    logger.error('Failed to spool print job', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('print:getSpoolerQueue', () => {
  return printSpooler.getQueue()
})

// ─── Network Info ──────────────────────────────────────────────────────────
ipcMain.handle('server:getPort', () => 3847)
ipcMain.handle('server:getAddress', () => {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
})

// ── Camera Server (Pi Booth Mode) ────────────────────────────────────────────
ipcMain.handle('camera:start', async () => {
  if (cameraServerProcess && !cameraServerProcess.killed) {
    return { success: true, already: true }
  }
  const serverScript = isDev
    ? path.join(__dirname, '../../pi-setup/camera-server.js')
    : path.join((process as any).resourcesPath, 'camera-server.js')

  if (!fs.existsSync(serverScript)) {
    logger?.warn(`[Camera] camera-server.js not found at ${serverScript}`)
    return { success: false, error: 'camera-server.js not found' }
  }

  cameraServerProcess = spawn('node', [serverScript], {
    detached: false,
    stdio: 'pipe',
    env: { ...process.env },
  })

  cameraServerProcess.stdout?.on('data', (d: Buffer) =>
    logger?.info(`[CameraServer] ${d.toString().trim()}`)
  )
  cameraServerProcess.stderr?.on('data', (d: Buffer) =>
    logger?.warn(`[CameraServer] ${d.toString().trim()}`)
  )
  cameraServerProcess.on('exit', (code: number | null) => {
    logger?.info(`[CameraServer] Exited with code ${code}`)
    cameraServerProcess = null
  })

  logger?.info('[Camera] Camera server started')
  return { success: true }
})

ipcMain.handle('camera:stop', async () => {
  if (cameraServerProcess) {
    cameraServerProcess.kill('SIGTERM')
    cameraServerProcess = null
    logger?.info('[Camera] Camera server stopped')
  }
  return { success: true }
})

ipcMain.handle('camera:status', () => ({
  running: !!cameraServerProcess && !cameraServerProcess.killed,
}))

// ── Device Mode Persistence ───────────────────────────────────────────────────
ipcMain.handle('deviceMode:get', () => {
  const modePath = getDeviceModePath()
  if (!fs.existsSync(modePath)) return null
  return fs.readFileSync(modePath, 'utf-8').trim() || null
})

ipcMain.handle('deviceMode:set', (_event: IpcMainInvokeEvent, mode: string) => {
  fs.writeFileSync(getDeviceModePath(), mode, 'utf-8')
  logger?.info(`[DeviceMode] Mode saved: ${mode}`)
  return { success: true }
})

ipcMain.handle('deviceMode:clear', () => {
  const modePath = getDeviceModePath()
  if (fs.existsSync(modePath)) fs.unlinkSync(modePath)
  return { success: true }
})

// ─── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Start embedded Express server
  const userDataDir = app.getPath('userData')
  await startServer(userDataDir)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await stopServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  appIsQuitting = true
  if (cameraServerProcess) {
    cameraServerProcess.kill('SIGTERM')
    cameraServerProcess = null
  }
  await stopServer()
})
