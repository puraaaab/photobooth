export type AppStep = 'waiting' | 'capture' | 'select' | 'layout' | 'template' | 'editor' | 'preview' | 'export'

export interface StepItem {
  id: AppStep
  label: string
  icon: string
}

export const STEPS: StepItem[] = [
  { id: 'select', label: 'Select', icon: 'heart' },
  { id: 'layout', label: 'Layout', icon: 'film' },
  { id: 'template', label: 'Design', icon: 'palette' },
  { id: 'editor', label: 'Edit', icon: 'sparkles' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'export', label: 'Export', icon: 'printer' },
]
