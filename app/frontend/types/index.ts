export interface User {
  id: number
  display_name: string
  email: string
  avatar: string
  roles: string[]
  is_admin: boolean
  is_staff: boolean
  is_banned: boolean
  is_trial: boolean
  is_onboarded: boolean
}

export type FlashData = Record<string, string>

export interface Features {
  collaborators?: boolean
  collapse?: boolean
}

export interface SharedProps {
  auth: { user: User | null }
  flash: FlashData
  sign_in_path: string
  sign_out_path: string
  trial_session_path: string
  rsvp_path: string
  has_unread_mail: boolean
  errors: Record<string, string[]>
  [key: string]: unknown
}

export interface MailItem {
  id: number
  summary: string
  pinned: boolean
  dismissable: boolean
  action_url: string | null
  is_read: boolean
  created_at: string
}

export interface MailDetail {
  id: number
  summary: string
  content: string | null
  pinned: boolean
  dismissable: boolean
  action_url: string | null
  source_type: string | null
  created_at: string
}

export interface PagyProps {
  count: number
  page: number
  limit: number
  pages: number
  next: number | null
  prev: number | null
}

export interface ProjectCard {
  id: number
  name: string
  description: string | null
  is_unlisted: boolean
  tags: string[]
  cover_image_url: string | null
  journal_entries_count: number
  time_logged: number
  recordings_count: number
}

export interface ProjectDetail {
  id: number
  name: string
  description: string | null
  demo_link: string | null
  repo_link: string | null
  is_unlisted: boolean
  tags: string[]
  user_display_name: string
  created_at: string
}

export interface JournalEntryCard {
  id: number
  content_html: string
  images: string[]
  recordings_count: number
  created_at: string
}

export interface ProjectForm {
  id?: number
  name: string
  description: string
  demo_link: string
  repo_link: string
  is_unlisted: boolean
  tags: string[]
}

export interface AdminUserRow {
  id: number
  display_name: string
  email: string
  roles: string[]
  projects_count: number
  is_discarded: boolean
  created_at: string
}

export interface AdminUserDetail {
  id: number
  display_name: string
  email: string
  avatar: string
  roles: string[]
  timezone: string
  is_banned: boolean
  is_discarded: boolean
  discarded_at: string | null
  created_at: string
}

export interface AdminProjectRow {
  id: number
  name: string
  user_id: number
  user_display_name: string
  ships_count: number
  is_unlisted: boolean
  is_discarded: boolean
  created_at: string
}

export interface AdminProjectDetail {
  id: number
  name: string
  description: string | null
  demo_link: string | null
  repo_link: string | null
  is_unlisted: boolean
  tags: string[]
  is_discarded: boolean
  discarded_at: string | null
  user_id: number
  user_display_name: string
}

export interface AdminShipRow {
  id: number
  project_name: string
  user_display_name: string
  status: string
  reviewer_display_name: string | null
  created_at: string
}

export interface AdminShipDetail {
  id: number
  status: string
  reviewer_display_name: string | null
  approved_seconds: number | null
  feedback: string | null
  justification: string | null
  frozen_demo_link: string | null
  frozen_repo_link: string | null
  project_name: string
  user_display_name: string
  created_at: string
}

export interface ShipForm {
  id: number
  status: string
  feedback: string
  justification: string
  approved_seconds: number | null
  project_name: string
  user_display_name: string
}
