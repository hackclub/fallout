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
  shop?: boolean
}

export interface SharedProps {
  auth: { user: User | null }
  flash: FlashData
  features: Features
  sign_in_path: string
  sign_out_path: string
  trial_session_path: string
  rsvp_path: string
  has_unread_mail: boolean
  current_streak: number
  streak_freezes: number
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
  source_type: string | null
  invite_id?: number
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

export interface CollaboratorInfo {
  id: number
  user_id: number
  display_name: string
  avatar: string
}

export interface PendingInvite {
  id: number
  invitee_display_name: string
  invitee_avatar: string
  created_at: string
}

export interface InviteDetail {
  id: number
  status: string
  project_name: string
  project_id: number
  inviter_display_name: string
  inviter_avatar: string
  created_at: string
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
  is_collaborator: boolean
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
  user_avatar: string
  created_at: string
  created_at_iso: string
  time_logged: number
  journal_entries_count: number
}

export interface JournalEntryCard {
  id: number
  content_html: string
  images: string[]
  recordings_count: number
  created_at: string
  created_at_iso: string
  author_display_name: string
  author_avatar: string
  time_logged: number
  collaborators: { display_name: string; avatar: string }[]
  can_switch_project: boolean
  can_delete: boolean
}

export interface JournalSwitchableProject {
  id: number
  name: string
}

export interface ShipEvent {
  id: number
  status: string
  feedback: string | null
  created_at_iso: string
}

export interface ProjectForm {
  id?: number
  name: string
  description: string
  repo_link: string
}

export interface AdminUserRow {
  id: number
  display_name: string
  email?: string
  slack_id: string | null
  roles: string[]
  projects_count: number
  is_discarded: boolean
  created_at: string
}

export interface AdminUserDetail {
  id: number
  display_name: string
  email?: string
  avatar: string
  slack_id: string | null
  roles: string[]
  projects_count: number
  timezone: string
  is_banned: boolean
  is_discarded: boolean
  discarded_at: string | null
  created_at: string
}

export interface AdminStreakDay {
  date: string
  status: 'pending' | 'active' | 'frozen' | 'missed'
}

export interface AdminStreakData {
  current_streak: number
  longest_streak: number
  total_active_days: number
  freezes_remaining: number
  days: AdminStreakDay[]
}

export interface AdminProjectData {
  projects: AdminProjectRow[]
  pagy: PagyProps
  total_count: number
}

export interface AdminProjectRow {
  id: number
  name: string
  user_id: number
  user_display_name: string
  journal_entries_count: number
  repo_link: string | null
  hours_tracked: number
  last_entry_at: string | null
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
  user_avatar: string
  journal_entries_count: number
  hours_tracked: number
  last_entry_at: string | null
  created_at: string
  collaborators: { id: number; display_name: string; avatar: string }[]
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
  approved_public_hours: number | null
  approved_internal_hours: number | null
  feedback: string | null
  justification: string | null
  frozen_demo_link: string | null
  frozen_repo_link: string | null
  project_name: string
  user_display_name: string
  review_statuses: SiblingStatuses
  created_at: string
}

export interface RepoTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number | null
}

export interface RepoTreeData {
  entries: RepoTreeEntry[]
  default_branch: string
  pushed_at: string | null
  created_at: string | null
}

export interface PreflightCheck {
  key: string
  label: string
  status: 'running' | 'passed' | 'failed' | 'warn' | 'skipped'
  message: string | null
  visibility?: string
}

export interface PreflightResult {
  status: 'running' | 'passed' | 'failed'
  checks: PreflightCheck[]
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

export interface ReviewerNote {
  id: number
  body: string
  ship_id: number | null
  review_stage: string | null
  author_display_name: string
  author_avatar: string
  author_id: number
  created_at: string
  updated_at: string
}

export interface ProjectFlag {
  id: number
  project_id: number
  project_name: string
  user_display_name: string
  flagged_by_display_name: string
  flagged_by_avatar: string
  ship_id: number | null
  review_stage: string | null
  reason: string
  created_at: string
}

export interface ReviewRow {
  id: number
  ship_id: number
  project_name: string
  user_display_name: string
  status: string
  project_flagged: boolean
  reviewer_display_name: string | null
  created_at: string
  is_claimed: boolean
  claimed_by_display_name: string | null
}

export interface TimeAuditReviewDetail {
  id: number
  ship_id: number
  status: string
  feedback: string | null
  approved_seconds: number | null
  annotations: TimeAuditAnnotations | null
  reviewer_display_name: string | null
  created_at: string
}

export interface TimeAuditAnnotations {
  recordings?: Record<
    string,
    {
      description?: string
      segments?: TimeAuditSegment[]
      stretch_multiplier?: number
    }
  >
}

export interface TimeAuditSegment {
  recording_id: number
  start_seconds: number
  end_seconds: number
  type: 'removed' | 'deflated'
  reason: string
  deflated_percent?: number
}

export interface InactiveSegment {
  start_min: number
  end_min: number
  duration_min: number
}

export interface ReviewRecording {
  id: number
  type: string
  duration: number
  name: string
  playback_url?: string
  thumbnail_url?: string
  recordable_id?: number
  video_id?: string
  yt_duration_seconds?: number
  inactive_segments?: InactiveSegment[]
  inactive_percentage?: number
  activity_checked?: boolean
}

export interface ReviewJournalEntry {
  id: number
  content_html: string
  images: string[]
  author_display_name: string
  author_avatar: string
  created_at: string
  created_at_iso: string
  recordings: ReviewRecording[]
  total_duration: number
}

export interface ReviewShipContext {
  id: number
  ship_type: string
  status: string
  created_at: string
}

export interface ReviewProjectContext {
  id: number
  name: string
  description: string | null
  repo_link: string | null
  demo_link: string | null
  user_id: number
  user_display_name: string
  user_avatar: string
}

export interface RequirementsCheckProjectContext extends ReviewProjectContext {
  tags: string[]
  created_at: string
  logged_hours: number
  approved_public_hours: number | null
  approved_internal_hours: number | null
  entry_count: number
  ship_type: string
  frozen_repo_link: string | null
  frozen_demo_link: string | null
  waiting_since: string
  first_submitted_at: string | null
}

export interface SiblingStatuses {
  time_audit: string | null
  requirements_check: string | null
  design_review: string | null
  build_review: string | null
}

export interface RecordingSummary {
  id: number
  name: string
  type: string
  duration: number
  description: string | null
  removed_seconds: number
}

export interface RequirementsCheckJournalEntry {
  id: number
  content_html: string
  images: string[]
  author_display_name: string
  author_avatar: string
  created_at: string
  total_duration: number
  approved_duration: number
  recordings: RecordingSummary[]
}

export interface RequirementsCheckReviewDetail {
  id: number
  ship_id: number
  status: string
  feedback: string | null
  internal_reason: string | null
  reviewer_display_name: string | null
  project_name: string
  user_display_name: string
  preflight_results: PreflightCheck[] | null
  created_at: string
}

export interface DesignReviewDetail {
  id: number
  ship_id: number
  status: string
  feedback: string | null
  internal_reason: string | null
  hours_adjustment: number | null
  koi_adjustment: number | null
  annotations: Record<string, unknown> | null
  reviewer_display_name: string | null
  project_name: string
  user_display_name: string
  preflight_results: PreflightCheck[] | null
  created_at: string
}

export interface BuildReviewDetail {
  id: number
  ship_id: number
  status: string
  feedback: string | null
  internal_reason: string | null
  hours_adjustment: number | null
  koi_adjustment: number | null
  annotations: Record<string, unknown> | null
  reviewer_display_name: string | null
  project_name: string
  user_display_name: string
  preflight_results: PreflightCheck[] | null
  created_at: string
}
