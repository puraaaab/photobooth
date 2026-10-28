import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Session, SessionStatus, Photo, PhotoAssignment, Strip, LayoutConfig, Template, FilterConfig, CanvasElement, ExportSettings, PrintSettings } from '@/types'
import { getPhotoUrl } from '@/utils/photoUrl'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

interface SessionState {
  // ─── Current session ───────────────────────────────────────────────────────
  session: Session | null
  isLoading: boolean
  error: string | null
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  
  // ─── Lifecycle ────────────────────────────────────────────────────────────
  createSession: () => Promise<{ sessionId: string; sessionToken: string }>
  loadSession: (sessionId: string) => Promise<void>
  resumeSession: (sessionId: string) => Promise<void>
  setStatus: (status: SessionStatus) => void
  clearSession: () => void
  
  // ─── Photo management ─────────────────────────────────────────────────────
  addPhoto: (photo: Photo) => void
  replacePhoto: (oldPhotoId: string, newPhoto: Photo) => void
  removePhoto: (photoId: string) => void
  updatePhotoEdits: (photoId: string, edits: Partial<Photo['edits']>) => void
  toggleFavorite: (photoId: string) => void
  setSelectedPhotos: (photoIds: string[]) => void
  togglePhotoSelection: (photoId: string) => void
  selectAllPhotos: () => void
  clearPhotoSelection: () => void
  
  // ─── Assignment management ─────────────────────────────────────────────────
  setAssignments: (assignments: PhotoAssignment[]) => void
  updateAssignment: (assignment: PhotoAssignment) => void
  
  // ─── Strip management ──────────────────────────────────────────────────────
  setStrips: (strips: Strip[]) => void
  updateStrip: (stripId: string, updates: Partial<Strip>) => void
  
  // ─── Layout ───────────────────────────────────────────────────────────────
  setLayout: (layout: LayoutConfig) => void
  
  // ─── Template ─────────────────────────────────────────────────────────────
  setTemplate: (template: Template | null, applyToAllStrips?: boolean) => void
  setStripTemplate: (stripId: string, template: Template) => void
  
  // ─── Global filter ────────────────────────────────────────────────────────
  setGlobalFilter: (filter: FilterConfig | null) => void
  
  // ─── Canvas elements ───────────────────────────────────────────────────────
  setCanvasElements: (elements: CanvasElement[]) => void
  addCanvasElement: (element: CanvasElement) => void
  updateCanvasElement: (id: string, updates: Partial<CanvasElement>) => void
  removeCanvasElement: (id: string) => void
  
  // ─── Settings ────────────────────────────────────────────────────────────
  setExportSettings: (settings: Partial<ExportSettings>) => void
  setPrintSettings: (settings: Partial<PrintSettings>) => void
  
  // ─── Slot filling workflow ────────────────────────────────────────────────
  fillSlotContext: { stripIndex: number; targetCount: number; needed: number } | null
  setFillSlotContext: (ctx: { stripIndex: number; targetCount: number; needed: number } | null) => void

  // ─── Persistence ─────────────────────────────────────────────────────────
  save: () => Promise<void>
  autosave: () => void
}

const DEFAULT_PHOTO_EDITS = {
  filter: 'original',
  filterIntensity: 100,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  blur: 0,
  grain: 0,
  vignette: 0,
  fade: 0,
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null

export const useSessionStore = create<SessionState>()(
  subscribeWithSelector((set, get) => ({
    session: null,
    isLoading: false,
    error: null,
    autosaveStatus: 'idle',
    fillSlotContext: null,
    setFillSlotContext: (fillSlotContext) => set({ fillSlotContext }),

    // ─── Create new session ───────────────────────────────────────────────
    createSession: async () => {
      try {
        const res = await fetch(`${SERVER_BASE}/api/session/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ piId: 'manual', piName: 'Demo Mode' }),
        })
        if (res.ok) {
          const data = await res.json()
          await get().loadSession(data.sessionId)
          return { sessionId: data.sessionId, sessionToken: data.sessionToken }
        }
      } catch (err) {
        console.warn('[Session] Server offline, using local standalone session:', err)
      }

      // Offline / standalone demo fallback
      const fallbackId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const fallbackSession: Session = {
        id: fallbackId,
        createdAt: new Date().toISOString(),
        status: 'receiving',
        photos: [],
        selectedPhotoIds: [],
        assignments: [],
        strips: [],
        layout: { photosPerStrip: 4, stripCount: 1, arrangement: [4], orientation: 'vertical' },
        template: null,
        globalFilter: null,
        canvasElements: [],
        exportSettings: { format: 'jpeg', quality: 95, dpi: 300, colorMode: 'rgb', paperSize: '4x6' },
        printSettings: { copies: 1, paperSize: '4x6', orientation: 'portrait', margins: { top: 0, right: 0, bottom: 0, left: 0 }, dpi: 300, sheetLayout: '1up' },
        piId: 'demo',
        piName: 'Demo Standalone',
      }
      set({ session: fallbackSession, isLoading: false, error: null })
      return { sessionId: fallbackId, sessionToken: 'demo-token' }
    },

    // ─── Load session from server ──────────────────────────────────────────
    loadSession: async (sessionId: string) => {
      set({ isLoading: true, error: null })
      try {
        const res = await fetch(`${SERVER_BASE}/api/session/${sessionId}`)
        if (!res.ok) throw new Error('Session not found')
        const rawSession = await res.json()
        const session: Session = {
          ...rawSession,
          photos: (rawSession.photos || []).map((p: Photo) => {
            const rawOrig = p.originalUrl || (p.originalPath && p.sessionId ? `/sessions/${p.sessionId}/originals/${p.originalPath.split(/[/\\]/).pop()}` : '')
            return {
              ...p,
              originalUrl: rawOrig ? getPhotoUrl(rawOrig) : undefined,
              thumbnailUrl: getPhotoUrl(p.thumbnailUrl),
              previewUrl: getPhotoUrl(p.previewUrl || p.thumbnailUrl),
              edits: { ...DEFAULT_PHOTO_EDITS, ...p.edits },
            }
          }),
        }
        set({ session, isLoading: false })
      } catch (err) {
        set({ error: String(err), isLoading: false })
      }
    },

    // ─── Resume existing session ───────────────────────────────────────────
    resumeSession: async (sessionId: string) => {
      await get().loadSession(sessionId)
    },

    // ─── Status ──────────────────────────────────────────────────────────
    setStatus: (status) => {
      set(state => ({
        session: state.session ? { ...state.session, status } : null
      }))
      get().autosave()
    },

    clearSession: () => set({ session: null, fillSlotContext: null }),

    // ─── Photo management ──────────────────────────────────────────────────
    addPhoto: (photo) => {
      const rawOrig = photo.originalUrl || (photo.originalPath && photo.sessionId ? `/sessions/${photo.sessionId}/originals/${photo.originalPath.split(/[/\\]/).pop()}` : '')
      const normPhoto: Photo = {
        ...photo,
        originalUrl: rawOrig ? getPhotoUrl(rawOrig) : undefined,
        thumbnailUrl: getPhotoUrl(photo.thumbnailUrl),
        previewUrl: getPhotoUrl(photo.previewUrl || photo.thumbnailUrl),
        edits: { ...DEFAULT_PHOTO_EDITS, ...photo.edits },
      }
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              photos: [...state.session.photos, normPhoto],
            }
          : null,
      }))
    },

    replacePhoto: (oldPhotoId, newPhoto) => {
      const rawOrig = newPhoto.originalUrl || (newPhoto.originalPath && newPhoto.sessionId ? `/sessions/${newPhoto.sessionId}/originals/${newPhoto.originalPath.split(/[/\\]/).pop()}` : '')
      const normPhoto: Photo = {
        ...newPhoto,
        originalUrl: rawOrig ? getPhotoUrl(rawOrig) : undefined,
        thumbnailUrl: getPhotoUrl(newPhoto.thumbnailUrl),
        previewUrl: getPhotoUrl(newPhoto.previewUrl || newPhoto.thumbnailUrl),
        edits: { ...DEFAULT_PHOTO_EDITS, ...newPhoto.edits },
      }
      set(state => {
        if (!state.session) return {}
        const updatedPhotos = state.session.photos.map(p =>
          p.id === oldPhotoId ? normPhoto : p
        )
        const updatedSelected = state.session.selectedPhotoIds.map(id =>
          id === oldPhotoId ? newPhoto.id : id
        )
        const updatedAssignments = state.session.assignments.map(a =>
          a.photoId === oldPhotoId ? { ...a, photoId: newPhoto.id } : a
        )
        return {
          session: {
            ...state.session,
            photos: updatedPhotos,
            selectedPhotoIds: updatedSelected,
            assignments: updatedAssignments,
          },
        }
      })
      get().autosave()
    },

    removePhoto: (photoId) => {
      set(state => {
        if (!state.session) return {}
        return {
          session: {
            ...state.session,
            photos: state.session.photos.filter(p => p.id !== photoId),
            selectedPhotoIds: state.session.selectedPhotoIds.filter(id => id !== photoId),
            assignments: state.session.assignments.filter(a => a.photoId !== photoId),
          },
        }
      })
      get().autosave()
    },

    updatePhotoEdits: (photoId, edits) => {
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              photos: state.session.photos.map(p =>
                p.id === photoId ? { ...p, edits: { ...p.edits, ...edits } } : p
              ),
            }
          : null,
      }))
      get().autosave()
    },

    toggleFavorite: (photoId) => {
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              photos: state.session.photos.map(p =>
                p.id === photoId ? { ...p, isFavorite: !p.isFavorite } : p
              ),
            }
          : null,
      }))
    },

    setSelectedPhotos: (photoIds) => {
      set(state => ({
        session: state.session
          ? { ...state.session, selectedPhotoIds: photoIds }
          : null,
      }))
    },

    togglePhotoSelection: (photoId) => {
      set(state => {
        if (!state.session) return {}
        const selected = state.session.selectedPhotoIds
        const next = selected.includes(photoId)
          ? selected.filter(id => id !== photoId)
          : [...selected, photoId]
        return { session: { ...state.session, selectedPhotoIds: next } }
      })
    },

    selectAllPhotos: () => {
      set(state => ({
        session: state.session
          ? { ...state.session, selectedPhotoIds: state.session.photos.map(p => p.id) }
          : null,
      }))
    },

    clearPhotoSelection: () => {
      set(state => ({
        session: state.session
          ? { ...state.session, selectedPhotoIds: [] }
          : null,
      }))
    },

    // ─── Assignments ─────────────────────────────────────────────────────
    setAssignments: (assignments) => {
      set(state => ({
        session: state.session ? { ...state.session, assignments } : null,
      }))
      get().autosave()
    },

    updateAssignment: (assignment) => {
      set(state => {
        if (!state.session) return {}
        const existing = state.session.assignments.findIndex(a => a.slotId === assignment.slotId)
        const assignments = existing >= 0
          ? state.session.assignments.map((a, i) => i === existing ? assignment : a)
          : [...state.session.assignments, assignment]
        return { session: { ...state.session, assignments } }
      })
      get().autosave()
    },

    // ─── Strips ───────────────────────────────────────────────────────────
    setStrips: (strips) => {
      set(state => ({
        session: state.session ? { ...state.session, strips } : null,
      }))
      get().autosave()
    },

    updateStrip: (stripId, updates) => {
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              strips: state.session.strips.map(s =>
                s.id === stripId ? { ...s, ...updates } : s
              ),
            }
          : null,
      }))
      get().autosave()
    },

    // ─── Layout ──────────────────────────────────────────────────────────
    setLayout: (layout) => {
      set(state => ({
        session: state.session ? { ...state.session, layout } : null,
      }))
      get().autosave()
    },

    // ─── Template ────────────────────────────────────────────────────────
    setTemplate: (template, applyToAllStrips = true) => {
      set(state => {
        if (!state.session) return { session: null }
        const targetSlots = template?.photoSlots?.length || template?.supportedPhotoCounts?.[0]
        return {
          session: {
            ...state.session,
            template,
            strips: applyToAllStrips && state.session.strips
              ? state.session.strips.map(s => {
                  let slots = s.slots
                  if (targetSlots && targetSlots !== s.slots.length) {
                    slots = Array.from({ length: targetSlots }, (_, i) => {
                      const existing = s.slots[i]
                      const slotDef = template?.photoSlots?.[i] || existing?.slotDefinition || {
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                      }
                      return {
                        id: existing?.id || `slot-${s.id}-${i}`,
                        position: i,
                        photoId: existing?.photoId,
                        slotDefinition: slotDef,
                      }
                    })
                  }
                  return { ...s, template: template ?? undefined, slots }
                })
              : state.session.strips,
          },
        }
      })
      get().autosave()
    },

    setStripTemplate: (stripId, template) => {
      set(state => {
        if (!state.session) return { session: null }
        const targetSlots = template?.photoSlots?.length || template?.supportedPhotoCounts?.[0]
        return {
          session: {
            ...state.session,
            strips: state.session.strips.map(s => {
              if (s.id !== stripId) return s
              let slots = s.slots
              if (targetSlots && targetSlots !== s.slots.length) {
                slots = Array.from({ length: targetSlots }, (_, i) => {
                  const existing = s.slots[i]
                  const slotDef = template?.photoSlots?.[i] || existing?.slotDefinition || {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                  }
                  return {
                    id: existing?.id || `slot-${stripId}-${i}`,
                    position: i,
                    photoId: existing?.photoId,
                    slotDefinition: slotDef,
                  }
                })
              }
              return { ...s, template, slots }
            }),
          },
        }
      })
      get().autosave()
    },

    // ─── Global Filter ────────────────────────────────────────────────────
    setGlobalFilter: (filter) => {
      set(state => ({
        session: state.session ? { ...state.session, globalFilter: filter } : null,
      }))
      get().autosave()
    },

    // ─── Canvas Elements ──────────────────────────────────────────────────
    setCanvasElements: (elements) => {
      set(state => ({
        session: state.session
          ? { ...state.session, canvasElements: elements }
          : null,
      }))
      get().autosave()
    },

    addCanvasElement: (element) => {
      set(state => ({
        session: state.session
          ? { ...state.session, canvasElements: [...state.session.canvasElements, element] }
          : null,
      }))
      get().autosave()
    },

    updateCanvasElement: (id, updates) => {
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              canvasElements: state.session.canvasElements.map(el =>
                el.id === id ? { ...el, ...updates } : el
              ),
            }
          : null,
      }))
      get().autosave()
    },

    removeCanvasElement: (id) => {
      set(state => ({
        session: state.session
          ? {
              ...state.session,
              canvasElements: state.session.canvasElements.filter(el => el.id !== id),
            }
          : null,
      }))
      get().autosave()
    },

    // ─── Settings ─────────────────────────────────────────────────────────
    setExportSettings: (settings) => {
      set(state => ({
        session: state.session
          ? { ...state.session, exportSettings: { ...state.session.exportSettings, ...settings } }
          : null,
      }))
    },

    setPrintSettings: (settings) => {
      set(state => ({
        session: state.session
          ? { ...state.session, printSettings: { ...state.session.printSettings, ...settings } }
          : null,
      }))
    },

    // ─── Persistence ─────────────────────────────────────────────────────
    save: async () => {
      const { session } = get()
      if (!session) return
      
      set({ autosaveStatus: 'saving' })
      try {
        await fetch(`${SERVER_BASE}/api/session/${session.id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...session,
            autosaveAt: new Date().toISOString(),
          }),
        })
        set({ autosaveStatus: 'saved' })
        setTimeout(() => set({ autosaveStatus: 'idle' }), 2000)
      } catch {
        set({ autosaveStatus: 'error' })
      }
    },

    autosave: () => {
      if (autosaveTimer) clearTimeout(autosaveTimer)
      autosaveTimer = setTimeout(() => {
        get().save()
      }, 2000) // Save 2s after last change
    },
  }))
)
