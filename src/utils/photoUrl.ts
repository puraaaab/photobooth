/**
 * Universal Photo URL Resolver
 * Resolves relative /sessions/... paths and localhost:3847 URLs into fully accessible
 * URLs for any connected device (mobile phone on LAN, tablet, laptop, or Raspberry Pi).
 */
export function getPhotoUrl(rawUrl?: string): string {
  if (!rawUrl) return ''

  // 1. Data URLs and Blob URLs are already local in-memory
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return rawUrl
  }

  if (typeof window !== 'undefined') {
    const currentHostname = window.location.hostname || 'localhost'

    // 2. If it points to localhost or 127.0.0.1:3847, but we are on a remote client (e.g. phone over LAN):
    if (rawUrl.startsWith('http://localhost:3847') || rawUrl.startsWith('http://127.0.0.1:3847')) {
      return rawUrl.replace(/http:\/\/(localhost|127\.0\.0\.1):3847/, `http://${currentHostname}:3847`)
    }

    // 3. If it's a relative URL starting with /sessions/:
    if (rawUrl.startsWith('/sessions/')) {
      return `http://${currentHostname}:3847${rawUrl}`
    }

    // 4. API endpoints on backend
    if (rawUrl.startsWith('/api/')) {
      return `http://${currentHostname}:3847${rawUrl}`
    }

    // 5. Frontend public assets (/templates/, /stickers/, /papit.png, /icons/, etc.)
    // MUST NOT be routed to backend port 3847!
    return rawUrl
  }

  return rawUrl
}
