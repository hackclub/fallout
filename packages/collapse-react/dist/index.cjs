'use strict';

var react = require('react');
var shared = require('@collapse/shared');
var jsxRuntime = require('react/jsx-runtime');

// src/CollapseProvider.tsx

// src/api/client.ts
async function resolveTokenValue(provider) {
  if (typeof provider === "string") return provider;
  const result = provider();
  return result instanceof Promise ? result : result;
}
async function fetchJson(url, init) {
  const headers = {};
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error fetching ${url}: ${msg}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const json = JSON.parse(text);
      detail = json.error || json.message || text;
    } catch {
      detail = text;
    }
    throw new Error(
      `HTTP ${res.status} ${res.statusText} from ${url}${detail ? "\n" + detail.slice(0, 500) : ""}`
    );
  }
  return res.json();
}
function createCollapseClient(options) {
  const { baseUrl, token } = options;
  const resolveToken = () => resolveTokenValue(token);
  async function sessionUrl(path = "") {
    const t = await resolveToken();
    return `${baseUrl}/api/sessions/${t}${path}`;
  }
  return {
    resolveToken,
    async getSession() {
      return fetchJson(await sessionUrl());
    },
    async getUploadUrl() {
      return fetchJson(await sessionUrl("/upload-url"));
    },
    async confirmScreenshot(body) {
      return fetchJson(await sessionUrl("/screenshots"), {
        method: "POST",
        body: JSON.stringify(body)
      });
    },
    async uploadToR2(uploadUrl, blob) {
      if (!uploadUrl.startsWith("https://") && !uploadUrl.startsWith("/")) {
        throw new Error("Invalid upload URL: must be HTTPS or a relative path.");
      }
      let res;
      try {
        res = await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": "image/jpeg" }
        });
      } catch (err) {
        if (err instanceof TypeError) {
          throw new Error(
            "Upload failed: network error or CORS misconfiguration on R2 bucket."
          );
        }
        throw err;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `R2 upload failed: HTTP ${res.status}${text ? " \u2014 " + text.slice(0, 200) : ""}`
        );
      }
    },
    async pause() {
      return fetchJson(await sessionUrl("/pause"), {
        method: "POST"
      });
    },
    async resume() {
      return fetchJson(await sessionUrl("/resume"), {
        method: "POST"
      });
    },
    async stop() {
      return fetchJson(await sessionUrl("/stop"), {
        method: "POST"
      });
    },
    async rename(name) {
      return fetchJson(await sessionUrl("/name"), {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
    },
    async getStatus() {
      return fetchJson(await sessionUrl("/status"));
    },
    async getVideo() {
      return fetchJson(await sessionUrl("/video"));
    }
  };
}
function resolveConfig(config) {
  return {
    token: config.token,
    apiBaseUrl: config.apiBaseUrl ?? "",
    capture: {
      intervalMs: config.capture?.intervalMs ?? shared.SCREENSHOT_INTERVAL_MS,
      jpegQuality: config.capture?.jpegQuality ?? shared.JPEG_QUALITY,
      maxWidth: config.capture?.maxWidth ?? shared.MAX_WIDTH,
      maxHeight: config.capture?.maxHeight ?? shared.MAX_HEIGHT,
      displayMediaConstraints: config.capture?.displayMediaConstraints
    },
    retry: {
      maxRetries: config.retry?.maxRetries ?? shared.MAX_UPLOAD_RETRIES,
      retryDelays: config.retry?.retryDelays ?? shared.UPLOAD_RETRY_DELAYS_MS,
      maxPendingBuffer: config.retry?.maxPendingBuffer ?? shared.MAX_PENDING_BUFFER
    },
    callbacks: config.callbacks ?? {},
    statusPollIntervalMs: config.statusPollIntervalMs ?? 3e3,
    autoStart: config.autoStart ?? false
  };
}
var CollapseContext = react.createContext(null);
function useCollapseContext() {
  const ctx = react.useContext(CollapseContext);
  if (!ctx) {
    throw new Error(
      'Collapse hooks must be used within a <CollapseProvider>. Wrap your component tree with <CollapseProvider token="...">.'
    );
  }
  return ctx;
}
function CollapseProvider({
  children,
  ...config
}) {
  const resolved = react.useMemo(() => resolveConfig(config), [config]);
  const client = react.useMemo(
    () => createCollapseClient({
      baseUrl: resolved.apiBaseUrl,
      token: resolved.token
    }),
    [resolved.apiBaseUrl, resolved.token]
  );
  const value = react.useMemo(() => ({ config: resolved, client }), [resolved, client]);
  react.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-collapse-keyframes]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-collapse-keyframes", "");
    style.textContent = [
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}",
      "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
      "@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"
    ].join("");
    document.head.appendChild(style);
  }, []);
  return /* @__PURE__ */ jsxRuntime.jsx(CollapseContext.Provider, { value, children });
}
function waitForVideoReady(video, timeoutMs) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    (function check() {
      if (video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      if (Date.now() > deadline)
        return reject(new Error("Video not ready \u2014 no frames received"));
      requestAnimationFrame(check);
    })();
  });
}
function useScreenCapture(overrides) {
  let settings;
  try {
    const { config } = useCollapseContext();
    settings = {
      ...config.capture,
      ...overrides
    };
  } catch {
    settings = {
      intervalMs: overrides?.intervalMs ?? 6e4,
      jpegQuality: overrides?.jpegQuality ?? 0.85,
      maxWidth: overrides?.maxWidth ?? 1920,
      maxHeight: overrides?.maxHeight ?? 1080,
      displayMediaConstraints: overrides?.displayMediaConstraints
    };
  }
  const streamRef = react.useRef(null);
  const videoRef = react.useRef(null);
  const canvasRef = react.useRef(null);
  const [isSharing, setIsSharing] = react.useState(false);
  const settingsRef = react.useRef(settings);
  settingsRef.current = settings;
  const startSharing = react.useCallback(async () => {
    const s = settingsRef.current;
    const constraints = {
      video: {
        width: { ideal: s.maxWidth, max: s.maxWidth },
        height: { ideal: s.maxHeight, max: s.maxHeight },
        frameRate: { ideal: 1, max: 5 }
      },
      audio: false,
      ...s.displayMediaConstraints
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      if (err instanceof TypeError) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
      } else {
        throw err;
      }
    }
    streamRef.current = stream;
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await waitForVideoReady(video, shared.VIDEO_READY_TIMEOUT_MS);
    videoRef.current = video;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      streamRef.current = null;
      setIsSharing(false);
    });
    setIsSharing(true);
  }, []);
  const takeScreenshot = react.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const s = settingsRef.current;
    if (!video || !canvas || !streamRef.current) {
      return Promise.resolve(null);
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return Promise.resolve(null);
    }
    const scale = Math.min(
      s.maxWidth / video.videoWidth,
      s.maxHeight / video.videoHeight,
      1
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Promise.resolve(null);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const toBlobPromise = new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(
            blob ? { blob, width: canvas.width, height: canvas.height } : null
          );
        },
        "image/jpeg",
        s.jpegQuality
      );
    });
    const timeoutPromise = new Promise(
      (resolve) => setTimeout(() => resolve(null), shared.CANVAS_TO_BLOB_TIMEOUT_MS)
    );
    return Promise.race([toBlobPromise, timeoutPromise]);
  }, []);
  const stopSharing = react.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsSharing(false);
  }, []);
  return { isSharing, startSharing, takeScreenshot, stopSharing };
}
async function retry(fn, maxRetries, delays) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, delays[i] ?? delays[delays.length - 1]));
    }
  }
  throw new Error("Unreachable");
}
function useUploader() {
  const { client, config } = useCollapseContext();
  const { maxRetries, retryDelays, maxPendingBuffer } = config.retry;
  const [uploads, setUploads] = react.useState({
    pending: 0,
    completed: 0,
    failed: 0
  });
  const [trackedSeconds, setTrackedSeconds] = react.useState(0);
  const [lastScreenshotUrl, setLastScreenshotUrl] = react.useState(null);
  const [lastError, setLastError] = react.useState(null);
  const nextExpectedAtRef = react.useRef(null);
  const bufferRef = react.useRef([]);
  const processingRef = react.useRef(false);
  const processQueue = react.useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    while (bufferRef.current.length > 0) {
      const capture = bufferRef.current.shift();
      setUploads((s) => ({ ...s, pending: s.pending - 1 }));
      try {
        const { uploadUrl, screenshotId, nextExpectedAt } = await retry(
          () => client.getUploadUrl(),
          maxRetries,
          retryDelays
        );
        nextExpectedAtRef.current = nextExpectedAt;
        await retry(
          () => client.uploadToR2(uploadUrl, capture.blob),
          maxRetries,
          retryDelays
        );
        const result = await retry(
          () => client.confirmScreenshot({
            screenshotId,
            width: capture.width,
            height: capture.height,
            fileSize: capture.blob.size
          }),
          maxRetries,
          retryDelays
        );
        setTrackedSeconds(result.trackedSeconds);
        nextExpectedAtRef.current = result.nextExpectedAt;
        setLastScreenshotUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(capture.blob);
        });
        setUploads((s) => ({ ...s, completed: s.completed + 1 }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setLastError(msg);
        setUploads((s) => ({ ...s, failed: s.failed + 1 }));
        config.callbacks.onUploadFailure?.(err instanceof Error ? err : new Error(msg));
      }
    }
    processingRef.current = false;
  }, [client, maxRetries, retryDelays]);
  const enqueue = react.useCallback(
    (capture) => {
      if (bufferRef.current.length >= maxPendingBuffer) {
        bufferRef.current.shift();
        setUploads((s) => ({ ...s, pending: s.pending - 1, failed: s.failed + 1 }));
      }
      bufferRef.current.push(capture);
      setUploads((s) => ({ ...s, pending: s.pending + 1 }));
      processQueue();
    },
    [maxPendingBuffer, processQueue]
  );
  return {
    enqueue,
    uploads,
    trackedSeconds,
    lastScreenshotUrl,
    nextExpectedAt: nextExpectedAtRef.current,
    lastError
  };
}
function useSession() {
  const { client, config } = useCollapseContext();
  const pollIntervalMs = config.statusPollIntervalMs;
  const [state, setState] = react.useState({
    status: "loading",
    name: "",
    trackedSeconds: 0,
    screenshotCount: 0,
    startedAt: null,
    createdAt: null,
    totalActiveSeconds: 0,
    error: null
  });
  const pollRef = react.useRef(null);
  const loadSession = react.useCallback(async () => {
    let token;
    try {
      token = await client.resolveToken();
    } catch {
      setState((s) => ({ ...s, status: "no-token" }));
      return;
    }
    if (!token) {
      setState((s) => ({ ...s, status: "no-token" }));
      return;
    }
    try {
      const data = await client.getSession();
      setState({
        status: data.status,
        name: data.name,
        trackedSeconds: data.trackedSeconds,
        screenshotCount: data.screenshotCount,
        startedAt: data.startedAt,
        createdAt: data.createdAt,
        totalActiveSeconds: data.totalActiveSeconds,
        error: null
      });
      if (data.status === "compiling" || data.status === "stopped") {
        startPolling();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error"
      }));
    }
  }, [client]);
  const startPolling = react.useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await client.getStatus();
        setState((s) => ({
          ...s,
          status: data.status,
          trackedSeconds: data.trackedSeconds
        }));
        if (data.status === "complete" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        console.warn("[session] poll error:", e);
      }
    }, pollIntervalMs);
  }, [client, pollIntervalMs]);
  const pause = react.useCallback(async () => {
    const data = await client.pause();
    setState((s) => ({
      ...s,
      status: data.status,
      totalActiveSeconds: data.totalActiveSeconds
    }));
  }, [client]);
  const resume = react.useCallback(async () => {
    const data = await client.resume();
    setState((s) => ({ ...s, status: data.status }));
  }, [client]);
  const stop = react.useCallback(async (name) => {
    if (name) {
      try {
        await client.rename(name);
      } catch (e) {
        console.warn("[session] rename failed (non-fatal):", e);
      }
    }
    const data = await client.stop();
    setState((s) => ({
      ...s,
      status: data.status,
      trackedSeconds: data.trackedSeconds,
      totalActiveSeconds: data.totalActiveSeconds
    }));
    startPolling();
  }, [client, startPolling]);
  const updateTrackedSeconds = react.useCallback((seconds) => {
    setState((s) => ({ ...s, trackedSeconds: seconds }));
  }, []);
  const setError = react.useCallback((error) => {
    setState((s) => ({ ...s, error, ...error ? { status: "error" } : {} }));
  }, []);
  react.useEffect(() => {
    loadSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadSession]);
  return {
    ...state,
    pause,
    resume,
    stop,
    reload: loadSession,
    updateTrackedSeconds,
    setError
  };
}
function useSessionTimer(serverTrackedSeconds, isActive) {
  const [displaySeconds, setDisplaySeconds] = react.useState(serverTrackedSeconds);
  const lastSyncRef = react.useRef(Date.now());
  react.useEffect(() => {
    setDisplaySeconds(serverTrackedSeconds);
    lastSyncRef.current = Date.now();
  }, [serverTrackedSeconds]);
  react.useEffect(() => {
    if (!isActive) return;
    let raf;
    let lastRenderedSecond = -1;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - lastSyncRef.current) / 1e3);
      if (elapsed !== lastRenderedSecond) {
        lastRenderedSecond = elapsed;
        setDisplaySeconds(serverTrackedSeconds + elapsed);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isActive, serverTrackedSeconds]);
  return displaySeconds;
}
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds % 3600 / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function formatTrackedTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds % 3600 / 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}min`;
  return "< 1min";
}

// src/hooks/useCollapse.ts
function useCollapse() {
  const { config } = useCollapseContext();
  const callbacksRef = react.useRef(config.callbacks);
  callbacksRef.current = config.callbacks;
  const session = useSession();
  const capture = useScreenCapture();
  const uploader = useUploader();
  const displaySeconds = useSessionTimer(
    session.trackedSeconds,
    session.status === "active" && capture.isSharing
  );
  const intervalRef = react.useRef(null);
  const capturingRef = react.useRef(false);
  const prevStatusRef = react.useRef(session.status);
  react.useEffect(() => {
    if (uploader.trackedSeconds > 0) {
      session.updateTrackedSeconds(uploader.trackedSeconds);
    }
  }, [uploader.trackedSeconds, session.updateTrackedSeconds]);
  react.useEffect(() => {
    const prev = prevStatusRef.current;
    const next = session.status;
    if (prev !== next) {
      callbacksRef.current.onStatusChange?.(prev, next);
      if (next === "failed") {
        callbacksRef.current.onCompilationFailed?.();
      }
      prevStatusRef.current = next;
    }
  }, [session.status]);
  const captureAndUploadRef = react.useRef(async () => {
    const result = await capture.takeScreenshot();
    if (result) {
      callbacksRef.current.onCapture?.(result);
      uploader.enqueue(result);
    }
  });
  captureAndUploadRef.current = async () => {
    const result = await capture.takeScreenshot();
    if (result) {
      callbacksRef.current.onCapture?.(result);
      uploader.enqueue(result);
    }
  };
  const isActive = session.status === "active" || session.status === "pending";
  react.useEffect(() => {
    if (!capture.isSharing || !isActive) return;
    capturingRef.current = true;
    captureAndUploadRef.current();
    const id = setInterval(() => captureAndUploadRef.current(), config.capture.intervalMs);
    intervalRef.current = id;
    return () => {
      capturingRef.current = false;
      clearInterval(id);
      intervalRef.current = null;
    };
  }, [capture.isSharing, isActive, config.capture.intervalMs]);
  react.useEffect(() => {
    if (capture.isSharing && session.status === "paused") {
      session.resume().then(() => {
        callbacksRef.current.onResume?.();
      }).catch(() => {
      });
    }
  }, [capture.isSharing, session.status, session.resume]);
  react.useEffect(() => {
    if (!capture.isSharing && session.status === "active" && capturingRef.current) {
      capturingRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      callbacksRef.current.onShareStop?.();
      session.pause().catch(() => {
      });
    }
  }, [capture.isSharing, session.status, session.pause]);
  react.useEffect(() => {
    if (config.autoStart && !capture.isSharing && (session.status === "pending" || session.status === "active")) {
      capture.startSharing().catch(() => {
      });
    }
  }, [config.autoStart, session.status, capture.isSharing, capture.startSharing]);
  const startSharing = react.useCallback(async () => {
    try {
      await capture.startSharing();
      callbacksRef.current.onShareStart?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      let message;
      if (e.name === "NotAllowedError") {
        message = "Screen sharing permission was denied. Please try again and select a screen to share.";
      } else if (e.name === "AbortError") {
        message = "Screen sharing was cancelled.";
      } else {
        message = e.message || "Failed to start screen sharing.";
      }
      callbacksRef.current.onError?.(new Error(message), "startSharing");
      session.setError(message);
    }
  }, [capture.startSharing, session]);
  const stopSharing = react.useCallback(() => {
    capture.stopSharing();
    callbacksRef.current.onShareStop?.();
  }, [capture.stopSharing]);
  const pause = react.useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    capturingRef.current = false;
    await session.pause();
    callbacksRef.current.onPause?.({ totalActiveSeconds: session.totalActiveSeconds });
  }, [session.pause, session.totalActiveSeconds]);
  const resume = react.useCallback(async () => {
    await session.resume();
    callbacksRef.current.onResume?.();
  }, [session.resume]);
  const stop = react.useCallback(async (options) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    capturingRef.current = false;
    capture.stopSharing();
    await session.stop(options?.name);
    callbacksRef.current.onStop?.({
      trackedSeconds: session.trackedSeconds,
      totalActiveSeconds: session.totalActiveSeconds
    });
  }, [session.stop, session.trackedSeconds, session.totalActiveSeconds, capture.stopSharing]);
  const state = {
    status: session.status,
    isSharing: capture.isSharing,
    trackedSeconds: session.trackedSeconds,
    displaySeconds,
    screenshotCount: session.screenshotCount,
    uploads: uploader.uploads,
    lastScreenshotUrl: uploader.lastScreenshotUrl,
    videoUrl: null,
    error: session.error
  };
  const actions = {
    startSharing,
    stopSharing,
    pause,
    resume,
    stop
  };
  return { state, actions };
}

// src/ui/theme.ts
var colors = {
  bg: { body: "#0a0a0a", surface: "#1a1a1a", sunken: "#111" },
  text: { primary: "#fff", secondary: "#888", tertiary: "#666", quaternary: "#555", error: "#fca5a5" },
  border: { default: "#333", hover: "#444" },
  status: {
    success: "#22c55e",
    info: "#3b82f6",
    warning: "#f59e0b",
    danger: "#ef4444",
    neutral: "#888"
  }
};
var spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
var radii = { sm: 6, md: 8, lg: 10 };
var fontSize = { xs: 11, sm: 12, md: 13, lg: 14, xl: 16, xxl: 18, heading: 20, display: 24, timer: 32 };
var fontWeight = { normal: 400, medium: 500, semibold: 600, bold: 700 };
var statusConfig = {
  pending: { label: "Pending", color: colors.status.neutral },
  active: { label: "Recording", color: colors.status.success },
  paused: { label: "Paused", color: colors.status.warning },
  stopped: { label: "Processing", color: colors.status.info },
  compiling: { label: "Compiling", color: colors.status.info },
  complete: { label: "Complete", color: colors.status.success },
  failed: { label: "Failed", color: colors.status.danger }
};
function StatusBar({ displaySeconds, screenshotCount, uploads }) {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.md}px ${spacing.xl}px`,
    background: colors.bg.surface,
    borderRadius: radii.md,
    marginBottom: spacing.lg
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
      fontSize: fontSize.timer,
      fontWeight: fontWeight.bold,
      fontVariantNumeric: "tabular-nums",
      color: colors.text.primary
    }, children: formatTime(displaySeconds) }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: spacing.lg, fontSize: fontSize.lg, color: colors.text.secondary }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
        screenshotCount + uploads.completed,
        " ",
        screenshotCount + uploads.completed === 1 ? "screenshot" : "screenshots"
      ] }),
      uploads.pending > 0 && /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { color: colors.status.warning }, children: [
        uploads.pending,
        " uploading..."
      ] }),
      uploads.failed > 0 && /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { color: colors.status.danger }, children: [
        uploads.failed,
        " failed"
      ] })
    ] })
  ] });
}
function ScreenPreview({ imageUrl }) {
  if (!imageUrl) return null;
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: styles.container, children: [
    /* @__PURE__ */ jsxRuntime.jsx("img", { src: imageUrl, alt: "Last captured screenshot", style: styles.image }),
    /* @__PURE__ */ jsxRuntime.jsx("span", { style: styles.label, children: "Latest screenshot" })
  ] });
}
var styles = {
  container: {
    position: "relative",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    background: "#111",
    border: "1px solid #333"
  },
  image: { width: "100%", display: "block" },
  label: {
    position: "absolute",
    bottom: 8,
    right: 8,
    fontSize: 12,
    color: "#aaa",
    background: "rgba(0,0,0,0.7)",
    padding: "2px 8px",
    borderRadius: 4
  }
};
var sizes = { sm: 16, md: 24, lg: 40 };
var borders = { sm: 2, md: 3, lg: 4 };
function Spinner({ size = "md", color = colors.status.info }) {
  const s = sizes[size];
  const b = borders[size];
  return /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
    width: s,
    height: s,
    borderRadius: "50%",
    border: `${b}px solid ${colors.border.default}`,
    borderTopColor: color,
    animation: "spin 1s linear infinite",
    flexShrink: 0
  } });
}
var variantStyles = {
  primary: { background: colors.status.info, color: "#fff", border: "none" },
  success: { background: colors.status.success, color: "#fff", border: "none" },
  danger: { background: colors.status.danger, color: "#fff", border: "none" },
  warning: { background: colors.status.warning, color: "#000", border: "none" },
  secondary: { background: "transparent", color: colors.text.secondary, border: `1px solid ${colors.border.hover}` },
  ghost: { background: "transparent", color: colors.text.secondary, border: "none" }
};
var sizeStyles = {
  sm: { padding: "6px 12px", fontSize: 12 },
  md: { padding: "8px 16px", fontSize: 13 },
  lg: { padding: "12px 24px", fontSize: 15 }
};
function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  ...rest
}) {
  const isDisabled = disabled || loading;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "button",
    {
      disabled: isDisabled,
      style: {
        fontWeight: fontWeight.semibold,
        borderRadius: radii.md,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : void 0,
        transition: "opacity 0.15s",
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style
      },
      ...rest,
      children: [
        loading && /* @__PURE__ */ jsxRuntime.jsx(Spinner, { size: "sm", color: variant === "warning" ? "#000" : "#fff" }),
        children
      ]
    }
  );
}
function RecordingControls({
  status,
  isSharing,
  onStartSharing,
  onPause,
  onResume,
  onStop,
  loading
}) {
  const isActive = status === "active" || status === "pending";
  const isPaused = status === "paused";
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    flexWrap: "wrap"
  }, children: [
    !isSharing && isActive && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "success", size: "lg", onClick: onStartSharing, loading, children: "Share Screen & Start Recording" }),
    !isSharing && isPaused && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "primary", size: "lg", onClick: onStartSharing, loading, children: "Share Screen & Resume" }),
      /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "danger", size: "md", onClick: onStop, children: "Stop Session" })
    ] }),
    isSharing && isActive && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: colors.status.danger,
        animation: "pulse 1.5s ease-in-out infinite"
      } }),
      /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        color: colors.status.danger,
        marginRight: spacing.sm
      }, children: "Recording" }),
      /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "warning", size: "md", onClick: onPause, children: "Pause" }),
      /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "danger", size: "md", onClick: onStop, children: "Stop" })
    ] })
  ] });
}
function ProcessingState({ status, trackedSeconds, videoUrl, error, onVideoLoaded }) {
  const containerStyle = {
    borderRadius: radii.lg,
    overflow: "hidden",
    background: colors.bg.sunken,
    aspectRatio: "16/9",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md
  };
  if (status === "complete" && videoUrl) {
    return /* @__PURE__ */ jsxRuntime.jsx("div", { style: { borderRadius: radii.lg, overflow: "hidden", background: colors.bg.sunken, aspectRatio: "16/9" }, children: /* @__PURE__ */ jsxRuntime.jsx("video", { src: videoUrl, controls: true, autoPlay: false, style: { width: "100%", height: "100%", display: "block" } }) });
  }
  if (status === "complete" && error) {
    return /* @__PURE__ */ jsxRuntime.jsx("div", { style: containerStyle, children: /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.lg, color: colors.text.secondary, textAlign: "center" }, children: "No video available" }) });
  }
  if (status === "failed") {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: containerStyle, children: [
      /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.status.danger }, children: "Compilation failed" }),
      /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.md, color: colors.text.secondary }, children: "It will be retried automatically." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: containerStyle, children: [
    /* @__PURE__ */ jsxRuntime.jsx(Spinner, { size: "lg" }),
    /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text.primary }, children: status === "complete" ? "Loading video..." : "Compiling your timelapse..." }),
    /* @__PURE__ */ jsxRuntime.jsxs("p", { style: { fontSize: fontSize.md, color: colors.text.secondary }, children: [
      "Tracked time: ",
      formatTrackedTime(trackedSeconds)
    ] })
  ] });
}
function ErrorDisplay({ error, variant = "banner", title, onDismiss, onCopy, action }) {
  if (variant === "page") {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing.xxl, textAlign: "center" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.status.danger, marginBottom: spacing.sm }, children: title || "Error" }),
      /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: 400, maxHeight: 150, overflowY: "auto", color: colors.text.error, marginBottom: spacing.lg }, children: error }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: spacing.sm, justifyContent: "center" }, children: [
        action && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "primary", size: "md", onClick: action.onClick, children: action.label }),
        onCopy && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "secondary", size: "md", onClick: onCopy, children: "Copy Error" })
      ] })
    ] });
  }
  if (variant === "inline") {
    return /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", color: colors.text.error, maxHeight: 150, overflowY: "auto" }, children: error });
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: `${spacing.md}px ${spacing.lg}px`, marginBottom: spacing.md, background: "rgba(239,68,68,0.15)", border: `1px solid ${colors.status.danger}`, borderRadius: radii.md, color: colors.text.error, fontSize: fontSize.md, display: "flex", alignItems: "flex-start", gap: spacing.sm }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { flex: 1 }, children: [
      title && /* @__PURE__ */ jsxRuntime.jsx("strong", { style: { display: "block", marginBottom: spacing.xs }, children: title }),
      /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflowY: "auto" }, children: error })
    ] }),
    onCopy && /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onCopy, style: { background: "none", border: "1px solid " + colors.text.error, color: colors.text.error, cursor: "pointer", fontSize: fontSize.xs, lineHeight: 1, padding: "2px 8px", borderRadius: radii.sm, whiteSpace: "nowrap" }, children: "Copy" }),
    onDismiss && /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onDismiss, style: { background: "none", border: "none", color: colors.text.error, cursor: "pointer", fontSize: fontSize.xl, lineHeight: 1, padding: 0 }, children: "\xD7" })
  ] });
}
function PageContainer({ children, maxWidth = 640, centered = false, style }) {
  return /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
    maxWidth,
    margin: "0 auto",
    padding: spacing.lg,
    ...centered ? {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh"
    } : {},
    ...style
  }, children });
}
function CollapseRecorder() {
  const { state, actions } = useCollapse();
  if (state.status === "loading") {
    return /* @__PURE__ */ jsxRuntime.jsx(PageContainer, { centered: true, children: /* @__PURE__ */ jsxRuntime.jsx(Spinner, { size: "lg" }) });
  }
  if (state.status === "no-token") {
    return /* @__PURE__ */ jsxRuntime.jsxs(PageContainer, { centered: true, children: [
      /* @__PURE__ */ jsxRuntime.jsx("h2", { style: { fontSize: fontSize.display, fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: spacing.sm }, children: "No session token" }),
      /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.xl, color: colors.text.secondary, textAlign: "center", maxWidth: 400 }, children: "This page requires a session token. You should have been redirected here from another service." })
    ] });
  }
  if (state.status === "error") {
    return /* @__PURE__ */ jsxRuntime.jsx(PageContainer, { centered: true, children: /* @__PURE__ */ jsxRuntime.jsx(ErrorDisplay, { error: state.error ?? "Unknown error", variant: "page" }) });
  }
  if (state.status === "stopped" || state.status === "compiling" || state.status === "complete" || state.status === "failed") {
    return /* @__PURE__ */ jsxRuntime.jsx(PageContainer, { maxWidth: 800, style: { padding: spacing.xxl }, children: /* @__PURE__ */ jsxRuntime.jsx(
      ProcessingState,
      {
        status: state.status,
        trackedSeconds: state.trackedSeconds
      }
    ) });
  }
  return /* @__PURE__ */ jsxRuntime.jsxs(PageContainer, { maxWidth: 800, style: { padding: spacing.xxl }, children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      StatusBar,
      {
        displaySeconds: state.displaySeconds,
        screenshotCount: state.screenshotCount,
        uploads: state.uploads
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(ScreenPreview, { imageUrl: state.lastScreenshotUrl }),
    /* @__PURE__ */ jsxRuntime.jsx(
      RecordingControls,
      {
        status: state.status,
        isSharing: state.isSharing,
        onStartSharing: actions.startSharing,
        onPause: actions.pause,
        onResume: actions.resume,
        onStop: actions.stop
      }
    )
  ] });
}
function ResultView({ status, trackedSeconds }) {
  const { client, config } = useCollapseContext();
  const [videoUrl, setVideoUrl] = react.useState(null);
  const [error, setError] = react.useState(null);
  react.useEffect(() => {
    if (status === "complete") {
      client.getVideo().then((data) => {
        if (data.videoUrl && !data.videoUrl.startsWith("https://")) {
          throw new Error("Invalid video URL: must be HTTPS.");
        }
        setVideoUrl(data.videoUrl);
        config.callbacks.onComplete?.({ videoUrl: data.videoUrl });
      }).catch(
        (err) => setError(err instanceof Error ? err.message : "Failed to load video")
      );
    }
  }, [status, client, config.callbacks]);
  return /* @__PURE__ */ jsxRuntime.jsx(
    ProcessingState,
    {
      status,
      trackedSeconds,
      videoUrl,
      error
    }
  );
}
function Badge({ status, variant = "overlay" }) {
  const config = statusConfig[status] ?? { label: status, color: "#888" };
  const isOverlay = variant === "overlay";
  return /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
    fontSize: fontSize.xs - 1,
    // 10px
    fontWeight: fontWeight.semibold,
    color: config.color,
    padding: "2px 8px",
    borderRadius: 4,
    ...isOverlay ? { background: "rgba(0,0,0,0.7)", border: `1px solid ${config.color}` } : { background: `${config.color}15` }
  }, children: config.label });
}
function Card({ children, onClick, padding, style }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      onClick,
      role: onClick ? "button" : void 0,
      tabIndex: onClick ? 0 : void 0,
      style: {
        background: colors.bg.surface,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radii.lg,
        overflow: "hidden",
        cursor: onClick ? "pointer" : void 0,
        transition: "border-color 0.15s",
        padding,
        ...style
      },
      children
    }
  );
}
function SessionCard({ session, onClick, onArchive }) {
  const date = new Date(session.createdAt);
  const dateStr = date.toLocaleDateString(void 0, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== (/* @__PURE__ */ new Date()).getFullYear() ? "numeric" : void 0
  });
  return /* @__PURE__ */ jsxRuntime.jsxs(Card, { onClick, style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { position: "relative", aspectRatio: "16/9", background: colors.bg.sunken, overflow: "hidden" }, children: [
      session.thumbnailUrl ? /* @__PURE__ */ jsxRuntime.jsx(
        "img",
        {
          src: session.thumbnailUrl,
          alt: "Timelapse thumbnail",
          style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
          loading: "lazy"
        }
      ) : /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg.sunken }, children: /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: colors.text.quaternary, strokeWidth: "1.5", children: [
        /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21" })
      ] }) }),
      /* @__PURE__ */ jsxRuntime.jsx("span", { style: { position: "absolute", top: spacing.sm, right: spacing.sm }, children: /* @__PURE__ */ jsxRuntime.jsx(Badge, { status: session.status, variant: "overlay" }) })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: `${spacing.md}px ${spacing.md}px` }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        color: colors.text.primary,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginBottom: 2
      }, children: session.name }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: [
        formatTrackedTime(session.trackedSeconds),
        " \xB7 ",
        dateStr
      ] })
    ] }),
    onArchive && /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        style: {
          position: "absolute",
          top: 6,
          left: 6,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.6)",
          color: colors.text.secondary,
          border: "none",
          cursor: "pointer",
          fontSize: fontSize.lg,
          lineHeight: "24px",
          textAlign: "center",
          padding: 0
        },
        onClick: (e) => {
          e.stopPropagation();
          onArchive();
        },
        title: "Archive",
        children: "\xD7"
      }
    )
  ] });
}
function Skeleton({ width, height, borderRadius = radii.md, aspectRatio, style }) {
  return /* @__PURE__ */ jsxRuntime.jsx("div", { style: {
    width: width ?? "100%",
    height: height ?? (aspectRatio ? void 0 : 20),
    aspectRatio,
    borderRadius,
    background: `linear-gradient(90deg, ${colors.bg.surface} 25%, ${colors.border.default} 50%, ${colors.bg.surface} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s ease-in-out infinite",
    ...style
  } });
}
function GallerySkeleton() {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 180, height: 24 }),
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 36, height: 36, borderRadius: radii.sm })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: spacing.md }, children: [1, 2, 3].map((i) => /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { borderRadius: radii.lg, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { aspectRatio: "16/9", borderRadius: 0 }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: `${spacing.md}px ${spacing.md}px`, background: colors.bg.surface }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: "60%", height: 16, style: { marginBottom: spacing.xs } }),
        /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: "40%", height: 12 })
      ] })
    ] }, i)) })
  ] });
}
function SessionDetailSkeleton() {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 80, height: 32, borderRadius: radii.sm }),
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 80, height: 32, borderRadius: radii.sm })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { aspectRatio: "16/9", borderRadius: radii.lg, style: { marginBottom: spacing.lg } }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: spacing.lg, justifyContent: "center" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: "45%", height: 64, borderRadius: radii.md }),
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: "45%", height: 64, borderRadius: radii.md })
    ] })
  ] });
}
function RecordPageSkeleton() {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 480, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 80, height: 32, borderRadius: radii.sm }),
      /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { width: 100, height: 32, borderRadius: radii.sm })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { aspectRatio: "16/9", borderRadius: radii.lg, style: { marginBottom: spacing.lg } }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "flex", flexDirection: "column", gap: spacing.sm }, children: [1, 2, 3].map((i) => /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { height: 48, borderRadius: radii.md }, i)) }),
    /* @__PURE__ */ jsxRuntime.jsx(Skeleton, { height: 48, borderRadius: radii.lg, style: { marginTop: spacing.lg } })
  ] });
}
function Gallery({
  sessions,
  loading,
  error,
  onSessionClick,
  onArchive,
  onRefresh
}) {
  if (loading && sessions.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(GallerySkeleton, {});
  }
  if (error && sessions.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: /* @__PURE__ */ jsxRuntime.jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0 }, children: "Your Timelapses" }) }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, padding: spacing.xxl }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(ErrorDisplay, { error, variant: "inline" }),
        onRefresh && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "primary", size: "md", onClick: onRefresh, style: { marginTop: spacing.md }, children: "Retry" })
      ] })
    ] });
  }
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: /* @__PURE__ */ jsxRuntime.jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0 }, children: "Your Timelapses" }) }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, padding: spacing.xxl }, children: [
        /* @__PURE__ */ jsxRuntime.jsx("p", { style: { marginBottom: spacing.md }, children: /* @__PURE__ */ jsxRuntime.jsxs("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: colors.border.hover, strokeWidth: "1.5", children: [
          /* @__PURE__ */ jsxRuntime.jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
          /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
          /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21" })
        ] }) }),
        /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.lg, color: colors.text.secondary, textAlign: "center" }, children: "No timelapses yet" }),
        /* @__PURE__ */ jsxRuntime.jsx("p", { style: { fontSize: fontSize.sm, color: colors.text.quaternary, marginTop: spacing.xs, textAlign: "center" }, children: "Start a recording session to see it here." })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0 }, children: "Your Timelapses" }),
      onRefresh && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "ghost", size: "sm", onClick: onRefresh, title: "Refresh", style: { fontSize: fontSize.xxl }, children: "\u21BB" })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: spacing.md }, children: sessions.map((s) => /* @__PURE__ */ jsxRuntime.jsx(
      SessionCard,
      {
        session: s,
        onClick: () => onSessionClick?.(s.token),
        onArchive: onArchive ? () => onArchive(s.token) : void 0
      },
      s.token
    )) })
  ] });
}
function SessionDetail({
  token,
  apiBaseUrl,
  onBack,
  onArchive
}) {
  const [sessionInfo, setSessionInfo] = react.useState(null);
  const [status, setStatus] = react.useState(null);
  const [videoUrl, setVideoUrl] = react.useState(null);
  const [error, setError] = react.useState(null);
  react.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sessions/${token}`);
        if (res.ok) {
          const data = await res.json();
          setSessionInfo({ name: data.name, createdAt: data.createdAt });
        }
      } catch {
      }
    })();
  }, [token, apiBaseUrl]);
  const fetchStatus = react.useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${token}/status`);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} from /api/sessions/${token}/status
${body.slice(0, 500)}`);
      }
      const data = await res.json();
      setStatus(data);
      if (data.status === "complete" && !videoUrl) {
        try {
          const vRes = await fetch(`${apiBaseUrl}/api/sessions/${token}/video`);
          if (vRes.ok) {
            const v = await vRes.json();
            setVideoUrl(v.videoUrl);
          }
        } catch {
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token, apiBaseUrl, videoUrl]);
  react.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);
  react.useEffect(() => {
    if (!status || !["stopped", "compiling"].includes(status.status)) return;
    const interval = setInterval(fetchStatus, 3e3);
    return () => clearInterval(interval);
  }, [status?.status, fetchStatus]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { maxWidth: 640, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: [
      onBack && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "secondary", size: "sm", onClick: onBack, children: "\u2190 Back" }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { display: "flex", gap: spacing.sm }, children: onArchive && /* @__PURE__ */ jsxRuntime.jsx(Button, { variant: "secondary", size: "sm", onClick: onArchive, children: "Archive" }) })
    ] }),
    sessionInfo && /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text.primary }, children: sessionInfo.name }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 }, children: new Date(sessionInfo.createdAt).toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" }) })
    ] }),
    error && /* @__PURE__ */ jsxRuntime.jsx(ErrorDisplay, { error, variant: "banner", title: "Error" }),
    !status && !error && /* @__PURE__ */ jsxRuntime.jsx(SessionDetailSkeleton, {}),
    status && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { marginBottom: spacing.lg }, children: /* @__PURE__ */ jsxRuntime.jsx(
        ProcessingState,
        {
          status: status.status,
          trackedSeconds: status.trackedSeconds,
          videoUrl
        }
      ) }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: spacing.lg, justifyContent: "center" }, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: `${spacing.md}px ${spacing.xxl}px`, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: spacing.xs }, children: [
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text.primary }, children: formatTrackedTime(status.trackedSeconds) }),
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: "Tracked time" })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: `${spacing.md}px ${spacing.xxl}px`, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: spacing.xs }, children: [
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
            fontSize: fontSize.xxl,
            fontWeight: fontWeight.bold,
            color: (statusConfig[status.status] ?? { color: colors.text.secondary }).color
          }, children: (statusConfig[status.status] ?? { label: status.status }).label }),
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: "Status" })
        ] })
      ] })
    ] })
  ] });
}
var STORAGE_KEY = "collapse-tokens";
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function writeStore(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}
function useTokenStore() {
  const [entries, setEntries] = react.useState(readStore);
  react.useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) {
        setEntries(readStore());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const persist = react.useCallback((next) => {
    setEntries(next);
    writeStore(next);
  }, []);
  const addToken = react.useCallback(
    (token, label) => {
      const current = readStore();
      if (current.some((e) => e.token === token)) return;
      persist([
        ...current,
        { token, addedAt: (/* @__PURE__ */ new Date()).toISOString(), label, archived: false }
      ]);
    },
    [persist]
  );
  const archiveToken = react.useCallback(
    (token) => {
      const current = readStore();
      persist(
        current.map(
          (e) => e.token === token ? { ...e, archived: true } : e
        )
      );
    },
    [persist]
  );
  const unarchiveToken = react.useCallback(
    (token) => {
      const current = readStore();
      persist(
        current.map(
          (e) => e.token === token ? { ...e, archived: false } : e
        )
      );
    },
    [persist]
  );
  const removeToken = react.useCallback(
    (token) => {
      const current = readStore();
      persist(current.filter((e) => e.token !== token));
    },
    [persist]
  );
  const tokens = entries.filter((e) => !e.archived);
  const archivedTokens = entries.filter((e) => e.archived);
  const getAllTokenValues = react.useCallback(
    () => tokens.map((e) => e.token),
    [tokens]
  );
  const hasToken = react.useCallback(
    (token) => entries.some((e) => e.token === token),
    [entries]
  );
  return {
    tokens,
    archivedTokens,
    addToken,
    archiveToken,
    unarchiveToken,
    removeToken,
    getAllTokenValues,
    hasToken
  };
}
function useGallery({ apiBaseUrl, tokens }) {
  const [sessions, setSessions] = react.useState([]);
  const [loading, setLoading] = react.useState(true);
  const [error, setError] = react.useState(null);
  const [refreshCounter, setRefreshCounter] = react.useState(0);
  const tokensKey = tokens.join(",");
  const refresh = react.useCallback(() => setRefreshCounter((c) => c + 1), []);
  react.useEffect(() => {
    if (tokens.length === 0) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const validTokens = tokens.filter((t) => /^[a-f0-9]{64}$/i.test(t));
    if (validTokens.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${apiBaseUrl}/api/sessions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: validTokens })
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}
${text.slice(0, 500)}`);
      }
      return res.json();
    }).then((data) => {
      if (!cancelled) {
        setSessions(data.sessions ?? []);
        setError(null);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn("Gallery fetch error:", err);
        setError(err.message);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, tokensKey, refreshCounter]);
  react.useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refresh]);
  return { sessions, loading, error, refresh };
}
function parseHash(hash) {
  const cleaned = hash.replace(/^#\/?/, "");
  if (!cleaned || cleaned === "/") return { page: "gallery" };
  const [path, queryStr] = cleaned.split("?");
  const params = new URLSearchParams(queryStr ?? "");
  const token = params.get("token") ?? "";
  if (path === "record" && token) return { page: "record", token };
  if (path === "session" && token) return { page: "session", token };
  return { page: "gallery" };
}
function routeToHash(route) {
  switch (route.page) {
    case "gallery":
      return "#/";
    case "record":
      return `#/record?token=${route.token}`;
    case "session":
      return `#/session?token=${route.token}`;
  }
}
function useHashRouter() {
  const [route, setRoute] = react.useState(() => parseHash(window.location.hash));
  react.useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const navigate = react.useCallback((r) => {
    window.location.hash = routeToHash(r);
  }, []);
  return { route, navigate };
}

Object.defineProperty(exports, "SESSION_STATUSES", {
  enumerable: true,
  get: function () { return shared.SESSION_STATUSES; }
});
exports.Badge = Badge;
exports.Button = Button;
exports.Card = Card;
exports.CollapseProvider = CollapseProvider;
exports.CollapseRecorder = CollapseRecorder;
exports.ErrorDisplay = ErrorDisplay;
exports.Gallery = Gallery;
exports.GallerySkeleton = GallerySkeleton;
exports.PageContainer = PageContainer;
exports.ProcessingState = ProcessingState;
exports.RecordPageSkeleton = RecordPageSkeleton;
exports.RecordingControls = RecordingControls;
exports.ResultView = ResultView;
exports.ScreenPreview = ScreenPreview;
exports.SessionCard = SessionCard;
exports.SessionDetail = SessionDetail;
exports.SessionDetailSkeleton = SessionDetailSkeleton;
exports.Skeleton = Skeleton;
exports.Spinner = Spinner;
exports.StatusBar = StatusBar;
exports.colors = colors;
exports.createCollapseClient = createCollapseClient;
exports.fontSize = fontSize;
exports.fontWeight = fontWeight;
exports.formatTime = formatTime;
exports.formatTrackedTime = formatTrackedTime;
exports.radii = radii;
exports.spacing = spacing;
exports.statusConfig = statusConfig;
exports.useCollapse = useCollapse;
exports.useGallery = useGallery;
exports.useHashRouter = useHashRouter;
exports.useScreenCapture = useScreenCapture;
exports.useSession = useSession;
exports.useSessionTimer = useSessionTimer;
exports.useTokenStore = useTokenStore;
exports.useUploader = useUploader;
