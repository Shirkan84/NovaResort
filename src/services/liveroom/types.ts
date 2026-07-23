export interface LiveRoomParticipant {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'host' | 'participant'
  isMuted: boolean
  isVideoOn: boolean
  isScreenSharing: boolean
  joinedAt: string
  leftAt: string | null
}

export interface LiveRoomChatMessage {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  body: string
  pinned: boolean
  createdAt: string
}

export interface LiveRoomState {
  status: 'waiting' | 'live' | 'closed' | 'ended'
  startedAt: string | null
  endedAt: string | null
  participantCount: number
}

export interface LiveRoomEvents {
  onParticipantJoin?: (participant: LiveRoomParticipant) => void
  onParticipantLeave?: (userId: string) => void
  onParticipantUpdate?: (userId: string, updates: Partial<LiveRoomParticipant>) => void
  onChatMessage?: (message: LiveRoomChatMessage) => void
  onRoomStateChange?: (state: LiveRoomState) => void
  onError?: (error: string) => void
}

export interface LiveRoomProvider {
  /** Initialize the provider with session and user context */
  init(sessionId: string, userId: string, isHost: boolean): Promise<void>

  /** Join the room (connect to media + chat) */
  join(): Promise<void>

  /** Leave the room (disconnect media) */
  leave(): Promise<void>

  /** Toggle local camera */
  toggleCamera(): Promise<boolean>

  /** Toggle local microphone */
  toggleMicrophone(): Promise<boolean>

  /** Start screen sharing (future-ready) */
  startScreenShare(): Promise<void>

  /** Stop screen sharing */
  stopScreenShare(): Promise<void>

  /** Send a chat message */
  sendChatMessage(body: string): Promise<void>

  /** Pin/unpin a message (host only) */
  pinMessage(messageId: string, pin: boolean): Promise<void>

  /** Mute a participant (host only) */
  muteParticipant(userId: string, muted: boolean): Promise<void>

  /** Remove a participant (host only) */
  removeParticipant(userId: string): Promise<void>

  /** Get current local state */
  getLocalState(): { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean }

  /** Register event callbacks */
  onEvents(events: LiveRoomEvents): void

  /** Clean up all resources */
  destroy(): void
}
