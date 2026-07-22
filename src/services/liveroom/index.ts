import type { LiveRoomProvider } from './types'
import { MockLiveRoomProvider } from './mock-provider'

export type { LiveRoomProvider, LiveRoomParticipant, LiveRoomChatMessage, LiveRoomState, LiveRoomEvents } from './types'

let activeProvider: LiveRoomProvider | null = null

/**
 * Get or create a LiveRoom provider.
 * Currently returns MockLiveRoomProvider.
 * To integrate Jitsi/LiveKit/Daily, add a provider class and
 * return it here based on session.live_room_provider.
 */
export function createLiveRoomProvider(providerType?: string): LiveRoomProvider {
  destroyLiveRoomProvider()

  // Future: switch on providerType
  // if (providerType === 'jitsi') return new JitsiLiveRoomProvider()
  // if (providerType === 'livekit') return new LiveKitLiveRoomProvider()
  // if (providerType === 'daily') return new DailyLiveRoomProvider()

  activeProvider = new MockLiveRoomProvider()
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
