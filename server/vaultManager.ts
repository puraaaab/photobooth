import * as path from 'path'
import * as fs from 'fs'

export interface VaultManifest {
  ticketCode: string
  ticketId?: string
  customerName?: string
  customerPhone?: string
  planType?: number
  paymentMethod?: string
  paymentAmount?: number
  paymentStatus?: string
  createdAt: string
  updatedAt: string
  photoCount: number
  photos: string[]
  strips: string[]
  notes?: string
}

export class VaultManager {
  private baseDir: string

  constructor(dataDir: string) {
    this.baseDir = path.join(dataDir, 'tickets_vault')
    fs.mkdirSync(this.baseDir, { recursive: true })
    console.log(`[VaultManager] Media vault initialized at: ${this.baseDir}`)
  }

  public getTicketDir(ticketCode: string): string {
    const clean = ticketCode.replace(/^#/, '').trim()
    return path.join(this.baseDir, `Ticket_${clean}`)
  }

  public ensureVault(ticketCode: string): string {
    const ticketDir = this.getTicketDir(ticketCode)
    fs.mkdirSync(path.join(ticketDir, 'originals'), { recursive: true })
    fs.mkdirSync(path.join(ticketDir, 'thumbnails'), { recursive: true })
    fs.mkdirSync(path.join(ticketDir, 'strips'), { recursive: true })
    return ticketDir
  }

  public savePhoto(
    ticketCode: string,
    photoId: string,
    sourceOriginalPath: string,
    sourceThumbPath?: string
  ): { vaultOriginal: string; vaultThumb?: string } {
    const ticketDir = this.ensureVault(ticketCode)
    const originalsDir = path.join(ticketDir, 'originals')
    const thumbsDir = path.join(ticketDir, 'thumbnails')

    const ext = path.extname(sourceOriginalPath) || '.jpg'
    const existingCount = fs.readdirSync(originalsDir).length
    const filename = `photo_${String(existingCount + 1).padStart(2, '0')}_${photoId}${ext}`
    const destOriginal = path.join(originalsDir, filename)

    try {
      if (fs.existsSync(sourceOriginalPath)) {
        fs.copyFileSync(sourceOriginalPath, destOriginal)
      }
    } catch (err) {
      console.warn(`[VaultManager] Error copying photo to vault for Ticket #${ticketCode}:`, err)
    }

    let destThumb: string | undefined
    if (sourceThumbPath && fs.existsSync(sourceThumbPath)) {
      const thumbFilename = `thumb_${String(existingCount + 1).padStart(2, '0')}_${photoId}${ext}`
      destThumb = path.join(thumbsDir, thumbFilename)
      try {
        fs.copyFileSync(sourceThumbPath, destThumb)
      } catch (err) {
        console.warn(`[VaultManager] Error copying thumbnail to vault for Ticket #${ticketCode}:`, err)
      }
    }

    this.refreshManifest(ticketCode)
    return { vaultOriginal: destOriginal, vaultThumb: destThumb }
  }

  public saveStrip(
    ticketCode: string,
    filename: string,
    content: Buffer | string
  ): string {
    const ticketDir = this.ensureVault(ticketCode)
    const stripsDir = path.join(ticketDir, 'strips')
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const destPath = path.join(stripsDir, safeFilename)

    try {
      if (typeof content === 'string') {
        if (fs.existsSync(content)) {
          fs.copyFileSync(content, destPath)
        } else if (content.startsWith('data:image/')) {
          const base64Data = content.replace(/^data:image\/\w+;base64,/, '')
          fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'))
        } else {
          fs.writeFileSync(destPath, content)
        }
      } else {
        fs.writeFileSync(destPath, content)
      }
      console.log(`[VaultManager] Saved photo strip to Ticket #${ticketCode} vault: ${destPath}`)
    } catch (err) {
      console.warn(`[VaultManager] Error saving strip for Ticket #${ticketCode}:`, err)
    }

    this.refreshManifest(ticketCode)
    return destPath
  }

  public syncSessionPhotos(ticketCode: string, sessionDir: string): number {
    const originalsDir = path.join(sessionDir, 'originals')
    if (!fs.existsSync(originalsDir)) return 0

    let synced = 0
    const thumbsDir = path.join(sessionDir, 'thumbnails')
    const files = fs.readdirSync(originalsDir)

    for (const file of files) {
      const origPath = path.join(originalsDir, file)
      if (!fs.statSync(origPath).isFile()) continue

      const thumbPath = path.join(thumbsDir, file.replace(/\.[^.]+$/, '-thumb.jpg'))
      this.savePhoto(ticketCode, path.parse(file).name, origPath, fs.existsSync(thumbPath) ? thumbPath : undefined)
      synced++
    }

    // Also check session exports/strips
    const exportsDir = path.join(sessionDir, 'exports')
    if (fs.existsSync(exportsDir)) {
      for (const expFile of fs.readdirSync(exportsDir)) {
        const expPath = path.join(exportsDir, expFile)
        if (fs.statSync(expPath).isFile()) {
          this.saveStrip(ticketCode, expFile, expPath)
        }
      }
    }

    return synced
  }

  public updateManifestWithTicket(ticket: {
    code: string
    id?: string
    customerName?: string
    customerPhone?: string
    planType?: number
    paymentMethod?: string
    paymentAmount?: number
    paymentStatus?: string
    createdAt: string
    notes?: string
  }): void {
    const ticketDir = this.ensureVault(ticket.code)
    const manifestPath = path.join(ticketDir, 'ticket_manifest.json')

    const originalsDir = path.join(ticketDir, 'originals')
    const stripsDir = path.join(ticketDir, 'strips')

    const photos = fs.existsSync(originalsDir) ? fs.readdirSync(originalsDir) : []
    const strips = fs.existsSync(stripsDir) ? fs.readdirSync(stripsDir) : []

    const manifest: VaultManifest = {
      ticketCode: ticket.code,
      ticketId: ticket.id,
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      planType: ticket.planType,
      paymentMethod: ticket.paymentMethod,
      paymentAmount: ticket.paymentAmount,
      paymentStatus: ticket.paymentStatus,
      createdAt: ticket.createdAt,
      updatedAt: new Date().toISOString(),
      photoCount: photos.length,
      photos,
      strips,
      notes: ticket.notes,
    }

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    } catch (err) {
      console.warn(`[VaultManager] Error writing manifest for Ticket #${ticket.code}:`, err)
    }
  }

  public refreshManifest(ticketCode: string): void {
    const ticketDir = this.getTicketDir(ticketCode)
    const manifestPath = path.join(ticketDir, 'ticket_manifest.json')

    if (!fs.existsSync(ticketDir)) return

    let current: Partial<VaultManifest> = {}
    if (fs.existsSync(manifestPath)) {
      try {
        current = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      } catch {}
    }

    const originalsDir = path.join(ticketDir, 'originals')
    const stripsDir = path.join(ticketDir, 'strips')

    const photos = fs.existsSync(originalsDir) ? fs.readdirSync(originalsDir) : []
    const strips = fs.existsSync(stripsDir) ? fs.readdirSync(stripsDir) : []

    const updated: VaultManifest = {
      ticketCode,
      ticketId: current.ticketId,
      customerName: current.customerName,
      customerPhone: current.customerPhone,
      planType: current.planType,
      paymentMethod: current.paymentMethod,
      paymentAmount: current.paymentAmount,
      paymentStatus: current.paymentStatus,
      createdAt: current.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photoCount: photos.length,
      photos,
      strips,
      notes: current.notes,
    }

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2), 'utf-8')
    } catch {}
  }

  public getVaultInfo(ticketCode: string): {
    folderPath: string
    exists: boolean
    photos: string[]
    strips: string[]
    manifest: VaultManifest | null
  } {
    const folderPath = this.getTicketDir(ticketCode)
    if (!fs.existsSync(folderPath)) {
      return { folderPath, exists: false, photos: [], strips: [], manifest: null }
    }

    const originalsDir = path.join(folderPath, 'originals')
    const stripsDir = path.join(folderPath, 'strips')
    const manifestPath = path.join(folderPath, 'ticket_manifest.json')

    const photos = fs.existsSync(originalsDir) ? fs.readdirSync(originalsDir) : []
    const strips = fs.existsSync(stripsDir) ? fs.readdirSync(stripsDir) : []
    let manifest: VaultManifest | null = null

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      } catch {}
    }

    return { folderPath, exists: true, photos, strips, manifest }
  }
}
