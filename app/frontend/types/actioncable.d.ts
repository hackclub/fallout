declare module '@rails/actioncable' {
  export interface Subscription {
    unsubscribe(): void
    perform(action: string, data?: Record<string, unknown>): boolean
    send(data: Record<string, unknown>): boolean
    identifier: string
  }

  export interface SubscriptionMixin {
    connected?: () => void
    disconnected?: () => void
    received?: (data: unknown) => void
    rejected?: () => void
    initialized?: () => void
  }

  export interface Subscriptions {
    create(
      channelIdentifier: string | { channel: string; [key: string]: unknown },
      mixin?: SubscriptionMixin,
    ): Subscription
  }

  export interface Consumer {
    subscriptions: Subscriptions
    connect(): void
    disconnect(): void
    ensureActiveConnection(): void
  }

  export function createConsumer(url?: string): Consumer
}
