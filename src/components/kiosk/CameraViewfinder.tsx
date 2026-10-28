import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'

export interface CameraViewfinderRef {
  captureFrame: () => HTMLCanvasElement | null
}

interface CameraViewfinderProps {
  deviceId?: string
  isFlashing?: boolean
  showGuides?: boolean
  onReady?: () => void
  onError?: (err: Error) => void
}

export const CameraViewfinder = forwardRef<CameraViewfinderRef, CameraViewfinderProps>(
  ({ deviceId, isFlashing = false, showGuides = true, onReady, onError }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const [streamActive, setStreamActive] = useState(false)
    const streamRef = useRef<MediaStream | null>(null)

    useEffect(() => {
      let isMounted = true

      async function startCamera() {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }

        // Try ideal 1080p without rigid min constraints that reject standard webcams
        const tryConstraints = async (videoConstraint: MediaTrackConstraints | boolean): Promise<MediaStream> => {
          return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraint,
          })
        }

        let stream: MediaStream | null = null

        try {
          // Attempt 1: HD Ideal
          stream = await tryConstraints({
            deviceId: deviceId ? { ideal: deviceId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          })
        } catch (err1) {
          console.warn('[Viewfinder] HD constraints failed, trying basic video:', err1)
          try {
            // Attempt 2: Basic video (any resolution camera supports)
            stream = await tryConstraints(true)
          } catch (err2) {
            console.error('[Viewfinder] Camera access completely failed:', err2)
            if (isMounted) {
              onError?.(err2 instanceof Error ? err2 : new Error(String(err2)))
            }
            return
          }
        }

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            if (isMounted) {
              videoRef.current?.play().catch(console.warn)
              setStreamActive(true)
              onReady?.()
            }
          }
        }
      }

      startCamera()

      return () => {
        isMounted = false
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
      }
    }, [deviceId])

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        const video = videoRef.current
        if (!video || !video.videoWidth || !video.videoHeight) return null

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        // Mirror video horizontally for natural photobooth mirror feel
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas
      },
    }))

    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirrored for natural guest selfie view
          }}
        />

        {/* Framing Guides Overlay */}
        {showGuides && streamActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 3:2 Safe framing boundary */}
            <div
              style={{
                width: '82%',
                height: '84%',
                border: '2px dashed rgba(247, 241, 234, 0.45)',
                borderRadius: '8px',
                position: 'relative',
                boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.3)',
              }}
            >
              {/* Corner brackets */}
              <div style={{ position: 'absolute', top: -2, left: -2, width: 24, height: 24, borderTop: '4px solid #fff', borderLeft: '4px solid #fff' }} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 24, height: 24, borderTop: '4px solid #fff', borderRight: '4px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: -2, left: -2, width: 24, height: 24, borderBottom: '4px solid #fff', borderLeft: '4px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderBottom: '4px solid #fff', borderRight: '4px solid #fff' }} />

              {/* Center subtle crosshair */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 20, height: 20 }}>
                <div style={{ position: 'absolute', top: 9, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.3)' }} />
                <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)' }} />
              </div>

              <div
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.65)',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  color: 'var(--color-offwhite)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Safe Area · Stay Within Frame
              </div>
            </div>
          </div>
        )}

        {/* Shutter Flash Animation */}
        {isFlashing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#ffffff',
              zIndex: 50,
              animation: 'flash-fade 0.4s ease-out forwards',
            }}
          />
        )}
      </div>
    )
  }
)

CameraViewfinder.displayName = 'CameraViewfinder'
