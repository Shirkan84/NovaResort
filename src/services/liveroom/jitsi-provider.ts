import type { LiveRoomProvider, LiveRoomEvents, LiveRoomParticipant, LiveRoomChatMessage, LiveRoomState } from './types'
import { supabase } from '../../supabase'

declare global {
  interface Window { JitsiMeetExternalAPI?: any }
}

/**
 * JitsiLiveRoomProvider – uses Jitsi Meet External API via iframe.
 * Maintains a UUID↔Jitsi-participant-ID mapping so mute/kick commands
 * work correctly cross-platform.
 */
export class JitsiLiveRoomProvider implements LiveRoomProvider {
  private sessionId = ''
  private userId = ''
  private isHost = false
  private events: LiveRoomEvents = {}
  private channel: ReturnType<typeof supabase.channel> | null = null
  private _isMuted = false
  private _isVideoOn = true
  private _isScreenSharing = false
  private api: any = null
  private containerEl: HTMLElement | null = null

  /** Maps Supabase UUID → Jitsi participant ID */
  private uuidToJitsi = new Map<string, string>()
  /** Maps Jitsi participant ID → Supabase UUID */
  private jitsiToUuid = new Map<string, string>()

  async init(sessionId: string, userId: string, isHost: boolean): Promise<void> {
    this.sessionId = sessionId
    this.userId = userId
    this.isHost = isHost
  }

  async join(): Promise<void> {
    const { error } = await supabase.rpc('join_session_room', { target_session: this.sessionId })
    if (error) throw new Error(error.message)

    if (!window.JitsiMeetExternalAPI) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://meet.jit.si/external_api.js'
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Jitsi API'))
        document.head.appendChild(script)
      })
    }

    this.containerEl = document.getElementById('jitsi-container')
    if (!this.containerEl) throw new Error('Jitsi container not found')

    const roomName = `NovaResort-${this.sessionId.slice(0, 8)}`

    this.api = new window.JitsiMeetExternalAPI('meet.jit.si', {
      parentNode: this.containerEl,
      roomName,
      userInfo: { displayName: this.userId, id: this.userId },
      configOverwrite: {
        startAudioOnly: false,
        startScreenSharing: false,
        enableChat: false,
        disableDeepLinking: true,
        disableProfile: true,
        prejoinPageEnabled: false,
        toolbarButtons: [],
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        DEFAULT_BACKGROUND: '#1a2420',
        TOOLBAR_ALWAYS_VISIBLE: false,
        filmStripOnly: false,
      }
    })

    this.api.addEventListener('audioMuteStatusChanged', (e: any) => {
      this._isMuted = e.muted
    })

    this.api.addEventListener('videoMuteStatusChanged', (e: any) => {
      this._isVideoOn = !e.muted
    })

    this.api.addEventListener('screenSharingStatusChanged', (e: any) => {
      this._isScreenSharing = e.on
    })

    // Track participants and build UUID↔JitsiID map
    this.api.addEventListener('participantJoined', (jitsiId: string) => {
      const info = this.api.getParticipantInfo(jitsiId)
      const displayName = info?.displayName || ''
      // displayName is the UUID we passed as userInfo.id on join
      const uuid = displayName || jitsiId
      this.uuidToJitsi.set(uuid, jitsiId)
      this.jitsiToUuid.set(jitsiId, uuid)
      this.events.onParticipantJoin?.({
        userId: uuid,
        displayName,
        avatarUrl: null,
        role: 'participant',
        isMuted: false,
        isVideoOn: true,
        isScreenSharing: false,
        joinedAt: new Date().toISOString(),
        leftAt: null
      })
    })

    this.api.addEventListener('participantLeft', (jitsiId: string) => {
      const uuid = this.jitsiToUuid.get(jitsiId) || jitsiId
      this.jitsiToUuid.delete(jitsiId)
      this.uuidToJitsi.delete(uuid)
      this.events.onParticipantLeave?.(uuid)
    })

    this.api.addEventListener('readyToClose', () => {
      this.events.onRoomStateChange?.({
        status: 'ended',
        startedAt: null,
        endedAt: new Date().toISOString(),
        participantCount: 0
      })
    })

    // Subscribe to Supabase Realtime for chat + room state
    this.channel = supabase.channel(`live-room-${this.sessionId}`)

    this.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'session_room_state', filter: `session_id=eq.${this.sessionId}` }, (payload) => {
      const row = payload.new as any
      this.events.onRoomStateChange?.({
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        participantCount: 0
      })
    })

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
    this.api?.dispose()
    this.api = null
    await supabase.rpc('leave_session_room', { target_session: this.sessionId })
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.uuidToJitsi.clear()
    this.jitsiToUuid.clear()
  }

  async toggleCamera(): Promise<boolean> {
    this.api?.executeCommand('toggleVideo')
    this._isVideoOn = !this._isVideoOn
    await supabase.from('session_room_participants')
      .update({ is_video_on: this._isVideoOn })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
    return this._isVideoOn
  }

  async toggleMicrophone(): Promise<boolean> {
    this.api?.executeCommand('toggleAudio')
    this._isMuted = !this._isMuted
    await supabase.from('session_room_participants')
      .update({ is_muted: this._isMuted })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
    return this._isMuted
  }

  async startScreenShare(): Promise<void> {
    this.api?.executeCommand('toggleShareScreen')
    this._isScreenSharing = true
    await supabase.from('session_room_participants')
      .update({ is_screen_sharing: true })
      .eq('session_id', this.sessionId)
      .eq('user_id', this.userId)
  }

  async stopScreenShare(): Promise<void> {
    this.api?.executeCommand('toggleShareScreen')
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

  async muteParticipant(uuid: string, muted: boolean): Promise<void> {
    await supabase.rpc('mute_session_participant', { target_session: this.sessionId, target_user: uuid, muted })
    const jitsiId = this.uuidToJitsi.get(uuid)
    if (jitsiId) {
      this.api?.executeCommand('muteParticipant', jitsiId, muted)
    }
  }

  async removeParticipant(uuid: string): Promise<void> {
    await supabase.rpc('remove_session_participant', { target_session: this.sessionId, target_user: uuid })
    const jitsiId = this.uuidToJitsi.get(uuid)
    if (jitsiId) {
      this.api?.executeCommand('kickParticipant', jitsiId)
    }
  }

  getLocalState() {
    return { isMuted: this._isMuted, isVideoOn: this._isVideoOn, isScreenSharing: this._isScreenSharing }
  }

  onEvents(events: LiveRoomEvents): void {
    this.events = events
  }

  destroy(): void {
    this.api?.dispose()
    this.api = null
    this.containerEl = null
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.uuidToJitsi.clear()
    this.jitsiToUuid.clear()
  }
}
