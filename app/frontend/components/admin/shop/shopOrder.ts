import { Check, Pause, X, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Currency = 'koi' | 'gold' | 'hours'
export type OrderState = 'pending' | 'on_hold' | 'fulfilled' | 'rejected'

// Workflow order: the pending queue first, terminal states last.
export const ORDER_STATES: OrderState[] = ['pending', 'on_hold', 'fulfilled', 'rejected']

export const STATE_META: Record<
  OrderState,
  { label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string }
> = {
  pending: { label: 'Pending', badge: 'outline', dot: 'bg-amber-500' },
  on_hold: { label: 'On hold', badge: 'secondary', dot: 'bg-sky-500' },
  fulfilled: { label: 'Fulfilled', badge: 'default', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', badge: 'destructive', dot: 'bg-red-500' },
}

// Imperative labels + icons for moving an order INTO a state (used by row menus, bulk bar, detail).
export const STATE_ACTION: Record<OrderState, { label: string; icon: LucideIcon }> = {
  fulfilled: { label: 'Mark fulfilled', icon: Check },
  on_hold: { label: 'Put on hold', icon: Pause },
  rejected: { label: 'Reject & refund', icon: X },
  pending: { label: 'Reopen as pending', icon: RotateCcw },
}

export function unitFor(currency: Currency): string {
  return currency === 'hours' ? 'h' : currency
}

export function formatAmount(amount: number, currency: Currency): string {
  return `${amount.toLocaleString()} ${unitFor(currency)}`
}

// The states an admin can move an order into from its current state.
export function transitionsFrom(state: OrderState): OrderState[] {
  return ORDER_STATES.filter((s) => s !== state)
}

export type OrderUser = { id: number; display_name: string; email: string; avatar: string }

export type OrderRow = {
  id: number
  user: OrderUser
  shop_item: { id: number; name: string; currency: Currency }
  quantity: number
  frozen_price: number
  total_cost: number
  frozen_koi_amount: number
  frozen_gold_amount: number
  requires_shipping: boolean
  state: OrderState
  created_at: string
}
