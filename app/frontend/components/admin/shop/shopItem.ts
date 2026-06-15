import { Snowflake, Truck, CalendarClock, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Currency = 'koi' | 'gold' | 'hours'
export type Status = 'available' | 'unavailable'

export type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  status: Status
  featured: boolean
  currency: Currency
  grants_streak_freeze: boolean
  requires_shipping: boolean
  requires_date_selection: boolean
  orders_count: number | null
  created_at: string | null
}

export type ShopItemFormData = {
  name: string
  description: string
  price: number | string
  image_url: string
  status: Status
  featured: boolean
  currency: Currency
  grants_streak_freeze: boolean
  requires_shipping: boolean
  requires_date_selection: boolean
}

export const BLANK_FORM: ShopItemFormData = {
  name: '',
  description: '',
  price: '',
  image_url: '',
  status: 'available',
  featured: false,
  currency: 'koi',
  grants_streak_freeze: false,
  requires_shipping: true,
  requires_date_selection: false,
}

// Koi/gold are priced relative to USD at this rate (5 USD = 7 koi).
export const KOI_PER_USD = 7 / 5

export const CURRENCY_LABELS: Record<Currency, string> = {
  koi: 'Koi',
  gold: 'Gold',
  hours: 'Hours',
}

export function unitFor(currency: Currency): string {
  return currency === 'hours' ? 'h' : currency
}

export function hasUsdEquivalent(currency: Currency): boolean {
  return currency === 'koi' || currency === 'gold'
}

export function priceToUsd(price: number): string {
  if (!price || price <= 0) return ''
  return (price / KOI_PER_USD).toFixed(2)
}

export function usdToPrice(usd: string): number | null {
  const n = parseFloat(usd)
  if (isNaN(n) || n <= 0) return null
  return Math.round(n * KOI_PER_USD)
}

// Boolean flags shown as compact, tooltip-labelled chips throughout the dashboard.
export const FLAGS: {
  key: 'grants_streak_freeze' | 'requires_shipping' | 'requires_date_selection'
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    key: 'grants_streak_freeze',
    label: 'Streak freeze',
    description: 'Buying this grants the user a streak freeze.',
    icon: Snowflake,
  },
  {
    key: 'requires_shipping',
    label: 'Needs shipping',
    description: 'Collects a shipping address at checkout.',
    icon: Truck,
  },
  {
    key: 'requires_date_selection',
    label: 'Date picker',
    description: 'Asks the buyer to choose a date at checkout.',
    icon: CalendarClock,
  },
]

export const STAR_ICON = Star
