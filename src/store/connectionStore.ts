import { create } from 'zustand'
import type { PiConnectionStatus, ServerStatus } from '@/types'

interface ConnectionState {
  server: ServerStatus
  pi: PiConnectionStatus
  socket: {
    connected: boolean
    error: string | null
  }
  
  setServerStatus: (status: Partial<ServerStatus>) => void
  setPiStatus: (status: Partial<PiConnectionStatus>) => void
  setSocketConnected: (connected: boolean, error?: string | null) => void
  recordPhotoReceived: () => void
  recordLatency: (ms: number) => void
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  server: {
    running: false,
    port: 3847,
    address: '',
  },
  pi: {
    connected: false,
    photosReceived: 0,
  },
  socket: {
    connected: false,
    error: null,
  },

  setServerStatus: (status) =>
    set(state => ({ server: { ...state.server, ...status } })),

  setPiStatus: (status) =>
    set(state => ({ pi: { ...state.pi, ...status } })),

  setSocketConnected: (connected, error = null) =>
    set(state => ({ socket: { ...state.socket, connected, error } })),

  recordPhotoReceived: () =>
    set(state => ({
      pi: {
        ...state.pi,
        photosReceived: state.pi.photosReceived + 1,
        lastPhotoAt: new Date().toISOString(),
      },
    })),

  recordLatency: (ms) =>
    set(state => ({ pi: { ...state.pi, latencyMs: ms } })),
}))
