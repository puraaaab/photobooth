import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, KeyRound, Monitor, HardDrive, Wifi, Shield,
  X, Check, AlertTriangle, RefreshCw, Trash2, Printer,
  BarChart3, Share2, Download, Sliders, Camera, Delete
} from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useConnectionStore } from '@/store/connectionStore'
import { showToast } from '@/components/ui/Toast'
import type { CameraSource } from '@/types'

interface AdminPanelModalProps {
  isOpen: boolean
  onClose: () => void
}

type AdminTab = 'kiosk' | 'storage' | 'hardware' | 'printer' | 'sharing' | 'analytics' | 'security'

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const {
    settings,
    isAdminAuthenticated,
    isLockedOut,
    getRemainingLockoutSeconds,
    updateKiosk,
    updateRetention,
    updatePrinterRoll,
    updateSmtp,
    updateTwilio,
    verifyAdminPin,
    setAdminPin,
    setAdminAuthenticated,
    resetToDefaults,
    resetAnalytics,
  } = useSettingsStore()

  const { server, pi, socket } = useConnectionStore()

  // PIN entry state
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [lockoutSec, setLockoutSec] = useState(0)
  const [activeTab, setActiveTab] = useState<AdminTab>('kiosk')

  // New PIN state
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Sessions state
  const [sessionsList, setSessionsList] = useState<Array<{ id: string; photos?: unknown[]; createdAt: string; status: string }>>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [cleaningStorage, setCleaningStorage] = useState(false)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Video devices state
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])

  // Lockout timer updater
  useEffect(() => {
    const updateLockout = () => {
      setLockoutSec(getRemainingLockoutSeconds())
    }
    updateLockout()
    const timer = setInterval(updateLockout, 1000)
    return () => clearInterval(timer)
  }, [getRemainingLockoutSeconds])

  useEffect(() => {
    if (isOpen && isAdminAuthenticated) {
      loadSessions()
      loadVideoDevices()
    }
  }, [isOpen, isAdminAuthenticated])

  const loadVideoDevices = async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices()
        setVideoDevices(devs.filter(d => d.kind === 'videoinput'))
      }
    } catch (err) {
      console.warn('Could not enumerate video devices:', err)
    }
  }

  const loadSessions = async () => {
    setLoadingSessions(true)
    try {
      const res = await fetch('/api/session', {
        headers: { 'x-admin-auth': 'kiosk-local' },
      })
      if (res.ok) {
        const data = await res.json()
        setSessionsList(data.sessions || [])
      }
    } catch {
      // Offline/fallback
    } finally {
      setLoadingSessions(false)
    }
  }

  const handlePinDigit = (digit: string) => {
    if (isLockedOut()) return
    if (pinInput.length < 4) {
      const next = pinInput + digit
      setPinInput(next)
      setPinError(false)
      if (next.length === 4) {
        const ok = verifyAdminPin(next)
        if (!ok) {
          setPinError(true)
          setTimeout(() => setPinInput(''), 600)
        }
      }
    }
  }

  const handlePinBackspace = () => {
    if (isLockedOut()) return
    setPinInput(prev => prev.slice(0, -1))
    setPinError(false)
  }

  const handlePinClear = () => {
    if (isLockedOut()) return
    setPinInput('')
    setPinError(false)
  }

  const handleToggleFullscreen = async () => {
    if (window.electronAPI?.window) {
      const next = !isFullscreen
      await window.electronAPI.window.setFullscreen(next)
      setIsFullscreen(next)
    } else {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => {})
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen().catch(() => {})
        setIsFullscreen(false)
      }
    }
  }

  const handleSaveNewPin = () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      showToast('PIN must be exactly 4 digits.', 'error')
      return
    }
    if (newPin !== confirmPin) {
      showToast('PINs do not match.', 'error')
      return
    }
    setAdminPin(newPin)
    setNewPin('')
    setConfirmPin('')
    showToast('New salted admin PIN has been updated.', 'success')
  }

  const handleCleanOldSessions = async () => {
    setCleaningStorage(true)
    try {
      const res = await fetch('/api/session/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: settings.retention.keepSessionsDays }),
      })
      if (res.ok) {
        const data = await res.json()
        const mb = ((data.reclaimedBytes || 0) / (1024 * 1024)).toFixed(1)
        showToast(`Cleaned ${data.deletedCount} old session(s) (${mb} MB reclaimed).`, 'success')
        loadSessions()
      } else {
        showToast('Storage cleanup encountered an error.', 'error')
      }
    } catch {
      showToast('Could not reach cleanup endpoint.', 'error')
    } finally {
      setCleaningStorage(false)
    }
  }

  const handleLockAdmin = () => {
    setAdminAuthenticated(false)
    setPinInput('')
    onClose()
  }

  const exportAnalyticsCsv = () => {
    const a = settings.analytics
    const csvContent =
      `data:text/csv;charset=utf-8,` +
      `Metric,Value\n` +
      `Total Sessions,${a.totalSessions}\n` +
      `Total Photos Captured,${a.totalPhotos}\n` +
      `Total Prints Completed,${a.totalPrints}\n` +
      `Prints Remaining on Roll,${settings.printerRoll.printsRemaining}\n` +
      `QR Scans,${a.qrScans}\n` +
      `Emails Sent,${a.emailsSent}\n` +
      `SMS Sent,${a.smsSent}\n` +
      `Last Reset,${a.lastResetAt}\n`

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `photobooth_event_analytics_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Analytics CSV exported successfully.', 'success')
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(5, 5, 8, 0.88)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          style={{
            background: 'var(--color-bg, #F7F1EA)',
            border: '2px solid var(--color-brand)',
            borderRadius: 'var(--radius-xl, 16px)',
            width: '100%',
            maxWidth: isAdminAuthenticated ? '920px' : '400px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(43, 5, 16, 0.4)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-surface, #EFE8DE)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'rgba(109, 6, 38, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-brand)',
                }}
              >
                <Shield size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-brand)' }}>
                  Commercial Appliance Administration
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  Hardware, Security, Print & Operations
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isAdminAuthenticated && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleLockAdmin}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <Lock size={14} />
                  Lock
                </button>
              )}
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          {!isAdminAuthenticated ? (
            /* PIN Pad (Protected against brute-force) */
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: pinError || lockoutSec > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(109, 6, 38, 0.12)',
                  color: pinError || lockoutSec > 0 ? '#ef4444' : 'var(--color-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <KeyRound size={22} />
              </div>

              <h4 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-primary)' }}>
                {lockoutSec > 0 ? 'Admin Panel Locked Out' : 'Authorized Personnel Only'}
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
                {lockoutSec > 0
                  ? `Too many failed attempts. Try again in ${lockoutSec}s.`
                  : 'Enter 4-digit security PIN to unlock kiosk configuration.'}
              </p>

              {/* PIN Dots */}
              {lockoutSec === 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '28px' }}>
                  {[0, 1, 2, 3].map((i) => {
                    const filled = pinInput.length > i
                    return (
                      <div
                        key={i}
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: `2px solid ${pinError ? '#ef4444' : filled ? 'var(--color-brand)' : 'var(--color-border-strong)'}`,
                          background: filled ? (pinError ? '#ef4444' : 'var(--color-brand)') : 'transparent',
                          transition: 'all 0.15s ease',
                        }}
                      />
                    )
                  })}
                </div>
              )}

              {/* Touch Numpad */}
              {lockoutSec === 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '260px', margin: '0 auto' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'backspace'].map((k) => (
                    <button
                      key={k}
                      className="btn btn-secondary"
                      onClick={() => {
                        if (k === 'C') handlePinClear()
                        else if (k === 'backspace') handlePinBackspace()
                        else handlePinDigit(k)
                      }}
                      style={{
                        height: '52px',
                        fontSize: '18px',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-lg, 12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {k === 'backspace' ? <Delete size={20} /> : k}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)', margin: '0 auto', maxWidth: '280px' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#ef4444' }}>
                    {lockoutSec}s
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Admin Tabs */
            <div style={{ display: 'flex', flex: 1, minHeight: '480px', overflow: 'hidden' }}>
              {/* Sidebar Tabs */}
              <div
                style={{
                  width: '210px',
                  borderRight: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  padding: '14px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                {[
                  { id: 'kiosk', label: 'Kiosk & Flow', icon: Monitor },
                  { id: 'hardware', label: 'Camera & Live Stream', icon: Camera },
                  { id: 'printer', label: 'Printer & Dye-Sub', icon: Printer },
                  { id: 'storage', label: 'Storage Retention', icon: HardDrive },
                  { id: 'sharing', label: 'Email & SMS (Twilio)', icon: Share2 },
                  { id: 'analytics', label: 'Event Analytics', icon: BarChart3 },
                  { id: 'security', label: 'Security & PIN', icon: Shield },
                ].map((tab) => {
                  const Icon = tab.icon
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as AdminTab)}
                      className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                      style={{
                        justifyContent: 'flex-start',
                        gap: '10px',
                        fontSize: '12px',
                        padding: '10px 12px',
                        textAlign: 'left',
                        borderRadius: 'var(--radius-md, 8px)',
                      }}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                {activeTab === 'kiosk' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Kiosk Mode & Workflow Behavior
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Control guest timeouts, auto-reset, fullscreen presentation, and privacy consent.
                      </p>
                    </div>

                    {/* Kiosk Mode Toggle */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Enforce Kiosk Lockdown</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Hides taskbar/desktop, intercepts Alt+F4, and keeps window always on top
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.kiosk.enabled}
                        onChange={(e) => updateKiosk({ enabled: e.target.checked })}
                        style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                    </div>

                    {/* Fullscreen Button */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Fullscreen Display Mode</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Toggle native borderless presentation
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={handleToggleFullscreen}>
                        {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                      </button>
                    </div>

                    {/* Camera Source Selector */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Capture Pipeline Source</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Choose whether booth captures from local webcam or remote Raspberry Pi network
                        </div>
                      </div>
                      <select
                        value={settings.kiosk.cameraSource}
                        onChange={(e) => updateKiosk({ cameraSource: e.target.value as CameraSource })}
                        className="input"
                        style={{ width: '160px', padding: '6px' }}
                      >
                        <option value="webcam">Live Webcam / USB</option>
                        <option value="pi_network">Remote Pi Network</option>
                        <option value="demo">Demo Simulation</option>
                      </select>
                    </div>

                    {/* Session Shoot Mode */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Shoot Session Mode</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Timed 60-Second Marathon (30 photos @ 1 photo/2s) vs Standard
                        </div>
                      </div>
                      <select
                        value={settings.kiosk.captureMode || 'timed_session'}
                        onChange={(e) => updateKiosk({ captureMode: e.target.value as 'timed_session' | 'standard' })}
                        className="select"
                        style={{ fontSize: '12px' }}
                      >
                        <option value="timed_session">60s Marathon (30 Photos @ 1 shot/2s)</option>
                        <option value="standard">Standard (4 Fixed Photos)</option>
                      </select>
                    </div>

                    {/* Timed Session Duration Slider */}
                    {(settings.kiosk.captureMode !== 'standard') && (
                      <>
                        <div className="admin-field-row">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>Marathon Duration</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                              Total photoshoot time in seconds
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>{settings.kiosk.sessionDurationSeconds || 60}s</span>
                            <input
                              type="range"
                              min="30"
                              max="120"
                              step="5"
                              value={settings.kiosk.sessionDurationSeconds || 60}
                              onChange={(e) => {
                                const dur = Number(e.target.value)
                                const int = settings.kiosk.intervalBetweenShotsSeconds || 2
                                updateKiosk({ sessionDurationSeconds: dur, photoCountPerSession: Math.floor(dur / int) })
                              }}
                            />
                          </div>
                        </div>

                        <div className="admin-field-row">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>Interval Between Shots</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                              Shots taken every {settings.kiosk.intervalBetweenShotsSeconds || 2} seconds
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>{settings.kiosk.intervalBetweenShotsSeconds || 2}s</span>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="1"
                              value={settings.kiosk.intervalBetweenShotsSeconds || 2}
                              onChange={(e) => {
                                const int = Number(e.target.value)
                                const dur = settings.kiosk.sessionDurationSeconds || 60
                                updateKiosk({ intervalBetweenShotsSeconds: int, photoCountPerSession: Math.floor(dur / int) })
                              }}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            background: 'rgba(109, 6, 38, 0.08)',
                            border: '1px solid var(--color-border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: 'var(--color-brand)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          <span>Session Output:</span>
                          <strong>
                            {Math.floor((settings.kiosk.sessionDurationSeconds || 60) / (settings.kiosk.intervalBetweenShotsSeconds || 2))} Photos / Run
                          </strong>
                        </div>
                      </>
                    )}

                    {/* Countdown Seconds (for standard mode) */}
                    {settings.kiosk.captureMode === 'standard' && (
                      <div className="admin-field-row">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>Countdown Timer</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                            Seconds before each shutter capture
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span>{settings.kiosk.cameraCountdownSeconds}s</span>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={settings.kiosk.cameraCountdownSeconds}
                            onChange={(e) => updateKiosk({ cameraCountdownSeconds: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    )}

                    {/* Inactivity Timeout Slider */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Inactivity Timeout</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Auto-reset booth to start screen when guest walks away
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{settings.kiosk.idleTimeoutSeconds}s</span>
                        <input
                          type="range"
                          min="20"
                          max="300"
                          step="10"
                          value={settings.kiosk.idleTimeoutSeconds}
                          onChange={(e) => updateKiosk({ idleTimeoutSeconds: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    {/* GDPR / Privacy Terms Consent */}
                    <div className="admin-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>Require Privacy / Photo Consent</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                            Displays a mandatory consent agreement before starting capture
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.kiosk.requireConsent}
                          onChange={(e) => updateKiosk({ requireConsent: e.target.checked })}
                          style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                        />
                      </div>
                      {settings.kiosk.requireConsent && (
                        <input
                          type="text"
                          value={settings.kiosk.consentText}
                          onChange={(e) => updateKiosk({ consentText: e.target.value })}
                          className="input"
                          style={{ width: '100%', fontSize: '12px' }}
                          placeholder="Consent disclaimer text..."
                        />
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'hardware' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Live Camera & Peripheral Integration
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Select physical camera device, configure manual exposure lock, and test network trigger.
                      </p>
                    </div>

                    {/* Video Device Picker */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>WebRTC Video Input Device</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          USB webcam, Cam Link, or virtual DSLR capture card
                        </div>
                      </div>
                      <select
                        value={settings.kiosk.cameraDeviceId || ''}
                        onChange={(e) => updateKiosk({ cameraDeviceId: e.target.value })}
                        className="input"
                        style={{ maxWidth: '240px', fontSize: '12px' }}
                      >
                        <option value="">System Default Camera</option>
                        {videoDevices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Network Pi Status */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div className="admin-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: pi.connected ? '#34d399' : '#ef4444' }} />
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>Raspberry Pi Link</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                          Status: {pi.connected ? 'Active WebSocket' : 'Offline'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)', marginTop: 2 }}>
                          IP: {pi.ipAddress || 'None'}
                        </div>
                      </div>

                      <div className="admin-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: socket.connected ? '#34d399' : '#eab308' }} />
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>Embedded Server</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                          Port: {server.port} · Address: {server.address}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)', marginTop: 2 }}>
                          Remote Trigger Route: <code>POST /api/trigger/start</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/health')
                            if (res.ok) showToast('Backend HTTP & WebSocket is healthy.', 'success')
                          } catch {
                            showToast('Server is currently unreachable.', 'error')
                          }
                        }}
                      >
                        Ping Health Route
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          if (window.electronAPI?.print) {
                            const printers = await window.electronAPI.print.getPrinters()
                            showToast(`Detected ${printers.length} installed system printer(s).`, 'info')
                          }
                        }}
                      >
                        Enumerate System Printers
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'printer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Commercial Printer & Media Tracking
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Manage dye-sublimation media roll counts, auto-stop on out-of-paper, and color calibration.
                      </p>
                    </div>

                    {/* Roll Tracker */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>Total Roll Capacity</div>
                        <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>
                          {settings.printerRoll.totalMediaCapacity}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>Prints Completed</div>
                        <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0', color: '#34d399' }}>
                          {settings.printerRoll.printsUsed}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>Prints Remaining</div>
                        <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0', color: settings.printerRoll.printsRemaining < 30 ? '#ef4444' : '#eab308' }}>
                          {settings.printerRoll.printsRemaining}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          updatePrinterRoll({ printsRemaining: settings.printerRoll.totalMediaCapacity, printsUsed: 0 })
                          showToast('Printer media roll count reset to capacity.', 'success')
                        }}
                      >
                        Reset Media Roll Counter (New Paper/Ribbon)
                      </button>
                    </div>

                    {/* Dye-Sub Gamma & Calibration */}
                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Print Gamma Calibration Curve</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Adjust tonal curve to prevent dark/muddy prints on dye-sub paper (0.7 to 1.3)
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{settings.printerRoll.dyeSubGamma.toFixed(2)}</span>
                        <input
                          type="range"
                          min="0.70"
                          max="1.30"
                          step="0.05"
                          value={settings.printerRoll.dyeSubGamma}
                          onChange={(e) => updatePrinterRoll({ dyeSubGamma: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Print Brightness Compensation</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Direct print exposure offset (-30 to +30)
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{settings.printerRoll.dyeSubBrightness}</span>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          step="2"
                          value={settings.printerRoll.dyeSubBrightness}
                          onChange={(e) => updatePrinterRoll({ dyeSubBrightness: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'storage' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Sessions & Automated Retention Cleanup
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Purge old event photos automatically to prevent storage exhaustion.
                      </p>
                    </div>

                    <div className="admin-field-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>Auto-Retention Threshold</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary, #6e8e91)' }}>
                          Delete guest sessions older than this threshold
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>{settings.retention.keepSessionsDays} Days</span>
                        <input
                          type="range"
                          min="1"
                          max="90"
                          value={settings.retention.keepSessionsDays}
                          onChange={(e) => updateRetention({ keepSessionsDays: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCleanOldSessions}
                        disabled={cleaningStorage}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Trash2 size={14} />
                        {cleaningStorage ? 'Cleaning...' : 'Run Retention Cleanup Now'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={loadSessions}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <RefreshCw size={14} />
                        Refresh List ({sessionsList.length})
                      </button>
                    </div>

                    {/* Sessions list */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #1a3336', borderRadius: '8px', background: 'rgba(0,10,12,0.5)' }}>
                      {sessionsList.map(s => (
                        <div key={s.id} style={{ padding: '8px 12px', borderBottom: '1px solid #1a3336', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span>{s.id}</span>
                          <span style={{ color: '#6e8e91' }}>{new Date(s.createdAt).toLocaleDateString()} · {s.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'sharing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Digital Delivery: SMTP Email & Twilio SMS
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Configure credentials for emailing and texting photo strips to guests.
                      </p>
                    </div>

                    {/* SMTP config */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'rgba(0,30,32,0.3)', borderRadius: 10, border: '1px solid #1a3336' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>SMTP Email Server Settings</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="SMTP Host (e.g. smtp.sendgrid.net)"
                          value={settings.smtp.host}
                          onChange={(e) => updateSmtp({ host: e.target.value })}
                          className="input"
                        />
                        <input
                          type="number"
                          placeholder="Port (587)"
                          value={settings.smtp.port}
                          onChange={(e) => updateSmtp({ port: Number(e.target.value) })}
                          className="input"
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="SMTP Username / API Key"
                          value={settings.smtp.user}
                          onChange={(e) => updateSmtp({ user: e.target.value })}
                          className="input"
                        />
                        <input
                          type="password"
                          placeholder="SMTP Password"
                          value={settings.smtp.pass}
                          onChange={(e) => updateSmtp({ pass: e.target.value })}
                          className="input"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="From Address (e.g. photos@yourbrand.com)"
                        value={settings.smtp.from}
                        onChange={(e) => updateSmtp({ from: e.target.value })}
                        className="input"
                      />
                    </div>

                    {/* Twilio SMS config */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'rgba(0,30,32,0.3)', borderRadius: 10, border: '1px solid #1a3336' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Twilio SMS Gateway Settings</div>
                      <input
                        type="text"
                        placeholder="Twilio Account SID"
                        value={settings.twilio.accountSid}
                        onChange={(e) => updateTwilio({ accountSid: e.target.value })}
                        className="input"
                      />
                      <input
                        type="password"
                        placeholder="Twilio Auth Token"
                        value={settings.twilio.authToken}
                        onChange={(e) => updateTwilio({ authToken: e.target.value })}
                        className="input"
                      />
                      <input
                        type="text"
                        placeholder="Twilio From Phone (+1XXXXXXXXXX)"
                        value={settings.twilio.fromNumber}
                        onChange={(e) => updateTwilio({ fromNumber: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'analytics' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Event Usage Analytics & Metrics
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Live aggregated counters for this activation.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>Total Sessions</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#fff' }}>
                          {settings.analytics.totalSessions}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>Photos Captured</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#fff' }}>
                          {settings.analytics.totalPhotos}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>Prints Dispatched</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#34d399' }}>
                          {settings.analytics.totalPrints}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>QR Code Scans</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#eab308' }}>
                          {settings.analytics.qrScans}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>Emails Delivered</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#38bdf8' }}>
                          {settings.analytics.emailsSent}
                        </div>
                      </div>
                      <div className="admin-card">
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>SMS Delivered</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#a855f7' }}>
                          {settings.analytics.smsSent}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={exportAnalyticsCsv} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Download size={14} />
                        Export Metrics to CSV
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (window.confirm('Reset all session and sharing analytics for a new event?')) {
                            resetAnalytics()
                            showToast('Event metrics reset to zero.', 'info')
                          }
                        }}
                      >
                        Reset Event Analytics
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Security & Credentials
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ebec2)' }}>
                        Update the salted 4-digit administrative unlock PIN.
                      </p>
                    </div>

                    <div style={{ padding: '16px', background: 'rgba(0,30,32,0.3)', borderRadius: '10px', border: '1px solid #1a3336', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Change Security PIN</div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="New 4-digit PIN"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                          className="input"
                          style={{ width: '150px', textAlign: 'center', letterSpacing: '4px', fontSize: '15px' }}
                        />
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="Confirm PIN"
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                          className="input"
                          style={{ width: '150px', textAlign: 'center', letterSpacing: '4px', fontSize: '15px' }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveNewPin}
                          disabled={newPin.length !== 4 || confirmPin.length !== 4}
                        >
                          Update PIN
                        </button>
                      </div>
                    </div>

                    <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#ef4444' }}>Reset Factory Defaults</div>
                        <div style={{ fontSize: '11px', color: '#6e8e91' }}>
                          Restores initial settings, resets PIN, and clears offline spools
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (window.confirm('Reset all application settings to defaults?')) {
                            resetToDefaults()
                            showToast('Factory settings restored.', 'info')
                            onClose()
                          }
                        }}
                      >
                        Reset Defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
