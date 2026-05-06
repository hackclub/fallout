import * as react_jsx_runtime from 'react/jsx-runtime';
import React, { ReactNode } from 'react';
import { SessionStatus, SessionResponse, UploadUrlResponse, ConfirmScreenshotRequest, ConfirmScreenshotResponse, PauseResponse, ResumeResponse, StopResponse, RenameSessionResponse, StatusResponse, VideoResponse, SessionSummary } from '@lookout/shared';
export { SESSION_STATUSES, SessionStatus, SessionSummary } from '@lookout/shared';

/** Returns the session token. Accepts a static string, sync getter, or async getter. */
type TokenProvider = string | (() => string) | (() => Promise<string>);
/** Capture source: screen sharing or webcam camera. */
type CaptureMode = "screen" | "camera";
interface CameraSettings {
    /** Preferred camera device ID (from enumerateDevices). Omit for default camera. */
    deviceId?: string;
    /** Additional getUserMedia video constraints (merged with defaults). */
    userMediaConstraints?: MediaTrackConstraints;
}
interface CaptureSettings {
    /** Screenshot interval in ms. Default: 60000 */
    intervalMs?: number;
    /** JPEG quality 0–1. Default: 0.85 */
    jpegQuality?: number;
    /** Max capture width. Default: 1920 */
    maxWidth?: number;
    /** Max capture height. Default: 1080 */
    maxHeight?: number;
    /** Override getDisplayMedia constraints (merged with defaults). */
    displayMediaConstraints?: DisplayMediaStreamOptions;
    /** Capture mode: "screen" (default) or "camera". */
    mode?: CaptureMode;
    /** Camera-specific settings. Only used when mode is "camera". */
    camera?: CameraSettings;
}
interface RetrySettings {
    /** Max retries per upload step. Default: 3 */
    maxRetries?: number;
    /** Backoff delays in ms per attempt. Default: [2000, 4000, 8000] */
    retryDelays?: number[];
    /** Max screenshots buffered in memory. Default: 5 */
    maxPendingBuffer?: number;
}
interface CaptureResult {
    blob: Blob;
    width: number;
    height: number;
}
interface UploadState {
    pending: number;
    completed: number;
    failed: number;
}
/** SessionStatus + client-only states */
type RecorderStatus = SessionStatus | "loading" | "no-token" | "error";
interface LookoutCallbacks {
    /** Screen sharing started. */
    onShareStart?: () => void;
    /** Screen sharing ended. */
    onShareStop?: () => void;
    /** Screenshot captured (before upload). */
    onCapture?: (capture: CaptureResult) => void;
    /** Screenshot uploaded and confirmed. */
    onUploadSuccess?: (info: {
        screenshotId: string;
        trackedSeconds: number;
    }) => void;
    /** Screenshot upload failed after all retries. */
    onUploadFailure?: (error: Error) => void;
    /** Session paused. */
    onPause?: (info: {
        totalActiveSeconds: number;
    }) => void;
    /** Session resumed. */
    onResume?: () => void;
    /** Session stopped, compilation enqueued. */
    onStop?: (info: {
        trackedSeconds: number;
        totalActiveSeconds: number;
    }) => void;
    /** Compilation complete, video ready. */
    onComplete?: (info: {
        videoUrl: string;
    }) => void;
    /** Compilation failed. */
    onCompilationFailed?: () => void;
    /** Any non-fatal error. */
    onError?: (error: Error, context: string) => void;
    /** Status transition. */
    onStatusChange?: (prev: RecorderStatus, next: RecorderStatus) => void;
}
interface LookoutConfig {
    /** Session token. Required. */
    token: TokenProvider;
    /** API base URL. Default: "" (same origin). */
    apiBaseUrl?: string;
    /** Capture settings. */
    capture?: CaptureSettings;
    /** Retry/buffer settings. */
    retry?: RetrySettings;
    /** Lifecycle callbacks. */
    callbacks?: LookoutCallbacks;
    /** Compilation status poll interval in ms. Default: 3000 */
    statusPollIntervalMs?: number;
    /** Auto-start screen sharing on mount. Default: false */
    autoStart?: boolean;
}
interface ResolvedConfig {
    token: TokenProvider;
    apiBaseUrl: string;
    capture: Required<Omit<CaptureSettings, "displayMediaConstraints" | "camera">> & {
        displayMediaConstraints?: DisplayMediaStreamOptions;
        camera: CameraSettings;
    };
    retry: Required<RetrySettings>;
    callbacks: LookoutCallbacks;
    statusPollIntervalMs: number;
    autoStart: boolean;
}
interface LookoutState {
    /** Current recorder status. */
    status: RecorderStatus;
    /** Whether getDisplayMedia is active. */
    isSharing: boolean;
    /** True when actively capturing (sharing + pending/active). Convenience for UI logic. */
    isRecording: boolean;
    /** Best-known tracked seconds (max of server, upload confirms, and local estimate). */
    trackedSeconds: number;
    /** Client-interpolated display seconds (smooth ticking, monotonic). */
    displaySeconds: number;
    /** Number of confirmed screenshots. */
    screenshotCount: number;
    /** Upload queue state. */
    uploads: UploadState;
    /** Object URL of the latest captured screenshot. */
    lastScreenshotUrl: string | null;
    /** Video URL when complete. */
    videoUrl: string | null;
    /** Error message when status is "error". */
    error: string | null;
    /** Active capture mode. */
    captureMode: CaptureMode;
    /** Available camera devices (populated when mode is "camera"). */
    availableCameras: MediaDeviceInfo[];
    /** Currently selected camera device ID. */
    selectedCameraId: string | null;
    /** Whether camera is in preview mode (stream live, capture loop not started). */
    isPreviewing: boolean;
    /** Live camera MediaStream for rendering in a `<video>` element. Null when not previewing/recording. */
    previewStream: MediaStream | null;
}
interface LookoutActions {
    /** Start screen sharing (or camera) and begin capturing. */
    startSharing: () => Promise<void>;
    /** Stop screen share (or camera) without stopping session (auto-pauses). */
    stopSharing: () => void;
    /** Pause the session. */
    pause: () => Promise<void>;
    /** Resume a paused session. */
    resume: () => Promise<void>;
    /** Stop the session (triggers compilation). Optionally name the timelapse before stopping. */
    stop: (options?: {
        name?: string;
    }) => Promise<void>;
    /** Select a camera device by ID. Only effective when captureMode is "camera". */
    selectCamera: (deviceId: string) => void;
    /** Start camera preview without recording. Acquires the stream so the UI can show a live video. */
    startPreview: () => Promise<void>;
    /** Stop camera preview (releases stream). */
    stopPreview: () => void;
}

interface LookoutClient {
    resolveToken(): Promise<string>;
    getSession(): Promise<SessionResponse>;
    getUploadUrl(): Promise<UploadUrlResponse>;
    confirmScreenshot(body: ConfirmScreenshotRequest): Promise<ConfirmScreenshotResponse>;
    uploadToR2(uploadUrl: string, blob: Blob): Promise<void>;
    pause(): Promise<PauseResponse>;
    resume(): Promise<ResumeResponse>;
    stop(): Promise<StopResponse>;
    rename(name: string): Promise<RenameSessionResponse>;
    getStatus(): Promise<StatusResponse>;
    getVideo(): Promise<VideoResponse>;
}
interface CreateClientOptions {
    baseUrl: string;
    token: TokenProvider;
}
declare function createLookoutClient(options: CreateClientOptions): LookoutClient;

interface LookoutProviderProps extends LookoutConfig {
    children: ReactNode;
}
declare function LookoutProvider({ children, ...config }: LookoutProviderProps): react_jsx_runtime.JSX.Element;

/**
 * Drop-in recorder widget. Handles the full lifecycle:
 * screen/camera capture, upload, pause/resume/stop, compilation, video playback.
 *
 * Adapts its UI based on the configured `capture.mode`:
 * - `"screen"` (default): screen sharing flow with `getDisplayMedia`
 * - `"camera"`: webcam flow with live preview, device picker, then recording
 *
 * Must be used within a `<LookoutProvider>`.
 */
declare function LookoutRecorder(): react_jsx_runtime.JSX.Element;

interface StatusBarProps {
    displaySeconds: number;
    screenshotCount: number;
    uploads: UploadState;
}
declare function StatusBar({ displaySeconds, screenshotCount, uploads }: StatusBarProps): react_jsx_runtime.JSX.Element;

interface RecordingControlsProps {
    status: RecorderStatus;
    isSharing: boolean;
    onStartSharing: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    loading?: boolean;
    /** Capture mode — adjusts button labels. Defaults to "screen". */
    captureMode?: CaptureMode;
}
declare function RecordingControls({ status, isSharing, onStartSharing, onPause, onResume, onStop, loading, captureMode, }: RecordingControlsProps): react_jsx_runtime.JSX.Element;

interface ScreenPreviewProps {
    imageUrl: string | null;
}
declare function ScreenPreview({ imageUrl }: ScreenPreviewProps): react_jsx_runtime.JSX.Element | null;

interface CameraSelectorProps {
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    onSelect: (deviceId: string) => void;
    disabled?: boolean;
}
declare function CameraSelector({ devices, selectedDeviceId, onSelect, disabled, }: CameraSelectorProps): react_jsx_runtime.JSX.Element | null;

interface CameraPreviewProps {
    /** Live camera MediaStream to display. Shows nothing when null. */
    stream: MediaStream | null;
    /** Fallback static image URL (e.g. last captured screenshot). */
    fallbackImageUrl?: string | null;
}
/**
 * Live camera preview using a `<video>` element.
 * Falls back to a static image when no stream is provided.
 */
declare function CameraPreview({ stream, fallbackImageUrl }: CameraPreviewProps): react_jsx_runtime.JSX.Element | null;

interface ResultViewProps {
    status: RecorderStatus;
    trackedSeconds: number;
}
declare function ResultView({ status, trackedSeconds }: ResultViewProps): react_jsx_runtime.JSX.Element;

interface ProcessingStateProps {
    status: string;
    trackedSeconds: number;
    videoUrl?: string | null;
    error?: string | null;
    onVideoLoaded?: () => void;
}
declare function ProcessingState({ status, trackedSeconds, videoUrl, error, onVideoLoaded }: ProcessingStateProps): react_jsx_runtime.JSX.Element;

interface VideoPlayerProps {
    src: string;
}
declare function VideoPlayer({ src }: VideoPlayerProps): react_jsx_runtime.JSX.Element;

interface GalleryProps {
    sessions: SessionSummary[];
    loading: boolean;
    error: string | null;
    onSessionClick?: (token: string) => void;
    onArchive?: (token: string) => void;
    onRefresh?: () => void;
    onAdd?: () => void;
    onSettings?: () => void;
}
declare function Gallery({ sessions, loading, error, onSessionClick, onArchive, onRefresh, onAdd, onSettings, }: GalleryProps): react_jsx_runtime.JSX.Element;

interface SessionCardProps {
    session: SessionSummary;
    onClick?: () => void;
    onArchive?: () => void;
}
declare function SessionCard({ session, onClick, onArchive }: SessionCardProps): react_jsx_runtime.JSX.Element;

interface SessionDetailProps {
    token: string;
    apiBaseUrl: string;
    onBack?: () => void;
    onArchive?: () => void;
}
declare function SessionDetail({ token, apiBaseUrl, onBack, onArchive, }: SessionDetailProps): react_jsx_runtime.JSX.Element;

/**
 * Primary hook for Lookout integration.
 * Composes all lower-level hooks and orchestrates the capture-upload loop.
 */
declare function useLookout(): {
    state: LookoutState;
    actions: LookoutActions;
};

/**
 * Handles getDisplayMedia, canvas snapshots, and stream lifecycle.
 *
 * Reads capture settings from LookoutProvider context. Pass explicit
 * settings to override or use standalone (without provider).
 */
declare function useScreenCapture(overrides?: CaptureSettings): {
    isSharing: boolean;
    startSharing: () => Promise<void>;
    takeScreenshot: () => Promise<CaptureResult | null>;
    stopSharing: () => void;
};

/**
 * Handles getUserMedia (webcam), device enumeration, canvas snapshots,
 * and stream lifecycle.
 *
 * Supports a two-phase flow for camera mode:
 *   1. **Preview** — `startPreview()` acquires the camera stream so the UI
 *      can show a live `<video>` and a device picker *before* recording.
 *   2. **Recording** — `startSharing()` reuses the preview stream (or
 *      acquires one if preview wasn't started) and sets `isSharing = true`,
 *      which tells `useLookout` to begin the capture-upload loop.
 *
 * Mirrors the base return shape of `useScreenCapture` (`isSharing`,
 * `startSharing`, `takeScreenshot`, `stopSharing`) so `useLookout` can
 * delegate to either hook interchangeably, plus camera-specific extras.
 */
declare function useCameraCapture(overrides?: CaptureSettings): {
    isSharing: boolean;
    startSharing: () => Promise<void>;
    takeScreenshot: () => Promise<CaptureResult | null>;
    stopSharing: () => void;
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    selectDevice: (deviceId: string) => Promise<void>;
    isPreviewing: boolean;
    previewStream: MediaStream | null;
    startPreview: () => Promise<void>;
    stopPreview: () => void;
};

interface UploaderResult {
    /** Add a capture to the upload queue. */
    enqueue: (capture: CaptureResult) => void;
    /** Current upload queue state. */
    uploads: UploadState;
    /** Server-reported tracked seconds after latest confirmation. */
    trackedSeconds: number;
    /** Object URL of last successfully uploaded screenshot. */
    lastScreenshotUrl: string | null;
    /** ISO timestamp: when the server expects the next screenshot. */
    nextExpectedAt: string | null;
    /** Last upload error message, if any. */
    lastError: string | null;
    /** True when a 409 conflict was received (session paused server-side). */
    sessionConflict: boolean;
    /** Clear the sessionConflict flag after handling. */
    resetConflict: () => void;
}
declare function useUploader(): UploaderResult;

declare function useSession(): {
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    stop: (name?: string) => Promise<void>;
    reload: () => Promise<void>;
    syncStatus: () => Promise<void>;
    updateTrackedSeconds: (seconds: number) => void;
    setError: (error: string | null) => void;
    status: RecorderStatus;
    name: string;
    trackedSeconds: number;
    screenshotCount: number;
    startedAt: string | null;
    createdAt: string | null;
    totalActiveSeconds: number;
    error: string | null;
};

/**
 * Client-side interpolated timer. Uses server-provided trackedSeconds
 * as ground truth, interpolates between updates for smooth display.
 *
 * The server already accounts for the first screenshot at t=0 by using
 * (count(distinct minute_buckets) - 1) * 60, so no client-side offset
 * is needed.
 */
declare function useSessionTimer(serverTrackedSeconds: number, isActive: boolean): number;
/** Format seconds as H:MM:SS or M:SS (for live timer display). */
declare function formatTime(totalSeconds: number): string;
/** Format seconds as human-readable tracked time (e.g. "1h 34min", "12min", "< 1min"). */
declare function formatTrackedTime(totalSeconds: number): string;

interface TokenEntry {
    token: string;
    addedAt: string;
    label?: string;
    archived: boolean;
}
interface UseTokenStore {
    tokens: TokenEntry[];
    archivedTokens: TokenEntry[];
    addToken(token: string, label?: string): void;
    archiveToken(token: string): void;
    unarchiveToken(token: string): void;
    removeToken(token: string): void;
    getAllTokenValues(): string[];
    hasToken(token: string): boolean;
}
declare function useTokenStore(): UseTokenStore;

interface UseGalleryOptions {
    apiBaseUrl: string;
    tokens: string[];
}
interface UseGallery {
    sessions: SessionSummary[];
    loading: boolean;
    error: string | null;
    refresh(): void;
}
declare function useGallery({ apiBaseUrl, tokens }: UseGalleryOptions): UseGallery;

type Route = {
    page: "gallery";
} | {
    page: "add";
} | {
    page: "settings";
} | {
    page: "record";
    token: string;
} | {
    page: "session";
    token: string;
} | {
    page: "tray";
};
declare function useHashRouter(): {
    route: Route;
    navigate: (r: Route) => void;
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "success" | "danger" | "warning" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    fullWidth?: boolean;
}
declare function Button({ variant, size, loading, fullWidth, disabled, children, style, ...rest }: ButtonProps): react_jsx_runtime.JSX.Element;

interface SpinnerProps {
    size?: "sm" | "md" | "lg";
    color?: string;
}
declare function Spinner({ size, color }: SpinnerProps): react_jsx_runtime.JSX.Element;

interface BadgeProps {
    status: string;
    variant?: "overlay" | "inline";
    size?: "sm" | "md" | "lg";
}
declare function Badge({ status, variant, size }: BadgeProps): react_jsx_runtime.JSX.Element;

interface ErrorDisplayProps {
    error: string;
    variant?: "banner" | "inline" | "page";
    title?: string;
    onDismiss?: () => void;
    onCopy?: () => void;
    action?: {
        label: string;
        onClick: () => void;
    };
}
declare function ErrorDisplay({ error, variant, title, onDismiss, onCopy, action }: ErrorDisplayProps): react_jsx_runtime.JSX.Element;

interface CardProps {
    children: React.ReactNode;
    onClick?: () => void;
    padding?: number | string;
    style?: React.CSSProperties;
}
declare function Card({ children, onClick, padding, style }: CardProps): react_jsx_runtime.JSX.Element;

interface PageContainerProps {
    children: React.ReactNode;
    maxWidth?: number;
    centered?: boolean;
    style?: React.CSSProperties;
}
declare function PageContainer({ children, maxWidth, centered, style }: PageContainerProps): react_jsx_runtime.JSX.Element;

interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    borderRadius?: number | string;
    aspectRatio?: string;
    style?: React.CSSProperties;
}
declare function Skeleton({ width, height, borderRadius, aspectRatio, style }: SkeletonProps): react_jsx_runtime.JSX.Element;
declare function GallerySkeleton(): react_jsx_runtime.JSX.Element;
declare function SessionDetailSkeleton(): react_jsx_runtime.JSX.Element;
declare function RecordPageSkeleton(): react_jsx_runtime.JSX.Element;

declare const colors: {
    readonly bg: {
        readonly body: "var(--color-bg-body)";
        readonly panel: "var(--color-bg-panel)";
        readonly backdrop: "var(--color-modal-backdrop)";
        readonly surface: "var(--color-bg-surface)";
        readonly sunken: "var(--color-bg-sunken)";
        readonly selected: "var(--color-bg-selected)";
    };
    readonly text: {
        readonly primary: "var(--color-text-primary)";
        readonly inverse: "var(--color-text-inverse)";
        readonly secondary: "var(--color-text-secondary)";
        readonly tertiary: "var(--color-text-tertiary)";
        readonly quaternary: "var(--color-text-quaternary)";
        readonly error: "var(--color-text-error)";
    };
    readonly border: {
        readonly default: "var(--color-border-default)";
        readonly hover: "var(--color-border-hover)";
        readonly selected: "var(--color-border-selected)";
    };
    readonly icon: {
        readonly selected: "var(--color-icon-selected)";
    };
    readonly spinner: {
        readonly base: "var(--color-spinner-base)";
        readonly track: "var(--color-spinner-track)";
    };
    readonly skeleton: {
        readonly bg: "var(--color-skeleton-bg)";
        readonly shimmer: "var(--color-skeleton-shimmer)";
    };
    readonly badge: {
        readonly primaryBg: "var(--color-badge-primary-bg)";
        readonly primaryText: "var(--color-badge-primary-text)";
        readonly overlayBg: "var(--color-badge-overlay-bg)";
        readonly overlayText: "var(--color-badge-overlay-text)";
    };
    readonly status: {
        readonly success: "#22c55e";
        readonly info: "#3b82f6";
        readonly warning: "#f59e0b";
        readonly danger: "#ef4444";
        readonly neutral: "var(--color-status-neutral)";
    };
};
declare const spacing: {
    readonly xs: 4;
    readonly sm: 8;
    readonly md: 12;
    readonly lg: 16;
    readonly xl: 20;
    readonly xxl: 24;
    readonly xxxl: 32;
};
declare const radii: {
    readonly sm: 6;
    readonly md: 8;
    readonly lg: 10;
};
declare const fontSize: {
    readonly xs: 11;
    readonly sm: 12;
    readonly md: 13;
    readonly lg: 14;
    readonly xl: 16;
    readonly xxl: 18;
    readonly heading: 20;
    readonly display: 24;
    readonly timer: 32;
};
declare const fontWeight: {
    readonly normal: 400;
    readonly medium: 500;
    readonly semibold: 600;
    readonly bold: 700;
};
declare const statusConfig: Record<string, {
    label: string;
    color: string;
}>;

export { Badge, type BadgeProps, Button, type ButtonProps, CameraPreview, type CameraPreviewProps, CameraSelector, type CameraSelectorProps, type CameraSettings, type CaptureMode, type CaptureResult, type CaptureSettings, Card, type CardProps, type CreateClientOptions, ErrorDisplay, type ErrorDisplayProps, Gallery, type GalleryProps, GallerySkeleton, type LookoutActions, type LookoutCallbacks, type LookoutClient, type LookoutConfig, LookoutProvider, type LookoutProviderProps, LookoutRecorder, type LookoutState, PageContainer, type PageContainerProps, ProcessingState, type ProcessingStateProps, RecordPageSkeleton, type RecorderStatus, RecordingControls, type RecordingControlsProps, type ResolvedConfig, ResultView, type ResultViewProps, type RetrySettings, type Route, ScreenPreview, type ScreenPreviewProps, SessionCard, type SessionCardProps, SessionDetail, type SessionDetailProps, SessionDetailSkeleton, Skeleton, type SkeletonProps, Spinner, type SpinnerProps, StatusBar, type StatusBarProps, type TokenEntry, type TokenProvider, type UploadState, type UseGalleryOptions, type UseGallery as UseGalleryReturn, type UseTokenStore, VideoPlayer, colors, createLookoutClient, fontSize, fontWeight, formatTime, formatTrackedTime, radii, spacing, statusConfig, useCameraCapture, useGallery, useHashRouter, useLookout, useScreenCapture, useSession, useSessionTimer, useTokenStore, useUploader };
