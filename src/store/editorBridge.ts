/**
 * editorBridge.ts
 * Lightweight bridge so App.tsx can call EditorScreen internal actions
 * (e.g. "advance to next strip before moving to next app step").
 */

/** Registered by EditorScreen; returns true if it consumed the "next" action */
let _nextInterceptor: (() => boolean) | null = null

export function registerEditorNextInterceptor(fn: () => boolean) {
  _nextInterceptor = fn
}

export function clearEditorNextInterceptor() {
  _nextInterceptor = null
}

/** Returns true if EditorScreen consumed the next action (caller should NOT advance step) */
export function tryEditorNextInterceptor(): boolean {
  if (_nextInterceptor) return _nextInterceptor()
  return false
}

/** Registered by TemplateScreen; returns true if it consumed the "next" action */
let _templateNextInterceptor: (() => boolean) | null = null
let _templateBackInterceptor: (() => boolean) | null = null

export function registerTemplateNextInterceptor(fn: () => boolean) {
  _templateNextInterceptor = fn
}

export function clearTemplateNextInterceptor() {
  _templateNextInterceptor = null
}

export function tryTemplateNextInterceptor(): boolean {
  if (_templateNextInterceptor) return _templateNextInterceptor()
  return false
}

export function registerTemplateBackInterceptor(fn: () => boolean) {
  _templateBackInterceptor = fn
}

export function clearTemplateBackInterceptor() {
  _templateBackInterceptor = null
}

export function tryTemplateBackInterceptor(): boolean {
  if (_templateBackInterceptor) return _templateBackInterceptor()
  return false
}
