import type { LiveRoomProvider } from './types'
import { MockLiveRoomProvider } from './mock-provider'
import { JitsiLiveRoomProvider } from './jitsi-provider'

export type { LiveRoomProvider, LiveRoomParticipant, LiveRoomChatMessage, LiveRoomState, LiveRoomEvents } from './types'

let activeProvider: LiveRoomProvider | null = null

/**
 * Create a LiveRoom provider based on session's live_room_provider setting.
 * 'jitsi' → real Jitsi Meet via External API
 * 'mock' or default → mock provider with getUserMedia
 */
export function createLiveRoomProvider(providerType?: string): LiveRoomProvider {
  destroyLiveRoomProvider()

  if (providerType === 'mock') {
    activeProvider = new MockLiveRoomProvider()
  } else {
    activeProvider = new JitsiLiveRoomProvider()
  }

  return activeProvider
}

export function getActiveProvider(): LiveRoomProvider | null {
  return activeProvider
}

export function destroyLiveRoomProvider(): void {
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
}
