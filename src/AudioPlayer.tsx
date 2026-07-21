import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ChevronLeft, ChevronRight
} from 'lucide-react'

export type AudioPlayerProps = {
  audioUrl: string | null
  title: string
  subtitle?: string
  duration?: number
  initialPosition?: number
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
  onError?: (message: string) => void
  episodeId?: string
  previousDisabled?: boolean
  nextDisabled?: boolean
  onPrevious?: () => void
  onNext?: () => void
}

type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

const speeds = [0.75, 1, 1.25, 1.5, 2]

function formatTime(seconds: number): string {
  const value = Math.max(seconds, 0)
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.floor(value % 60)
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({
  audioUrl,
  title,
  subtitle,
  duration: propDuration = 0,
  initialPosition = 0,
  onProgress,
  onEnded,
  onError,
  episodeId,
  previousDisabled = false,
  nextDisabled = false,
  onPrevious,
  onNext
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressRef = useRef<HTMLInputElement | null>(null)
  const progressInterval = useRef<number | null>(null)
  const [state, setState] = useState<AudioState>('idle')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(propDuration)
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveDuration = duration || propDuration

  const clearProgressInterval = useCallback(() => {
    if (progressInterval.current) {
      window.clearInterval(progressInterval.current)
      progressInterval.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = () => {
      setDuration(Math.floor(audio.duration))
      if (initialPosition > 0) audio.currentTime = initialPosition
      setState('ready')
    }

    const onPlay = () => {
      setState('playing')
      startProgressTracking()
    }

    const onPause = () => {
      if (!audio.ended) setState('paused')
      clearProgressInterval()
    }

    const onTimeUpdate = () => {
      setPosition(Math.floor(audio.currentTime))
    }

    const onEndedHandler = () => {
      setState('paused')
      clearProgressInterval()
      setPosition(0)
      if (onEnded) onEnded()
    }

    const onCanPlay = () => {
      if (state !== 'playing') setState('ready')
    }

    const onWaiting = () => {
      if (state === 'playing') setState('loading')
    }

    const onErrorHandler = () => {
      const mediaError = audio.error
      const message = mediaError?.message || 'Failed to load audio'
      setError(message)
      setState('error')
      if (onError) onError(message)
    }

    const onVolumeChange = () => {
      setVolume(audio.volume)
      setMuted(audio.muted)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEndedHandler)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('error', onErrorHandler)
    audio.addEventListener('volumechange', onVolumeChange)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEndedHandler)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('error', onErrorHandler)
      audio.removeEventListener('volumechange', onVolumeChange)
      clearProgressInterval()
    }
  }, [audioUrl, episodeId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
      clearProgressInterval()
    }
  }, [clearProgressInterval])

  function startProgressTracking() {
    clearProgressInterval()
    progressInterval.current = window.setInterval(() => {
      if (onProgress && audioRef.current) {
        onProgress(
          Math.floor(audioRef.current.currentTime),
          Math.floor(audioRef.current.duration || effectiveDuration)
        )
      }
    }, 5000)
  }

  function togglePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    if (state === 'playing') {
      audio.pause()
    } else {
      audio.play().catch(() => {
        setState('error')
        setError('Playback failed')
      })
    }
  }

  function handleSeek(value: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value
    setPosition(value)
  }

  function handleVolumeChange(value: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = value
    setVolume(value)
    if (value > 0 && audio.muted) audio.muted = false
  }

  function toggleMute() {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
  }

  function skipBack() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, audio.currentTime - 15)
  }

  function skipForward() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.min(effectiveDuration || 999999, audio.currentTime + 30)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      togglePlayPause()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      skipBack()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      skipForward()
    }
  }

  const progressPercent = effectiveDuration > 0 ? (position / effectiveDuration) * 100 : 0
  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'

  return (
    <div
      className="audio-player"
      role="region"
      aria-label={`Audio player: ${title}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onError={() => {
          if (audioUrl) {
            setState('error')
            setError('Failed to load audio')
            if (onError) onError('Failed to load audio')
          }
        }}
      />

      {/* Progress section */}
      <div className="audio-player-progress">
        <div className="audio-player-progress-track">
          <div
            className="audio-player-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            ref={progressRef}
            type="range"
            min={0}
            max={effectiveDuration || 1}
            value={position}
            onChange={(e) => handleSeek(Number(e.target.value))}
            aria-label="Seek audio"
            className="audio-player-seek"
          />
        </div>
        <div className="audio-player-times">
          <span>{formatTime(position)}</span>
          <span>{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="audio-player-controls">
        {/* Skip back */}
        <button
          className="audio-player-btn audio-player-skip"
          onClick={skipBack}
          disabled={isLoading || state === 'error'}
          aria-label="Skip back 15 seconds"
          title="Back 15s"
        >
          <SkipBack size={18} />
          <span>15</span>
        </button>

        {/* Previous */}
        <button
          className="audio-player-btn audio-player-nav"
          onClick={onPrevious}
          disabled={isLoading || state === 'error' || previousDisabled}
          aria-label="Previous episode"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Play / Pause */}
        <button
          className="audio-player-btn audio-player-play"
          onClick={togglePlayPause}
          disabled={!audioUrl || isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="audio-player-spinner" />
          ) : isPlaying ? (
            <Pause size={22} />
          ) : (
            <Play size={22} style={{ marginLeft: 2 }} />
          )}
        </button>

        {/* Next */}
        <button
          className="audio-player-btn audio-player-nav"
          onClick={onNext}
          disabled={isLoading || state === 'error' || nextDisabled}
          aria-label="Next episode"
        >
          <ChevronRight size={20} />
        </button>

        {/* Skip forward */}
        <button
          className="audio-player-btn audio-player-skip"
          onClick={skipForward}
          disabled={isLoading || state === 'error'}
          aria-label="Skip forward 30 seconds"
          title="Forward 30s"
        >
          <SkipForward size={18} />
          <span>30</span>
        </button>
      </div>

      {/* Volume & Speed */}
      <div className="audio-player-volume">
        <button
          className="audio-player-btn"
          onClick={toggleMute}
          disabled={state === 'error'}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          aria-label="Volume"
          className="audio-player-volume-slider"
        />
      </div>

      <div className="audio-player-speed">
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {speeds.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="audio-player-status" role="status">
          Loading…
        </div>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <div className="audio-player-status audio-player-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
