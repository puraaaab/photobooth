import { create } from 'zustand'
import type { HistoryCommand, HistoryCommandType } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const MAX_HISTORY = 100

// External undo/redo handlers — registered by EditorScreen so footer can call them
let _executeUndo: (() => void) | null = null
let _executeRedo: (() => void) | null = null

export function registerUndoHandler(fn: () => void) { _executeUndo = fn }
export function registerRedoHandler(fn: () => void) { _executeRedo = fn }
export function callUndoHandler() { _executeUndo?.() }
export function callRedoHandler() { _executeRedo?.() }

interface HistoryState {
  past: HistoryCommand[]
  future: HistoryCommand[]
  
  // Push a new command (clears future)
  push: (
    type: HistoryCommandType,
    description: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ) => void
  
  // Undo: returns command to reverse
  undo: () => HistoryCommand | null
  
  // Redo: returns command to re-apply
  redo: () => HistoryCommand | null
  
  // Clear all history
  clear: () => void
  
  // Computed
  canUndo: () => boolean
  canRedo: () => boolean
  getLastDescription: () => string | null
  getNextDescription: () => string | null
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  push: (type, description, before, after) => {
    const command: HistoryCommand = {
      id: uuidv4(),
      type,
      timestamp: new Date().toISOString(),
      description,
      before,
      after,
    }
    
    set(state => ({
      past: [...state.past.slice(-MAX_HISTORY + 1), command],
      future: [], // Clear redo stack on new action
    }))
  },

  undo: () => {
    const { past } = get()
    if (past.length === 0) return null
    
    const command = past[past.length - 1]
    set(state => ({
      past: state.past.slice(0, -1),
      future: [command, ...state.future.slice(0, MAX_HISTORY - 1)],
    }))
    
    return command
  },

  redo: () => {
    const { future } = get()
    if (future.length === 0) return null
    
    const command = future[0]
    set(state => ({
      past: [...state.past.slice(-MAX_HISTORY + 1), command],
      future: state.future.slice(1),
    }))
    
    return command
  },

  clear: () => set({ past: [], future: [] }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  getLastDescription: () => {
    const { past } = get()
    return past.length > 0 ? past[past.length - 1].description : null
  },
  getNextDescription: () => {
    const { future } = get()
    return future.length > 0 ? future[0].description : null
  },
}))
