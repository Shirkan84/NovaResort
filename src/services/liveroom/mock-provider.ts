import type { LiveRoomProvider, LiveRoomEvents, LiveRoomParticipant, LiveRoomChatMessage, LiveRoomState } from './types'
import { supabase } from '../../supabase'

/**
 * MockLiveRoomProvider – a functional demo provider.
 * Uses Supabase Realtime + DB tables for state management.
 * Simulates video/audio locally (no actual WebRTC).
 *
 * Swap this for Jitsi/LiveKit/Daily by implementing LiveRoomProvider.
 */
export class MockLiveRoomProvider implements LiveRoomProvider {
  private sessionId = ''
  private userId = ''
  private isHost = false
  private events: LiveRoomEvents = {}
  private channel: ReturnType<typeof supabase.channel> | null = null
  private _isMuted = false
  private _isVideoOn = true
  private _isScreenSharing = false
  private localStream: MediaStream | null = null

  async init(sessionId: string, userId: string, isHost: boolean): Promise<void> {
    this.sessionId = sessionId
    this.userId = userId
    this.isHost = isHost
  }

  async join(): Promise<void> {
    // Get real media stream for camera/mic
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      this._isVideoOn = true
      this._isMuted = false
    } catch {
      // Camera/mic denied — continue with no media
      this._isVideoOn = false
      this._isMuted = true
    }

    // Join via RPC
    const { error } = await supabase.rpc('join_session_room', { target_session: this.sessionId })
    if (error) throw new Error(error.message)

    // Subscribe to realtime events
    this.channel = supabase.channel(`live-room-${this.sessionId}`)

    // Room state changes
    this.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'session_room_state', filter: `session_id=eq.${this.sessionId}` }, (payload) => {
      const row = payload.new as any
      this.events.onRoomStateChange?.({
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        participantCount: 0
      })
    })

    // Participant changes
    this.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'session_room_participants', filter: `session_id=eq.${this.sessionId}` }, (payload) => {
      const row = payload.new as any
      if (payload.eventType === 'INSERT') {
        this.events.onParticipantJoin?.({
          userId: row.user_id,
          displayName: '',
          avatarUrl: null,
          role: row.role,
          isMuted: row.is_muted,
          isVideoOn: row.is_video_on,
          isScreenSharing: row.is_screen_sharing,
          joinedAt: row.joined_at,
          leftAt: row.left_at
        })
      } else if (payload.eventType === 'UPDATE' && row.left_at) {
        this.events.onParticipantLeave?.(row.user_id)
      } else if (payload.eventType === 'UPDATE') {
        this.events.onParticipantUpdate?.(row.user_id, {
          isMuted: row.is_muted,
          isVideoOn: row.is_video_on,
          isScreenSharing: row.is_screen_sharing
        })
      }
    })

    // Chat messages
    this.channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_chat_messages', filter: `session_id=eq.${this.sessionId}` }, (payload) => {
      const row = payload.new as any
      this.events.onChatMessage?.({
        id: row.id,
        userId: row.user_id,
        displayName: '',
        avatarUrl: null,
        body: row.body,
        pinned: row.pinned,
        createdAt: row.created_at
      })
    })

    this.channel.subscribe()
  }

  async leave(): Promise<void> {
    await supabase.rpc('leave_session_room', { target_session: this.sessionId })
    this.localStream?.getTracks().forEach(t => t.stop())
    this.localStream = null
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  async toggleCamera(): Promise<boolean> {
    this._isVideoOn = !this._isVideoOn
    const videoTrack = this.localStream?.getVideoTracks()[0]
    if (videoTrack) videoTrack.enabled = this._isVideoOn
    await supabase.from('session_room_participants')
      .update({ is_video_on: this._isVideoOn })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
    return this._isVideoOn
  }

  async toggleMicrophone(): Promise<boolean> {
    this._isMuted = !this._isMuted
    const audioTrack = this.localStream?.getAudioTracks()[0]
    if (audioTrack) audioTrack.enabled = !this._isMuted
    await supabase.from('session_room_participants')
      .update({ is_muted: this._isMuted })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
    return this._isMuted
  }

  async startScreenShare(): Promise<void> {
    this._isScreenSharing = true
    await supabase.from('session_room_participants')
      .update({ is_screen_sharing: true })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
  }

  async stopScreenShare(): Promise<void> {
    this._isScreenSharing = false
    await supabase.from('session_room_participants')
      .update({ is_screen_sharing: false })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
  }

  async sendChatMessage(body: string): Promise<void> {
    await supabase.rpc('send_session_chat', { target_session: this.sessionId, message_body: body })
  }

  async pinMessage(messageId: string, pin: boolean): Promise<void> {
    await supabase.rpc('pin_session_chat', { target_message: messageId, pin })
  }

  async muteParticipant(userId: string, muted: boolean): Promise<void> {
    await supabase.rpc('mute_session_participant', { target_session: this.sessionId, target_user: userId, muted })
  }

  async removeParticipant(userId: string): Promise<void> {
    await supabase.rpc('remove_session_participant', { target_session: this.sessionId, target_user: userId })
  }

  getLocalState() {
    return { isMuted: this._isMuted, isVideoOn: this._isVideoOn, isScreenSharing: this._isScreenSharing }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  onEvents(events: LiveRoomEvents): void {
    this.events = events
  }

  destroy(): void {
    this.localStream?.getTracks().forEach(t => t.stop())
    this.localStream = null
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
  }
}
