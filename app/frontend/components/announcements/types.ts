export type AnnouncementKind = 'critical' | 'info' | 'promo'

export interface Announcement {
  id: string
  kind: AnnouncementKind
  message: string
  href?: string
  external?: boolean
  modal?: boolean
  dismissible?: boolean
}
