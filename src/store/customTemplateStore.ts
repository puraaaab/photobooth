import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Template } from '@/types'

interface CustomTemplateState {
  userTemplates: Template[]
  hiddenTemplateIds: string[]
  addUserTemplate: (template: Template) => void
  removeUserTemplate: (id: string) => void
  getUserTemplate: (id: string) => Template | undefined
  toggleHideTemplate: (id: string) => void
  hideTemplates: (ids: string[]) => void
  unhideTemplates: (ids: string[]) => void
}

export const useCustomTemplateStore = create<CustomTemplateState>()(
  persist(
    (set, get) => ({
      userTemplates: [],
      hiddenTemplateIds: [],
      addUserTemplate: (template) => {
        set((state) => ({
          userTemplates: [template, ...state.userTemplates.filter(t => t.id !== template.id)],
        }))
      },
      removeUserTemplate: (id) => {
        set((state) => ({
          userTemplates: state.userTemplates.filter(t => t.id !== id),
        }))
      },
      getUserTemplate: (id) => {
        return get().userTemplates.find(t => t.id === id)
      },
      toggleHideTemplate: (id) => {
        set((state) => ({
          hiddenTemplateIds: state.hiddenTemplateIds.includes(id)
            ? state.hiddenTemplateIds.filter(hid => hid !== id)
            : [...state.hiddenTemplateIds, id],
        }))
      },
      hideTemplates: (ids) => {
        set((state) => ({
          hiddenTemplateIds: Array.from(new Set([...state.hiddenTemplateIds, ...ids])),
        }))
      },
      unhideTemplates: (ids) => {
        set((state) => ({
          hiddenTemplateIds: state.hiddenTemplateIds.filter(hid => !ids.includes(hid)),
        }))
      },
    }),
    {
      name: 'photobooth-user-templates',
    }
  )
)
