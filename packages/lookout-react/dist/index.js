import { createContext, useMemo, useEffect, useRef, useState, useCallback, useContext } from 'react';
import { VIDEO_READY_TIMEOUT_MS, MAX_PENDING_BUFFER, UPLOAD_RETRY_DELAYS_MS, MAX_UPLOAD_RETRIES, MAX_HEIGHT, MAX_WIDTH, JPEG_QUALITY, SCREENSHOT_INTERVAL_MS, CANVAS_TO_BLOB_TIMEOUT_MS } from '@lookout/shared';
export { SESSION_STATUSES } from '@lookout/shared';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { motion, AnimatePresence } from 'motion/react';
import { Squircle } from '@squircle-js/react';
import { createPlayer } from '@videojs/react';
import { videoFeatures, VideoSkin, Video } from '@videojs/react/video';
import '@videojs/react/video/skin.css';

// src/LookoutProvider.tsx

// src/api/client.ts
var HttpError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
};
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
    throw new HttpError(
      res.status,
      `HTTP ${res.status} ${res.statusText} from ${url}${detail ? "\n" + detail.slice(0, 500) : ""}`
    );
  }
  return res.json();
}
function createLookoutClient(options) {
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
      intervalMs: config.capture?.intervalMs ?? SCREENSHOT_INTERVAL_MS,
      jpegQuality: config.capture?.jpegQuality ?? JPEG_QUALITY,
      maxWidth: config.capture?.maxWidth ?? MAX_WIDTH,
      maxHeight: config.capture?.maxHeight ?? MAX_HEIGHT,
      displayMediaConstraints: config.capture?.displayMediaConstraints,
      mode: config.capture?.mode ?? "screen",
      camera: {
        deviceId: config.capture?.camera?.deviceId,
        userMediaConstraints: config.capture?.camera?.userMediaConstraints
      }
    },
    retry: {
      maxRetries: config.retry?.maxRetries ?? MAX_UPLOAD_RETRIES,
      retryDelays: config.retry?.retryDelays ?? UPLOAD_RETRY_DELAYS_MS,
      maxPendingBuffer: config.retry?.maxPendingBuffer ?? MAX_PENDING_BUFFER
    },
    callbacks: config.callbacks ?? {},
    statusPollIntervalMs: config.statusPollIntervalMs ?? 3e3,
    autoStart: config.autoStart ?? false
  };
}
var LookoutContext = createContext(null);
function useLookoutContext() {
  const ctx = useContext(LookoutContext);
  if (!ctx) {
    throw new Error(
      'Lookout hooks must be used within a <LookoutProvider>. Wrap your component tree with <LookoutProvider token="...">.'
    );
  }
  return ctx;
}
function LookoutProvider({
  children,
  ...config
}) {
  const resolved = useMemo(() => resolveConfig(config), [config]);
  const client = useMemo(
    () => createLookoutClient({
      baseUrl: resolved.apiBaseUrl,
      token: resolved.token
    }),
    [resolved.apiBaseUrl, resolved.token]
  );
  const value = useMemo(() => ({ config: resolved, client }), [resolved, client]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-lookout-keyframes]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-lookout-keyframes", "");
    style.textContent = [
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}",
      "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
      "@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"
    ].join("");
    document.head.appendChild(style);
  }, []);
  return /* @__PURE__ */ jsx(LookoutContext.Provider, { value, children });
}
function waitForVideoReady(video, timeoutMs = VIDEO_READY_TIMEOUT_MS) {
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
function captureFrameAsJpeg(video, canvas, settings) {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return Promise.resolve(null);
  }
  const scale = Math.min(
    settings.maxWidth / video.videoWidth,
    settings.maxHeight / video.videoHeight,
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
      settings.jpegQuality
    );
  });
  const timeoutPromise = new Promise(
    (resolve) => setTimeout(() => resolve(null), CANVAS_TO_BLOB_TIMEOUT_MS)
  );
  return Promise.race([toBlobPromise, timeoutPromise]);
}

// src/hooks/useScreenCapture.ts
function useScreenCapture(overrides) {
  let settings;
  try {
    const { config } = useLookoutContext();
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
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isSharing, setIsSharing] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const startSharing = useCallback(async () => {
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
    await waitForVideoReady(video);
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
  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const s = settingsRef.current;
    if (!video || !canvas || !streamRef.current) {
      return Promise.resolve(null);
    }
    return captureFrameAsJpeg(video, canvas, s);
  }, []);
  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsSharing(false);
  }, []);
  return { isSharing, startSharing, takeScreenshot, stopSharing };
}
function useCameraCapture(overrides) {
  let settings;
  try {
    const { config } = useLookoutContext();
    settings = {
      maxWidth: overrides?.maxWidth ?? config.capture.maxWidth,
      maxHeight: overrides?.maxHeight ?? config.capture.maxHeight,
      jpegQuality: overrides?.jpegQuality ?? config.capture.jpegQuality,
      deviceId: overrides?.camera?.deviceId ?? config.capture.camera.deviceId,
      userMediaConstraints: overrides?.camera?.userMediaConstraints ?? config.capture.camera.userMediaConstraints
    };
  } catch {
    settings = {
      maxWidth: overrides?.maxWidth ?? 1920,
      maxHeight: overrides?.maxHeight ?? 1080,
      jpegQuality: overrides?.jpegQuality ?? 0.85,
      deviceId: overrides?.camera?.deviceId,
      userMediaConstraints: overrides?.camera?.userMediaConstraints
    };
  }
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    settings.deviceId ?? null
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const enumerateDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((d) => d.kind === "videoinput");
      setDevices(cameras);
      return cameras;
    } catch {
      return [];
    }
  }, []);
  useEffect(() => {
    enumerateDevices();
    const handler = () => enumerateDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [enumerateDevices]);
  const acquireStream = useCallback(
    async (deviceIdOverride) => {
      const s = settingsRef.current;
      const videoConstraints = {
        width: { ideal: s.maxWidth, max: s.maxWidth },
        height: { ideal: s.maxHeight, max: s.maxHeight },
        ...s.userMediaConstraints
      };
      const devId = deviceIdOverride ?? selectedDeviceId ?? s.deviceId;
      if (devId) {
        videoConstraints.deviceId = { exact: devId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setPreviewStream(stream);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await waitForVideoReady(video);
      videoRef.current = video;
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const handleEnded = () => {
        streamRef.current = null;
        setPreviewStream(null);
        setIsPreviewing(false);
        setIsSharing(false);
      };
      stream.getVideoTracks()[0].addEventListener("ended", handleEnded);
      enumerateDevices();
      return stream;
    },
    [selectedDeviceId, enumerateDevices]
  );
  const startPreview = useCallback(async () => {
    await acquireStream();
    setIsPreviewing(true);
    setIsSharing(false);
  }, [acquireStream]);
  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPreviewStream(null);
    videoRef.current = null;
    setIsPreviewing(false);
    setIsSharing(false);
  }, []);
  const startSharing = useCallback(async () => {
    if (!streamRef.current) {
      await acquireStream();
    }
    setIsPreviewing(false);
    setIsSharing(true);
  }, [acquireStream]);
  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const s = settingsRef.current;
    if (!video || !canvas || !streamRef.current) {
      return Promise.resolve(null);
    }
    return captureFrameAsJpeg(video, canvas, s);
  }, []);
  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPreviewStream(null);
    videoRef.current = null;
    setIsPreviewing(false);
    setIsSharing(false);
  }, []);
  const selectDevice = useCallback(
    async (deviceId) => {
      setSelectedDeviceId(deviceId);
      if (streamRef.current) {
        const wasSharing = isSharing;
        try {
          await acquireStream(deviceId);
          if (wasSharing) {
            setIsPreviewing(false);
            setIsSharing(true);
          } else {
            setIsPreviewing(true);
            setIsSharing(false);
          }
        } catch {
          streamRef.current = null;
          setPreviewStream(null);
          setIsPreviewing(false);
          setIsSharing(false);
        }
      }
    },
    [isSharing, acquireStream]
  );
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return {
    isSharing,
    startSharing,
    takeScreenshot,
    stopSharing,
    // Camera-specific:
    devices,
    selectedDeviceId,
    selectDevice,
    // Preview:
    isPreviewing,
    previewStream,
    startPreview,
    stopPreview
  };
}
async function retry(fn, maxRetries, delays) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) throw err;
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, delays[i] ?? delays[delays.length - 1]));
    }
  }
  throw new Error("Unreachable");
}
function useUploader() {
  const { client, config } = useLookoutContext();
  const { maxRetries, retryDelays, maxPendingBuffer } = config.retry;
  const [uploads, setUploads] = useState({
    pending: 0,
    completed: 0,
    failed: 0
  });
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [lastScreenshotUrl, setLastScreenshotUrl] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [sessionConflict, setSessionConflict] = useState(false);
  const nextExpectedAtRef = useRef(null);
  const bufferRef = useRef([]);
  const processingRef = useRef(false);
  const resetConflict = useCallback(() => setSessionConflict(false), []);
  const processQueue = useCallback(async () => {
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
        config.callbacks.onUploadSuccess?.({
          screenshotId,
          trackedSeconds: result.trackedSeconds
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setLastError(msg);
        setUploads((s) => ({ ...s, failed: s.failed + 1 }));
        config.callbacks.onUploadFailure?.(err instanceof Error ? err : new Error(msg));
        if (err instanceof HttpError && err.status === 409) {
          setSessionConflict(true);
          const remaining = bufferRef.current.length;
          if (remaining > 0) {
            bufferRef.current.length = 0;
            setUploads((s) => ({ ...s, pending: 0, failed: s.failed + remaining }));
          }
          break;
        }
      }
    }
    processingRef.current = false;
  }, [client, maxRetries, retryDelays]);
  const enqueue = useCallback(
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
    lastError,
    sessionConflict,
    resetConflict
  };
}
function useSession() {
  const { client, config } = useLookoutContext();
  const pollIntervalMs = config.statusPollIntervalMs;
  const [state, setState] = useState({
    status: "loading",
    name: "",
    trackedSeconds: 0,
    screenshotCount: 0,
    startedAt: null,
    createdAt: null,
    totalActiveSeconds: 0,
    error: null
  });
  const pollRef = useRef(null);
  const loadSession = useCallback(async () => {
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
  const startPolling = useCallback(() => {
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
  const syncStatus = useCallback(async () => {
    try {
      const data = await client.getStatus();
      setState((s) => ({ ...s, status: data.status, trackedSeconds: data.trackedSeconds }));
    } catch {
    }
  }, [client]);
  const pause = useCallback(async () => {
    try {
      const data = await client.pause();
      setState((s) => ({
        ...s,
        status: data.status,
        totalActiveSeconds: data.totalActiveSeconds
      }));
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        console.warn("[session] pause returned 409, syncing status");
        await syncStatus();
      } else {
        throw e;
      }
    }
  }, [client, syncStatus]);
  const resume = useCallback(async () => {
    try {
      const data = await client.resume();
      setState((s) => ({ ...s, status: data.status }));
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        console.warn("[session] resume returned 409, syncing status");
        await syncStatus();
      } else {
        throw e;
      }
    }
  }, [client, syncStatus]);
  const stop = useCallback(async (name) => {
    if (name) {
      try {
        await client.rename(name);
      } catch (e) {
        console.warn("[session] rename failed (non-fatal):", e);
      }
    }
    let stopped = false;
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1e3, 2e3, 4e3];
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await client.stop();
        setState((s) => ({
          ...s,
          status: data.status,
          trackedSeconds: data.trackedSeconds,
          totalActiveSeconds: data.totalActiveSeconds
        }));
        stopped = true;
        break;
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) {
          console.warn("[session] stop returned 409, syncing status");
          const data = await client.getStatus();
          setState((s) => ({ ...s, status: data.status, trackedSeconds: data.trackedSeconds }));
          stopped = data.status === "stopped" || data.status === "compiling";
          break;
        }
        const isRetryable = e instanceof HttpError && e.status >= 500;
        if (isRetryable && attempt < MAX_RETRIES) {
          console.warn(`[session] stop failed (${e.status}), retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        throw e;
      }
    }
    if (stopped) {
      startPolling();
    }
  }, [client, startPolling]);
  const updateTrackedSeconds = useCallback((seconds) => {
    setState((s) => ({ ...s, trackedSeconds: seconds }));
  }, []);
  const setError = useCallback((error) => {
    setState((s) => ({ ...s, error, ...error ? { status: "error" } : {} }));
  }, []);
  useEffect(() => {
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
    syncStatus,
    updateTrackedSeconds,
    setError
  };
}
function useSessionTimer(serverTrackedSeconds, isActive) {
  const [displaySeconds, setDisplaySeconds] = useState(serverTrackedSeconds);
  const lastSyncRef = useRef(Date.now());
  const baseRef = useRef(serverTrackedSeconds);
  const DRIFT_CORRECTION_THRESHOLD = 180;
  useEffect(() => {
    const drift = baseRef.current - serverTrackedSeconds;
    let newBase;
    if (drift > DRIFT_CORRECTION_THRESHOLD) {
      newBase = serverTrackedSeconds;
    } else {
      newBase = Math.max(baseRef.current, serverTrackedSeconds);
    }
    if (newBase !== baseRef.current) {
      baseRef.current = newBase;
      setDisplaySeconds(newBase);
      lastSyncRef.current = Date.now();
    }
  }, [serverTrackedSeconds]);
  useEffect(() => {
    if (!isActive) return;
    lastSyncRef.current = Date.now();
    let raf;
    let lastRenderedSecond = -1;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - lastSyncRef.current) / 1e3);
      if (elapsed !== lastRenderedSecond) {
        lastRenderedSecond = elapsed;
        setDisplaySeconds(baseRef.current + elapsed);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      baseRef.current += Math.floor((Date.now() - lastSyncRef.current) / 1e3);
      lastSyncRef.current = Date.now();
    };
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

// src/hooks/useLookout.ts
function useLookout() {
  const { config, client } = useLookoutContext();
  const callbacksRef = useRef(config.callbacks);
  callbacksRef.current = config.callbacks;
  const captureMode = config.capture.mode;
  const session = useSession();
  const screenCapture = useScreenCapture();
  const cameraCapture = useCameraCapture();
  const capture = captureMode === "camera" ? cameraCapture : screenCapture;
  const uploader = useUploader();
  const intervalSeconds = Math.floor(config.capture.intervalMs / 1e3);
  const localEstimate = uploader.uploads.completed >= 2 ? (uploader.uploads.completed - 1) * intervalSeconds : 0;
  const bestTrackedSeconds = Math.max(
    session.trackedSeconds,
    uploader.trackedSeconds,
    localEstimate
  );
  const displaySeconds = useSessionTimer(
    bestTrackedSeconds,
    capture.isSharing && (session.status === "active" || session.status === "pending")
  );
  const intervalRef = useRef(null);
  const capturingRef = useRef(false);
  const prevStatusRef = useRef(session.status);
  const intentionalPauseRef = useRef(false);
  useEffect(() => {
    if (bestTrackedSeconds > session.trackedSeconds) {
      session.updateTrackedSeconds(bestTrackedSeconds);
    }
  }, [bestTrackedSeconds, session.trackedSeconds, session.updateTrackedSeconds]);
  useEffect(() => {
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
  const captureAndUploadRef = useRef(async () => {
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
  useEffect(() => {
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
  const wasSharingRef = useRef(capture.isSharing);
  useEffect(() => {
    const wasSharing = wasSharingRef.current;
    wasSharingRef.current = capture.isSharing;
    if (!wasSharing && capture.isSharing && session.status === "paused") {
      intentionalPauseRef.current = false;
      session.resume().then(() => {
        callbacksRef.current.onResume?.();
      }).catch(() => {
      });
    }
  }, [capture.isSharing, session.status, session.resume]);
  useEffect(() => {
    if (!capture.isSharing && session.status === "active") {
      if (capturingRef.current) {
        capturingRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        callbacksRef.current.onShareStop?.();
      }
      session.pause().catch(() => {
      });
    }
  }, [capture.isSharing, session.status, session.pause]);
  useEffect(() => {
    if (uploader.sessionConflict) {
      session.syncStatus().then(() => uploader.resetConflict());
    }
  }, [uploader.sessionConflict, session.syncStatus, uploader.resetConflict]);
  useEffect(() => {
    if (capture.isSharing && session.status === "paused" && !intentionalPauseRef.current) {
      session.resume().then(() => {
        callbacksRef.current.onResume?.();
      }).catch(() => {
      });
    }
  }, [capture.isSharing, session.status, session.resume]);
  useEffect(() => {
    if (config.autoStart && !capture.isSharing && (session.status === "pending" || session.status === "active")) {
      capture.startSharing().catch(() => {
      });
    }
  }, [config.autoStart, session.status, capture.isSharing, capture.startSharing]);
  const startSharing = useCallback(async () => {
    try {
      await capture.startSharing();
      callbacksRef.current.onShareStart?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      let message;
      const isCamera = captureMode === "camera";
      if (e.name === "NotAllowedError") {
        message = isCamera ? "Camera permission was denied. Please allow camera access and try again." : "Screen sharing permission was denied. Please try again and select a screen to share.";
      } else if (e.name === "AbortError") {
        message = isCamera ? "Camera access was cancelled." : "Screen sharing was cancelled.";
      } else {
        message = e.message || (isCamera ? "Failed to start camera." : "Failed to start screen sharing.");
      }
      callbacksRef.current.onError?.(new Error(message), "startSharing");
      session.setError(message);
    }
  }, [capture.startSharing, session, captureMode]);
  const stopSharing = useCallback(() => {
    capture.stopSharing();
    callbacksRef.current.onShareStop?.();
  }, [capture.stopSharing]);
  const pause = useCallback(async () => {
    intentionalPauseRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    capturingRef.current = false;
    await session.pause();
    callbacksRef.current.onPause?.({ totalActiveSeconds: session.totalActiveSeconds });
  }, [session.pause, session.totalActiveSeconds]);
  const resume = useCallback(async () => {
    intentionalPauseRef.current = false;
    await session.resume();
    callbacksRef.current.onResume?.();
  }, [session.resume]);
  const stop = useCallback(async (options) => {
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
  const [videoUrl, setVideoUrl] = useState(null);
  useEffect(() => {
    if (session.status !== "complete") return;
    let cancelled = false;
    client.getVideo().then((data) => {
      if (!cancelled) {
        setVideoUrl(data.videoUrl);
        callbacksRef.current.onComplete?.({ videoUrl: data.videoUrl });
      }
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, client]);
  const isRecording = capture.isSharing && (session.status === "active" || session.status === "pending");
  const state = {
    status: session.status,
    isSharing: capture.isSharing,
    isRecording,
    trackedSeconds: bestTrackedSeconds,
    displaySeconds,
    screenshotCount: Math.max(session.screenshotCount, uploader.uploads.completed),
    uploads: uploader.uploads,
    lastScreenshotUrl: uploader.lastScreenshotUrl,
    videoUrl,
    error: session.error,
    captureMode,
    availableCameras: cameraCapture.devices,
    selectedCameraId: cameraCapture.selectedDeviceId,
    isPreviewing: cameraCapture.isPreviewing,
    previewStream: cameraCapture.previewStream
  };
  const actions = {
    startSharing,
    stopSharing,
    pause,
    resume,
    stop,
    selectCamera: cameraCapture.selectDevice,
    startPreview: cameraCapture.startPreview,
    stopPreview: cameraCapture.stopPreview
  };
  return { state, actions };
}

// src/ui/theme.ts
if (typeof document !== "undefined" && !document.querySelector("style[data-lookout-theme]")) {
  const style = document.createElement("style");
  style.setAttribute("data-lookout-theme", "");
  style.textContent = `
    :root {
      /* Dark theme (default/fallback) */
      --color-bg-body: #000000;
      --color-bg-panel: #111111;
      --color-modal-backdrop: rgba(0, 0, 0, 0.8);
      --color-bg-surface: rgba(255, 255, 255, 0.05);
      --color-bg-sunken: rgba(255, 255, 255, 0.02);
      --color-text-primary: #ffffff;
      --color-text-inverse: #000000;
      --color-text-secondary: rgba(255, 255, 255, 0.6);
      --color-text-tertiary: rgba(255, 255, 255, 0.4);
      --color-text-quaternary: rgba(255, 255, 255, 0.2);
      --color-text-error: #fca5a5;
      --color-border-default: rgba(255, 255, 255, 0.1);
      --color-border-hover: rgba(255, 255, 255, 0.2);
      --color-bg-selected: rgba(255, 255, 255, 0.08);
      --color-border-selected: rgba(255, 255, 255, 0.3);
      --color-icon-selected: rgba(255, 255, 255, 0.8);
      --color-status-neutral: rgba(255, 255, 255, 0.2);
      --color-spinner-base: rgba(255, 255, 255, 0.1);
      --color-spinner-track: rgba(255, 255, 255, 0.8);
      --color-skeleton-bg: rgba(255, 255, 255, 0.03);
      --color-skeleton-shimmer: rgba(255, 255, 255, 0.08);
      --color-badge-primary-bg: #22c55e26;
      --color-badge-primary-text: #22c55e;
      --color-badge-overlay-bg: rgba(0, 0, 0, 0.7);
      --color-badge-overlay-text: #ffffff;
      --color-archive-bg: rgba(0, 0, 0, 0.6);
      --color-archive-icon: #ffffff;
      --color-archive-border: rgba(255, 255, 255, 0.1);
      --color-archive-hover-bg: rgba(255, 255, 255, 0.1);
      --color-archive-hover-border: rgba(255, 255, 255, 0.2);
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme="dark"]) {
        --color-bg-body: #ffffff;
        --color-bg-panel: #ffffff;
        --color-modal-backdrop: rgba(255, 255, 255, 0.8);
        --color-bg-surface: rgba(0, 0, 0, 0.05);
        --color-bg-sunken: rgba(0, 0, 0, 0.02);
        --color-text-primary: #000000;
        --color-text-inverse: #ffffff;
        --color-text-secondary: rgba(0, 0, 0, 0.6);
        --color-text-tertiary: rgba(0, 0, 0, 0.4);
        --color-text-quaternary: rgba(0, 0, 0, 0.2);
        --color-text-error: #ef4444;
        --color-border-default: rgba(0, 0, 0, 0.1);
        --color-border-hover: rgba(0, 0, 0, 0.2);
        --color-bg-selected: rgba(0, 0, 0, 0.08);
        --color-border-selected: rgba(0, 0, 0, 0.3);
        --color-icon-selected: rgba(0, 0, 0, 0.8);
        --color-status-neutral: #000000;
        --color-spinner-base: rgba(0, 0, 0, 0.1);
        --color-spinner-track: rgba(0, 0, 0, 0.8);
        --color-skeleton-bg: rgba(0, 0, 0, 0.05);
        --color-skeleton-shimmer: rgba(0, 0, 0, 0.08);
        --color-badge-primary-bg: #22c55e;
        --color-badge-primary-text: #ffffff;
        --color-badge-overlay-bg: #000000;
        --color-badge-overlay-text: #ffffff;
        --color-archive-bg: rgba(255, 255, 255, 0.9);
        --color-archive-icon: #000000;
        --color-archive-border: rgba(0, 0, 0, 0.1);
        --color-archive-hover-bg: rgba(255, 255, 255, 1);
        --color-archive-hover-border: rgba(0, 0, 0, 0.2);
      }
    }
    :root[data-theme="light"] {
      --color-bg-body: #ffffff;
      --color-bg-panel: #ffffff;
      --color-modal-backdrop: rgba(255, 255, 255, 0.8);
      --color-bg-surface: rgba(0, 0, 0, 0.05);
      --color-bg-sunken: rgba(0, 0, 0, 0.02);
      --color-text-primary: #000000;
      --color-text-inverse: #ffffff;
      --color-text-secondary: rgba(0, 0, 0, 0.6);
      --color-text-tertiary: rgba(0, 0, 0, 0.4);
      --color-text-quaternary: rgba(0, 0, 0, 0.2);
      --color-text-error: #ef4444;
      --color-border-default: rgba(0, 0, 0, 0.1);
      --color-border-hover: rgba(0, 0, 0, 0.2);
      --color-bg-selected: rgba(0, 0, 0, 0.08);
      --color-border-selected: rgba(0, 0, 0, 0.3);
      --color-icon-selected: rgba(0, 0, 0, 0.8);
      --color-status-neutral: #000000;
      --color-spinner-base: rgba(0, 0, 0, 0.1);
      --color-spinner-track: rgba(0, 0, 0, 0.8);
      --color-skeleton-bg: rgba(0, 0, 0, 0.05);
      --color-skeleton-shimmer: rgba(0, 0, 0, 0.08);
      --color-badge-primary-bg: #22c55e;
      --color-badge-primary-text: #ffffff;
      --color-badge-overlay-bg: #000000;
      --color-badge-overlay-text: #ffffff;
      --color-archive-bg: rgba(255, 255, 255, 0.9);
      --color-archive-icon: #000000;
      --color-archive-border: rgba(0, 0, 0, 0.1);
      --color-archive-hover-bg: rgba(255, 255, 255, 1);
      --color-archive-hover-border: rgba(0, 0, 0, 0.2);
    }`;
  document.head.appendChild(style);
}
var colors = {
  bg: { body: "var(--color-bg-body)", panel: "var(--color-bg-panel)", backdrop: "var(--color-modal-backdrop)", surface: "var(--color-bg-surface)", sunken: "var(--color-bg-sunken)", selected: "var(--color-bg-selected)" },
  text: { primary: "var(--color-text-primary)", inverse: "var(--color-text-inverse)", secondary: "var(--color-text-secondary)", tertiary: "var(--color-text-tertiary)", quaternary: "var(--color-text-quaternary)", error: "var(--color-text-error)" },
  border: { default: "var(--color-border-default)", hover: "var(--color-border-hover)", selected: "var(--color-border-selected)" },
  icon: { selected: "var(--color-icon-selected)" },
  spinner: { base: "var(--color-spinner-base)", track: "var(--color-spinner-track)" },
  skeleton: { bg: "var(--color-skeleton-bg)", shimmer: "var(--color-skeleton-shimmer)" },
  badge: {
    primaryBg: "var(--color-badge-primary-bg)",
    primaryText: "var(--color-badge-primary-text)",
    overlayBg: "var(--color-badge-overlay-bg)",
    overlayText: "var(--color-badge-overlay-text)"
  },
  status: {
    success: "#22c55e",
    info: "#3b82f6",
    warning: "#f59e0b",
    danger: "#ef4444",
    neutral: "var(--color-status-neutral)"
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
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.md}px ${spacing.xl}px`,
    background: colors.bg.surface,
    borderRadius: radii.md,
    marginBottom: spacing.lg
  }, children: [
    /* @__PURE__ */ jsx("div", { style: {
      fontSize: fontSize.timer,
      fontWeight: fontWeight.bold,
      fontVariantNumeric: "tabular-nums",
      color: colors.text.primary
    }, children: formatTime(displaySeconds) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: spacing.lg, fontSize: fontSize.lg, color: colors.text.secondary }, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        screenshotCount,
        " ",
        screenshotCount === 1 ? "screenshot" : "screenshots"
      ] }),
      uploads.pending > 0 && /* @__PURE__ */ jsxs("span", { style: { color: colors.status.warning }, children: [
        uploads.pending,
        " uploading..."
      ] }),
      uploads.failed > 0 && /* @__PURE__ */ jsxs("span", { style: { color: colors.status.danger }, children: [
        uploads.failed,
        " failed"
      ] })
    ] })
  ] });
}
function ScreenPreview({ imageUrl }) {
  if (!imageUrl) return null;
  return /* @__PURE__ */ jsxs("div", { style: styles.container, children: [
    /* @__PURE__ */ jsx("img", { src: imageUrl, alt: "Last captured screenshot", style: styles.image }),
    /* @__PURE__ */ jsx("span", { style: styles.label, children: "Latest screenshot" })
  ] });
}
var styles = {
  container: {
    position: "relative",
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    overflow: "hidden",
    background: colors.bg.sunken,
    border: `1px solid ${colors.border.default}`
  },
  image: { width: "100%", display: "block" },
  label: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    background: "rgba(0,0,0,0.5)",
    padding: "2px 8px",
    borderRadius: radii.sm
  }
};
function CameraPreview({ stream, fallbackImageUrl }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {
      });
    } else {
      video.srcObject = null;
    }
  }, [stream]);
  if (!stream && !fallbackImageUrl) return null;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: {
        position: "relative",
        marginBottom: spacing.md,
        borderRadius: radii.md,
        overflow: "hidden",
        background: colors.bg.sunken,
        border: `1px solid ${colors.border.default}`
      },
      children: [
        stream ? /* @__PURE__ */ jsx(
          "video",
          {
            ref: videoRef,
            muted: true,
            playsInline: true,
            autoPlay: true,
            style: { width: "100%", display: "block", transform: "scaleX(-1)" }
          }
        ) : fallbackImageUrl && /* @__PURE__ */ jsx(
          "img",
          {
            src: fallbackImageUrl,
            alt: "Last captured frame",
            style: { width: "100%", display: "block" }
          }
        ),
        /* @__PURE__ */ jsx(
          "span",
          {
            style: {
              position: "absolute",
              bottom: 8,
              right: 8,
              fontSize: fontSize.xs,
              color: colors.text.tertiary,
              background: "rgba(0,0,0,0.7)",
              padding: "2px 8px",
              borderRadius: radii.sm
            },
            children: stream ? "Live preview" : "Latest capture"
          }
        )
      ]
    }
  );
}
function CameraSelector({
  devices,
  selectedDeviceId,
  onSelect,
  disabled
}) {
  if (devices.length === 0) return null;
  return /* @__PURE__ */ jsxs("div", { style: { marginBottom: spacing.md }, children: [
    /* @__PURE__ */ jsx(
      "label",
      {
        style: {
          display: "block",
          fontSize: fontSize.sm,
          color: colors.text.secondary,
          marginBottom: spacing.xs
        },
        children: "Camera"
      }
    ),
    /* @__PURE__ */ jsx(
      "select",
      {
        value: selectedDeviceId ?? "",
        onChange: (e) => onSelect(e.target.value),
        disabled,
        style: {
          width: "100%",
          padding: `${spacing.sm}px ${spacing.md}px`,
          fontSize: fontSize.md,
          color: colors.text.primary,
          background: colors.bg.sunken,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radii.md,
          outline: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1
        },
        children: devices.map((device, i) => /* @__PURE__ */ jsx("option", { value: device.deviceId, children: device.label || `Camera ${i + 1}` }, device.deviceId))
      }
    )
  ] });
}
var sizes = { sm: 16, md: 24, lg: 40 };
function Spinner({ size = "md", color }) {
  const s = sizes[size];
  const baseColor = colors.spinner.base;
  const trackColor = color || colors.spinner.track;
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: s,
      height: s,
      viewBox: "0 0 24 24",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      style: {
        animation: "spin 1s linear infinite",
        flexShrink: 0
      },
      children: [
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "12",
            cy: "12",
            r: "10",
            stroke: baseColor,
            strokeWidth: "2"
          }
        ),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "12",
            cy: "12",
            r: "10",
            stroke: trackColor,
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeDasharray: "62.83",
            strokeDashoffset: "47.12"
          }
        )
      ]
    }
  );
}
var variantStyles = {
  primary: { background: colors.status.info, color: "#fff", border: "1px solid transparent" },
  success: { background: colors.status.success, color: "#fff", border: "1px solid transparent" },
  danger: { background: colors.status.danger, color: "#fff", border: "1px solid transparent" },
  warning: { background: colors.status.warning, color: "#000", border: "1px solid transparent" },
  secondary: { background: "transparent", color: colors.text.secondary, border: `1px solid ${colors.border.hover}` },
  ghost: { background: "transparent", color: colors.text.secondary, border: "1px solid transparent" }
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
  const { background, border, borderRadius, color, ...outerStyle } = style || {};
  const idleBackground = background ?? variantStyles[variant].background;
  const idleBorder = border ?? variantStyles[variant].border;
  const hoverBackground = background ?? (variant === "ghost" ? colors.bg.selected : variant === "secondary" ? colors.bg.surface : variantStyles[variant].background);
  const hoverBorder = border ?? (variant === "ghost" ? "1px solid transparent" : variantStyles[variant].border);
  return /* @__PURE__ */ jsxs(
    motion.button,
    {
      whileHover: isDisabled ? void 0 : "hover",
      whileTap: isDisabled ? void 0 : "active",
      initial: "idle",
      disabled: isDisabled,
      style: {
        position: "relative",
        fontWeight: fontWeight.semibold,
        borderRadius: borderRadius ?? radii.md,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: fullWidth ? "100%" : void 0,
        padding: 0,
        color: color ?? variantStyles[variant].color,
        background: "transparent",
        border: "1px solid transparent",
        ...outerStyle
      },
      ...rest,
      children: [
        /* @__PURE__ */ jsx(Squircle, { cornerRadius: borderRadius ?? radii.md, cornerSmoothing: 0.7, asChild: true, children: /* @__PURE__ */ jsx(
          motion.div,
          {
            variants: {
              idle: { scale: 1, background: idleBackground, border: idleBorder },
              hover: { scale: 1, background: hoverBackground, border: hoverBorder },
              active: { scale: 0.96, background: hoverBackground, border: hoverBorder }
            },
            transition: { type: "spring", stiffness: 1500, damping: 60 },
            style: {
              position: "absolute",
              inset: -1,
              background: idleBackground,
              border: idleBorder,
              transition: "opacity 0.15s, background 0.15s, border-color 0.15s"
            }
          }
        ) }),
        /* @__PURE__ */ jsxs(
          "span",
          {
            style: {
              position: "relative",
              zIndex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              ...sizeStyles[size]
            },
            children: [
              loading && /* @__PURE__ */ jsx(Spinner, { size: "sm", color: variant === "warning" ? "#000" : "#fff" }),
              children
            ]
          }
        )
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
  loading,
  captureMode = "screen"
}) {
  const isActive = status === "active" || status === "pending";
  const isPaused = status === "paused";
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    flexWrap: "wrap"
  }, children: [
    !isSharing && isActive && /* @__PURE__ */ jsx(Button, { variant: "success", size: "lg", onClick: onStartSharing, loading, children: captureMode === "camera" ? "Start Camera & Record" : "Share Screen & Start Recording" }),
    !isSharing && isPaused && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Button, { variant: "primary", size: "lg", onClick: onStartSharing, loading, children: captureMode === "camera" ? "Start Camera & Resume" : "Share Screen & Resume" }),
      /* @__PURE__ */ jsx(Button, { variant: "danger", size: "md", onClick: onStop, children: "Stop Session" })
    ] }),
    isSharing && isActive && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: {
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: colors.status.danger,
        animation: "pulse 1.5s ease-in-out infinite"
      } }),
      /* @__PURE__ */ jsx("span", { style: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        color: colors.status.danger,
        marginRight: spacing.sm
      }, children: "Recording" }),
      /* @__PURE__ */ jsx(Button, { variant: "warning", size: "md", onClick: onPause, children: "Pause" }),
      /* @__PURE__ */ jsx(Button, { variant: "danger", size: "md", onClick: onStop, children: "Stop" })
    ] })
  ] });
}

// #style-inject:#style-inject
function styleInject(css, { insertAt } = {}) {
  if (typeof document === "undefined") return;
  const head = document.head || document.getElementsByTagName("head")[0];
  const style = document.createElement("style");
  style.type = "text/css";
  if (insertAt === "top") {
    if (head.firstChild) {
      head.insertBefore(style, head.firstChild);
    } else {
      head.appendChild(style);
    }
  } else {
    head.appendChild(style);
  }
  if (style.styleSheet) {
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }
}

// src/components/VideoPlayer.css
styleInject(".lookout-video-player .media-button--mute,\n.lookout-video-player .media-slider--volume {\n  display: none !important;\n}\n.lookout-video-player.platform-windows .media-button--pip,\n.lookout-video-player.platform-mac .media-button--pip,\n.lookout-video-player.platform-linux .media-button--pip {\n  display: none !important;\n}\n.lookout-video-player.platform-linux .media-button--fullscreen {\n  display: none !important;\n}\n.lookout-video-player {\n  --media-border-radius: 8px;\n  --media-video-border-radius: 8px;\n}\n.lookout-video-player * {\n  --media-border-radius: 8px;\n}\n.lookout-video-player__error {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 24px;\n  text-align: center;\n  background: rgba(11, 13, 18, 0.92);\n  color: #f4f5f7;\n  border-radius: 8px;\n  z-index: 2;\n}\n.lookout-video-player__error h3 {\n  margin: 0;\n  font-size: 18px;\n  font-weight: 600;\n}\n.lookout-video-player__error p {\n  margin: 0;\n  max-width: 480px;\n  font-size: 14px;\n  line-height: 1.5;\n  color: #c8ccd4;\n}\n.lookout-video-player__error-note {\n  font-size: 13px;\n  color: #9aa0aa;\n}\n.lookout-video-player__error a {\n  color: #6ea8ff;\n  text-decoration: underline;\n}\n");
var Player = createPlayer({ features: videoFeatures });
function VideoPlayer({ src }) {
  const [platform, setPlatform] = useState("");
  const [error, setError] = useState(null);
  const wrapperRef = useRef(null);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("linux") && !ua.includes("android")) {
        setPlatform("linux");
      } else if (ua.includes("win")) {
        setPlatform("windows");
      } else if (ua.includes("mac")) {
        setPlatform("mac");
      }
    }
  }, []);
  useEffect(() => {
    setError(null);
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onVideoError = (event) => {
      const el = event.target;
      const code = el?.error?.code;
      if (code === 4 || code === 3) {
        setError({
          kind: "codec",
          detail: "Your system can't decode this video (H.264). On Linux, install gst-plugins-bad / OpenH264 to enable playback."
        });
      } else if (code === 2) {
        setError({
          kind: "network",
          detail: "Network error while loading the video. Check your connection and retry."
        });
      } else {
        setError({
          kind: "unknown",
          detail: el?.error?.message || "Playback failed for an unknown reason."
        });
      }
    };
    let videoEl = wrapper.querySelector("video");
    if (videoEl) videoEl.addEventListener("error", onVideoError, true);
    const observer = new MutationObserver(() => {
      const next = wrapper.querySelector("video");
      if (next && next !== videoEl) {
        if (videoEl) videoEl.removeEventListener("error", onVideoError, true);
        videoEl = next;
        videoEl.addEventListener("error", onVideoError, true);
      }
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (videoEl) videoEl.removeEventListener("error", onVideoError, true);
    };
  }, [src]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: wrapperRef,
      className: `lookout-video-player platform-${platform}`,
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        "--media-border-radius": "8px",
        "--media-video-border-radius": "8px"
      },
      children: [
        /* @__PURE__ */ jsx(Player.Provider, { children: /* @__PURE__ */ jsx(VideoSkin, { style: { width: "100%", height: "100%" }, children: /* @__PURE__ */ jsx(Video, { src, muted: true, playsInline: true, autoPlay: false }) }) }),
        error && /* @__PURE__ */ jsxs("div", { className: "lookout-video-player__error", role: "alert", children: [
          /* @__PURE__ */ jsx("h3", { children: "Can't play this timelapse" }),
          /* @__PURE__ */ jsx("p", { children: error.detail }),
          /* @__PURE__ */ jsxs("p", { className: "lookout-video-player__error-note", children: [
            "Your timelapse saved successfully. You can",
            " ",
            /* @__PURE__ */ jsx("a", { href: src, target: "_blank", rel: "noopener noreferrer", children: "download the file" }),
            " ",
            "and play it in another app."
          ] })
        ] })
      ]
    }
  );
}
function ProcessingState({ status, trackedSeconds, videoUrl, error, onVideoLoaded }) {
  const containerStyle = {
    width: "100%",
    borderRadius: 0,
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
    return /* @__PURE__ */ jsx("div", { style: { width: "100%", borderRadius: 0, overflow: "hidden", background: colors.bg.sunken, aspectRatio: "16/9" }, children: /* @__PURE__ */ jsx(VideoPlayer, { src: videoUrl }) });
  }
  if (status === "complete" && error) {
    return /* @__PURE__ */ jsx("div", { style: containerStyle, children: /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.lg, color: colors.text.secondary, textAlign: "center" }, children: "No video available" }) });
  }
  if (status === "failed") {
    return /* @__PURE__ */ jsxs("div", { style: containerStyle, children: [
      /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.status.danger }, children: "Compilation failed" }),
      /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.md, color: colors.text.secondary }, children: "It will be retried automatically." })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { style: containerStyle, children: [
    /* @__PURE__ */ jsx(Spinner, { size: "lg" }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text.primary }, children: status === "complete" ? "Loading video..." : "Compiling your timelapse..." }),
    /* @__PURE__ */ jsxs("p", { style: { fontSize: fontSize.md, color: colors.text.secondary }, children: [
      "Tracked time: ",
      formatTrackedTime(trackedSeconds)
    ] })
  ] });
}
function ErrorDisplay({ error, variant = "banner", title, onDismiss, onCopy, action }) {
  if (variant === "page") {
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing.xxl, textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.status.danger, marginBottom: spacing.sm }, children: title || "Error" }),
      /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: 400, maxHeight: 150, overflowY: "auto", color: colors.text.error, marginBottom: spacing.lg }, children: error }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: spacing.sm, justifyContent: "center" }, children: [
        action && /* @__PURE__ */ jsx(Button, { variant: "primary", size: "md", onClick: action.onClick, children: action.label }),
        onCopy && /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "md", onClick: onCopy, children: "Copy Error" })
      ] })
    ] });
  }
  if (variant === "inline") {
    return /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", color: colors.text.error, maxHeight: 150, overflowY: "auto" }, children: error });
  }
  return /* @__PURE__ */ jsxs("div", { style: { padding: `${spacing.md}px ${spacing.lg}px`, marginBottom: spacing.md, background: "rgba(239,68,68,0.15)", border: `1px solid ${colors.status.danger}`, borderRadius: radii.md, color: colors.text.error, fontSize: fontSize.md, display: "flex", alignItems: "flex-start", gap: spacing.sm }, children: [
    /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
      title && /* @__PURE__ */ jsx("strong", { style: { display: "block", marginBottom: spacing.xs }, children: title }),
      /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: fontSize.xs, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflowY: "auto" }, children: error })
    ] }),
    onCopy && /* @__PURE__ */ jsxs(
      motion.button,
      {
        onClick: onCopy,
        whileTap: "active",
        initial: "idle",
        style: { background: "transparent", border: "none", color: colors.text.error, cursor: "pointer", fontSize: fontSize.xs, lineHeight: 1, padding: "2px 8px", borderRadius: radii.sm, whiteSpace: "nowrap", position: "relative" },
        children: [
          /* @__PURE__ */ jsx(
            motion.div,
            {
              variants: { idle: { scale: 1 }, active: { scale: 0.96 } },
              transition: { type: "spring", stiffness: 1500, damping: 60 },
              style: { position: "absolute", inset: 0, borderRadius: radii.sm, border: "1px solid " + colors.text.error, zIndex: 0 }
            }
          ),
          /* @__PURE__ */ jsx("span", { style: { position: "relative", zIndex: 1, display: "inline-block" }, children: "Copy" })
        ]
      }
    ),
    onDismiss && /* @__PURE__ */ jsxs(
      motion.button,
      {
        onClick: onDismiss,
        whileTap: "active",
        initial: "idle",
        style: { background: "none", border: "none", color: colors.text.error, cursor: "pointer", fontSize: fontSize.xl, lineHeight: 1, padding: 0, position: "relative" },
        children: [
          /* @__PURE__ */ jsx(
            motion.div,
            {
              variants: { idle: { scale: 1 }, active: { scale: 0.96 } },
              transition: { type: "spring", stiffness: 1500, damping: 60 },
              style: { position: "absolute", inset: -2, borderRadius: "50%", background: "transparent", zIndex: 0 }
            }
          ),
          /* @__PURE__ */ jsx("span", { style: { position: "relative", zIndex: 1, display: "inline-block" }, children: "\xD7" })
        ]
      }
    )
  ] });
}
function PageContainer({ children, maxWidth = 640, centered = false, style }) {
  return /* @__PURE__ */ jsx("div", { style: {
    maxWidth,
    margin: "0 auto",
    padding: spacing.lg,
    ...centered ? {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100%",
      flex: 1
    } : {},
    ...style
  }, children });
}
function LookoutRecorder() {
  const { state, actions } = useLookout();
  if (state.status === "loading") {
    return /* @__PURE__ */ jsx(PageContainer, { centered: true, children: /* @__PURE__ */ jsx(Spinner, { size: "lg" }) });
  }
  if (state.status === "no-token") {
    return /* @__PURE__ */ jsxs(PageContainer, { centered: true, children: [
      /* @__PURE__ */ jsx("h2", { style: { fontSize: fontSize.display, fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: spacing.sm }, children: "No session token" }),
      /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.xl, color: colors.text.secondary, textAlign: "center", maxWidth: 400 }, children: "This page requires a session token. You should have been redirected here from another service." })
    ] });
  }
  if (state.status === "error") {
    return /* @__PURE__ */ jsx(PageContainer, { centered: true, children: /* @__PURE__ */ jsx(ErrorDisplay, { error: state.error ?? "Unknown error", variant: "page" }) });
  }
  if (state.status === "stopped" || state.status === "compiling" || state.status === "complete" || state.status === "failed") {
    return /* @__PURE__ */ jsx(PageContainer, { style: { padding: spacing.xxl }, children: /* @__PURE__ */ jsx(
      ProcessingState,
      {
        status: state.status,
        trackedSeconds: state.trackedSeconds
      }
    ) });
  }
  const isCamera = state.captureMode === "camera";
  if (isCamera) {
    return /* @__PURE__ */ jsxs(PageContainer, { maxWidth: 800, style: { padding: spacing.xxl }, children: [
      /* @__PURE__ */ jsx(
        StatusBar,
        {
          displaySeconds: state.displaySeconds,
          screenshotCount: state.screenshotCount,
          uploads: state.uploads
        }
      ),
      state.availableCameras.length > 1 && /* @__PURE__ */ jsx(
        CameraSelector,
        {
          devices: state.availableCameras,
          selectedDeviceId: state.selectedCameraId,
          onSelect: actions.selectCamera,
          disabled: state.isSharing
        }
      ),
      state.isPreviewing || state.previewStream ? /* @__PURE__ */ jsx(
        CameraPreview,
        {
          stream: state.previewStream,
          fallbackImageUrl: state.lastScreenshotUrl
        }
      ) : state.lastScreenshotUrl ? /* @__PURE__ */ jsx(ScreenPreview, { imageUrl: state.lastScreenshotUrl }) : null,
      !state.isPreviewing && !state.isSharing ? (
        /* Phase 1: No stream yet — prompt to start camera */
        /* @__PURE__ */ jsx(
          CameraIdleControls,
          {
            status: state.status,
            onStartPreview: actions.startPreview,
            onStartRecording: actions.startSharing,
            onStop: actions.stop
          }
        )
      ) : state.isPreviewing && !state.isSharing ? (
        /* Phase 2: Previewing — show "Start Recording" */
        /* @__PURE__ */ jsx(
          CameraPreviewControls,
          {
            onStartRecording: actions.startSharing,
            onStopPreview: actions.stopPreview
          }
        )
      ) : (
        /* Phase 3: Recording — standard recording controls */
        /* @__PURE__ */ jsx(
          RecordingControls,
          {
            status: state.status,
            isSharing: state.isSharing,
            onStartSharing: actions.startSharing,
            onPause: actions.pause,
            onResume: actions.resume,
            onStop: actions.stop,
            captureMode: "camera"
          }
        )
      )
    ] });
  }
  return /* @__PURE__ */ jsxs(PageContainer, { maxWidth: 800, style: { padding: spacing.xxl }, children: [
    /* @__PURE__ */ jsx(
      StatusBar,
      {
        displaySeconds: state.displaySeconds,
        screenshotCount: state.screenshotCount,
        uploads: state.uploads
      }
    ),
    /* @__PURE__ */ jsx(ScreenPreview, { imageUrl: state.lastScreenshotUrl }),
    /* @__PURE__ */ jsx(
      RecordingControls,
      {
        status: state.status,
        isSharing: state.isSharing,
        onStartSharing: actions.startSharing,
        onPause: actions.pause,
        onResume: actions.resume,
        onStop: actions.stop,
        captureMode: "screen"
      }
    )
  ] });
}
function CameraIdleControls({
  status,
  onStartPreview,
  onStartRecording,
  onStop
}) {
  const isPaused = status === "paused";
  return /* @__PURE__ */ jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    flexWrap: "wrap"
  }, children: isPaused ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Button, { variant: "primary", size: "lg", onClick: onStartRecording, children: "Start Camera & Resume" }),
    /* @__PURE__ */ jsx(Button, { variant: "danger", size: "md", onClick: onStop, children: "Stop Session" })
  ] }) : /* @__PURE__ */ jsx(Button, { variant: "success", size: "lg", onClick: onStartPreview, children: "Start Camera" }) });
}
function CameraPreviewControls({
  onStartRecording,
  onStopPreview
}) {
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
    flexWrap: "wrap"
  }, children: [
    /* @__PURE__ */ jsx(Button, { variant: "success", size: "lg", onClick: onStartRecording, children: "Start Recording" }),
    /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "md", onClick: onStopPreview, children: "Cancel" })
  ] });
}
function ResultView({ status, trackedSeconds }) {
  const { client, config } = useLookoutContext();
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
  return /* @__PURE__ */ jsx(
    ProcessingState,
    {
      status,
      trackedSeconds,
      videoUrl,
      error
    }
  );
}
function Badge({ status, variant = "overlay", size = "sm" }) {
  const config = statusConfig[status] ?? { label: status, color: "var(--color-status-neutral)" };
  const isOverlay = variant === "overlay";
  const sizeStyles2 = {
    sm: { fontSize: fontSize.xs - 1, padding: "2px 8px" },
    md: { fontSize: fontSize.sm, padding: "4px 12px" },
    lg: { fontSize: fontSize.md, padding: "6px 16px" }
  };
  return /* @__PURE__ */ jsx("span", { style: {
    ...sizeStyles2[size],
    fontWeight: fontWeight.semibold,
    color: "#fff",
    // Keeping text white since background is usually a colorful status pill or dark neutral pill
    borderRadius: 999,
    background: config.color,
    ...isOverlay ? { boxShadow: `0 0 0 1px rgba(0,0,0,0.1)` } : {}
  }, children: config.label });
}
function Card({ children, onClick, padding, style }) {
  const content = /* @__PURE__ */ jsx(
    "div",
    {
      style: {
        background: colors.bg.surface,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radii.lg,
        overflow: "hidden",
        padding,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...onClick ? {} : style
      },
      children
    }
  );
  if (!onClick) {
    return content;
  }
  return /* @__PURE__ */ jsx(
    motion.div,
    {
      onClick,
      role: "button",
      tabIndex: 0,
      whileTap: { scale: 0.99 },
      transition: { type: "spring", stiffness: 1500, damping: 60 },
      style: {
        cursor: "pointer",
        display: "block",
        height: "100%",
        ...style
      },
      children: content
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
  return /* @__PURE__ */ jsxs(Card, { onClick, style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { position: "relative", aspectRatio: "16/9", background: colors.bg.sunken, overflow: "hidden" }, children: [
      session.thumbnailUrl ? /* @__PURE__ */ jsx(
        "img",
        {
          src: session.thumbnailUrl,
          alt: "Timelapse thumbnail",
          style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
          loading: "lazy"
        }
      ) : /* @__PURE__ */ jsx("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg.sunken }, children: /* @__PURE__ */ jsxs("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: colors.text.quaternary, strokeWidth: "1.5", children: [
        /* @__PURE__ */ jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
        /* @__PURE__ */ jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
        /* @__PURE__ */ jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21" })
      ] }) }),
      /* @__PURE__ */ jsx("span", { style: { position: "absolute", top: spacing.sm, right: spacing.sm }, children: /* @__PURE__ */ jsx(Badge, { status: session.status, variant: "overlay" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: `${spacing.md}px ${spacing.md}px` }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        color: colors.text.primary,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginBottom: 2
      }, children: session.name }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: [
        formatTrackedTime(session.trackedSeconds),
        " \xB7 ",
        dateStr
      ] })
    ] }),
    onArchive && /* @__PURE__ */ jsxs(
      motion.button,
      {
        whileTap: "active",
        initial: "idle",
        style: {
          position: "absolute",
          top: spacing.sm,
          left: spacing.sm,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "transparent",
          color: "var(--color-archive-icon, #fff)",
          border: "none",
          cursor: "pointer",
          fontSize: fontSize.lg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          zIndex: 10
        },
        onClick: (e) => {
          e.stopPropagation();
          onArchive();
        },
        onPointerDown: (e) => e.stopPropagation(),
        title: "Archive",
        children: [
          /* @__PURE__ */ jsx(
            motion.div,
            {
              variants: { idle: { scale: 1 }, active: { scale: 0.99 } },
              transition: { type: "spring", stiffness: 1500, damping: 60 },
              style: {
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "var(--color-archive-bg, rgba(0,0,0,0.6))",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                border: `1px solid var(--color-archive-border, rgba(255,255,255,0.1))`,
                zIndex: 0,
                transition: "all 0.15s"
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.background = "var(--color-archive-hover-bg, rgba(255,255,255,0.1))";
                e.currentTarget.style.borderColor = "var(--color-archive-hover-border, rgba(255,255,255,0.2))";
                if (e.currentTarget.parentElement) {
                  e.currentTarget.parentElement.style.color = "var(--color-text-error, #ef4444)";
                }
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = "var(--color-archive-bg, rgba(0,0,0,0.6))";
                e.currentTarget.style.borderColor = "var(--color-archive-border, rgba(255,255,255,0.1))";
                if (e.currentTarget.parentElement) {
                  e.currentTarget.parentElement.style.color = "var(--color-archive-icon, #fff)";
                }
              }
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.15s" }, children: /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
            /* @__PURE__ */ jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
          ] }) })
        ]
      }
    )
  ] });
}
function Skeleton({ width, height, borderRadius = radii.md, aspectRatio, style }) {
  return /* @__PURE__ */ jsx("div", { style: {
    width: width ?? "100%",
    height: height ?? (aspectRatio ? void 0 : 20),
    aspectRatio,
    borderRadius,
    backgroundColor: colors.skeleton.bg,
    backgroundImage: `linear-gradient(90deg, transparent 0%, ${colors.skeleton.shimmer} 50%, transparent 100%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s ease-in-out infinite",
    ...style
  } });
}
function GallerySkeleton() {
  return /* @__PURE__ */ jsxs("div", { style: { padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsx(Skeleton, { width: 180, height: 24 }),
      /* @__PURE__ */ jsx(Skeleton, { width: 36, height: 36, borderRadius: radii.sm })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: spacing.md }, children: [1, 2, 3].map((i) => /* @__PURE__ */ jsxs("div", { style: { borderRadius: radii.lg, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsx(Skeleton, { aspectRatio: "16/9", borderRadius: 0 }),
      /* @__PURE__ */ jsxs("div", { style: { padding: `${spacing.md}px ${spacing.md}px`, background: colors.bg.surface }, children: [
        /* @__PURE__ */ jsx(Skeleton, { width: "60%", height: 16, style: { marginBottom: spacing.xs } }),
        /* @__PURE__ */ jsx(Skeleton, { width: "40%", height: 12 })
      ] })
    ] }, i)) })
  ] });
}
function SessionDetailSkeleton() {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(Skeleton, { aspectRatio: "16/9", borderRadius: radii.lg, style: { marginBottom: spacing.lg } }),
    /* @__PURE__ */ jsx(Skeleton, { width: "50%", height: 18, style: { marginBottom: spacing.xs } }),
    /* @__PURE__ */ jsx(Skeleton, { width: "30%", height: 12, style: { marginBottom: spacing.lg } }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: spacing.lg, justifyContent: "center" }, children: [
      /* @__PURE__ */ jsx(Skeleton, { height: 64, borderRadius: radii.md, style: { flex: 1 } }),
      /* @__PURE__ */ jsx(Skeleton, { height: 64, borderRadius: radii.md, style: { flex: 1 } })
    ] })
  ] });
}
function RecordPageSkeleton() {
  return /* @__PURE__ */ jsxs("div", { style: { maxWidth: 480, margin: "0 auto", padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: spacing.lg }, children: [
      /* @__PURE__ */ jsx(Skeleton, { width: 80, height: 32, borderRadius: radii.sm }),
      /* @__PURE__ */ jsx(Skeleton, { width: 100, height: 32, borderRadius: radii.sm })
    ] }),
    /* @__PURE__ */ jsx(Skeleton, { aspectRatio: "16/9", borderRadius: radii.lg, style: { marginBottom: spacing.lg } }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: spacing.sm }, children: [1, 2, 3].map((i) => /* @__PURE__ */ jsx(Skeleton, { height: 48, borderRadius: radii.md }, i)) }),
    /* @__PURE__ */ jsx(Skeleton, { height: 48, borderRadius: radii.lg, style: { marginTop: spacing.lg } })
  ] });
}
var addButtonStyle = {
  borderRadius: radii.md,
  fontSize: fontSize.xxl,
  width: 36,
  height: 36,
  padding: 0
};
function GalleryHeader({ onAdd, onSettings }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, paddingBottom: 0, flexShrink: 0 }, children: [
    /* @__PURE__ */ jsx("h2", { style: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0 }, children: "Your Timelapses" }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: spacing.xs }, children: [
      onSettings && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: onSettings, title: "Filter Apps", "aria-label": "Filter Apps", style: addButtonStyle, children: /* @__PURE__ */ jsx("svg", { width: "26", height: "26", viewBox: "0 0 32 32", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M1.64062 15.9375C1.64062 13.9271 2.00521 12.0573 2.73438 10.3281C3.46354 8.58854 4.47396 7.07292 5.76562 5.78125C7.06771 4.47917 8.58333 3.46354 10.3125 2.73438C12.0521 2.00521 13.9219 1.64062 15.9219 1.64062V30.2188C13.9219 30.2188 12.0521 29.8542 10.3125 29.125C8.58333 28.4062 7.06771 27.3958 5.76562 26.0938C4.47396 24.7917 3.46354 23.276 2.73438 21.5469C2.00521 19.8177 1.64062 17.9479 1.64062 15.9375ZM15.125 3.23438V1.1875H20.6875V3.23438H15.125ZM15.125 6.59375V4.85938H26.4375V6.59375H15.125ZM15.125 9.9375V8.20312H28.6719V9.9375H15.125ZM15.125 13.2969V11.5625H30.3438V13.2969H15.125ZM15.125 16.6406V14.9062H30.3438V16.6406H15.125ZM15.125 20V18.2656H30.3438V20H15.125ZM15.125 23.3594V21.625H28.6719V23.3594H15.125ZM15.125 27.0156V24.9688H26.4375V27.0156H15.125ZM15.125 30.6875V28.6406H20.6875V30.6875H15.125ZM15.9375 31.875C13.7396 31.875 11.6771 31.4583 9.75 30.625C7.82292 29.8021 6.13021 28.6615 4.67188 27.2031C3.21354 25.7448 2.06771 24.0521 1.23438 22.125C0.411458 20.1979 0 18.1354 0 15.9375C0 13.7396 0.411458 11.6771 1.23438 9.75C2.06771 7.82292 3.21354 6.13021 4.67188 4.67188C6.13021 3.20312 7.82292 2.05729 9.75 1.23438C11.6771 0.411458 13.7396 0 15.9375 0C18.1354 0 20.1979 0.411458 22.125 1.23438C24.0521 2.05729 25.7448 3.20312 27.2031 4.67188C28.6615 6.13021 29.8021 7.82292 30.625 9.75C31.4583 11.6771 31.875 13.7396 31.875 15.9375C31.875 18.1354 31.4583 20.1979 30.625 22.125C29.8021 24.0521 28.6615 25.7448 27.2031 27.2031C25.7448 28.6615 24.0521 29.8021 22.125 30.625C20.1979 31.4583 18.1354 31.875 15.9375 31.875ZM15.9375 29.2188C17.7708 29.2188 19.4896 28.875 21.0938 28.1875C22.6979 27.5 24.1094 26.5469 25.3281 25.3281C26.5469 24.1094 27.5 22.6979 28.1875 21.0938C28.875 19.4896 29.2188 17.7708 29.2188 15.9375C29.2188 14.1042 28.875 12.3854 28.1875 10.7812C27.5 9.16667 26.5469 7.75521 25.3281 6.54688C24.1094 5.32812 22.6979 4.375 21.0938 3.6875C19.4896 3 17.7708 2.65625 15.9375 2.65625C14.1042 2.65625 12.3854 3 10.7812 3.6875C9.17708 4.375 7.76562 5.32812 6.54688 6.54688C5.32812 7.75521 4.375 9.16667 3.6875 10.7812C3 12.3854 2.65625 14.1042 2.65625 15.9375C2.65625 17.7708 3 19.4896 3.6875 21.0938C4.375 22.6979 5.32812 24.1094 6.54688 25.3281C7.76562 26.5469 9.17708 27.5 10.7812 28.1875C12.3854 28.875 14.1042 29.2188 15.9375 29.2188Z" }) }) }),
      onAdd && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: onAdd, title: "Start", style: addButtonStyle, children: "+" })
    ] })
  ] });
}
var galleryScrollPosition = 0;
function Gallery({
  sessions,
  loading,
  error,
  onSessionClick,
  onArchive,
  onRefresh,
  onAdd,
  onSettings
}) {
  const scrollRef = useRef(null);
  const [showTopMask, setShowTopMask] = useState(false);
  const [showBottomMask, setShowBottomMask] = useState(false);
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    galleryScrollPosition = scrollTop;
    setShowTopMask(scrollTop > 0);
    setShowBottomMask(Math.ceil(scrollTop + clientHeight) < scrollHeight);
  }, []);
  useEffect(() => {
    if (scrollRef.current && sessions.length > 0 && !loading) {
      scrollRef.current.scrollTop = galleryScrollPosition;
      handleScroll();
    }
  }, [sessions.length, loading, handleScroll]);
  useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, [sessions, handleScroll]);
  if (loading && sessions.length === 0) {
    return /* @__PURE__ */ jsx(GallerySkeleton, {});
  }
  if (error && sessions.length === 0) {
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
      /* @__PURE__ */ jsx(GalleryHeader, { onAdd, onSettings }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing.xxl }, children: [
        /* @__PURE__ */ jsx(ErrorDisplay, { error, variant: "inline" }),
        onRefresh && /* @__PURE__ */ jsx(Button, { variant: "primary", size: "md", onClick: onRefresh, style: { marginTop: spacing.md }, children: "Retry" })
      ] })
    ] });
  }
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
      /* @__PURE__ */ jsx(GalleryHeader, { onAdd, onSettings }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing.xxl }, children: [
        /* @__PURE__ */ jsx("p", { style: { marginBottom: spacing.md }, children: /* @__PURE__ */ jsxs("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: colors.text.primary, strokeWidth: "1.5", style: { opacity: 0.2 }, children: [
          /* @__PURE__ */ jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
          /* @__PURE__ */ jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
          /* @__PURE__ */ jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21" })
        ] }) }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.lg, color: colors.text.primary, opacity: 0.5, textAlign: "center" }, children: "No timelapses yet" }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: fontSize.sm, color: colors.text.primary, opacity: 0.3, marginTop: spacing.xs, textAlign: "center" }, children: "Start a recording session to see it here." })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsx(GalleryHeader, { onAdd, onSettings }),
    /* @__PURE__ */ jsx(
      "div",
      {
        ref: scrollRef,
        onScroll: handleScroll,
        style: {
          flex: 1,
          overflowY: "auto",
          padding: spacing.lg,
          maskImage: `linear-gradient(to bottom, ${showTopMask ? "transparent 0%, black 20px" : "black 0%, black 20px"}, ${showBottomMask ? "black calc(100% - 20px), transparent 100%" : "black calc(100% - 20px), black 100%"})`,
          WebkitMaskImage: `linear-gradient(to bottom, ${showTopMask ? "transparent 0%, black 20px" : "black 0%, black 20px"}, ${showBottomMask ? "black calc(100% - 20px), transparent 100%" : "black calc(100% - 20px), black 100%"})`
        },
        children: /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: spacing.md }, children: sessions.map((s) => /* @__PURE__ */ jsx(
          SessionCard,
          {
            session: s,
            onClick: () => onSessionClick?.(s.token),
            onArchive: onArchive ? () => onArchive(s.token) : void 0
          },
          s.token
        )) })
      }
    )
  ] });
}
function SessionDetail({
  token,
  apiBaseUrl,
  onBack,
  onArchive
}) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isRenamingAnim, setIsRenamingAnim] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (isRenaming) {
      setIsRenamingAnim(true);
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    } else {
      const t = setTimeout(() => setIsRenamingAnim(false), 600);
      return () => clearTimeout(t);
    }
  }, [isRenaming]);
  const [status, setStatus] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
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
  const fetchStatus = useCallback(async () => {
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
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);
  useEffect(() => {
    if (!status || !["stopped", "compiling"].includes(status.status)) return;
    const interval = setInterval(fetchStatus, 3e3);
    return () => clearInterval(interval);
  }, [status?.status, fetchStatus]);
  const cardButtonStyle = {
    background: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.lg
  };
  return /* @__PURE__ */ jsxs("div", { style: { padding: spacing.lg }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, children: [
      onBack && /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "sm", onClick: onBack, style: cardButtonStyle, children: "\u2190 Back" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: spacing.sm }, children: onArchive && /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "sm", onClick: onArchive, style: cardButtonStyle, children: "Archive" }) })
    ] }),
    error && /* @__PURE__ */ jsx(ErrorDisplay, { error, variant: "banner", title: "Error" }),
    !status && !error && /* @__PURE__ */ jsx(SessionDetailSkeleton, {}),
    status && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { marginBottom: spacing.lg, borderRadius: radii.lg, overflow: "hidden" }, children: /* @__PURE__ */ jsx(
        ProcessingState,
        {
          status: status.status,
          trackedSeconds: status.trackedSeconds,
          videoUrl
        }
      ) }),
      sessionInfo && /* @__PURE__ */ jsxs("div", { style: { marginBottom: spacing.lg }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: spacing.xs, height: 32 }, children: [
          /* @__PURE__ */ jsxs(
            "form",
            {
              onSubmit: async (e) => {
                e.preventDefault();
                const newName = editName.trim();
                if (newName && newName !== sessionInfo.name) {
                  try {
                    const res = await fetch(`${apiBaseUrl}/api/sessions/${token}/name`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newName })
                    });
                    if (res.ok) {
                      setSessionInfo((prev) => prev ? { ...prev, name: newName } : prev);
                    } else {
                      alert("Failed to rename session.");
                    }
                  } catch (err) {
                    alert("Error renaming session.");
                  }
                }
                setIsRenaming(false);
                if (inputRef.current) inputRef.current.blur();
              },
              style: {
                display: "grid",
                alignItems: "center",
                margin: 0
              },
              children: [
                /* @__PURE__ */ jsx(
                  motion.span,
                  {
                    animate: {
                      padding: isRenaming ? "0 16px" : "0 8px 0 0"
                    },
                    transition: { type: "spring", stiffness: 500, damping: 30 },
                    style: {
                      gridArea: "1 / 1",
                      visibility: "hidden",
                      whiteSpace: "pre",
                      fontFamily: "inherit",
                      fontSize: fontSize.xl,
                      fontWeight: fontWeight.bold,
                      pointerEvents: "none"
                    },
                    children: isRenaming ? editName || " " : sessionInfo.name
                  }
                ),
                /* @__PURE__ */ jsx(
                  motion.input,
                  {
                    ref: inputRef,
                    readOnly: !isRenaming,
                    value: isRenaming ? editName : sessionInfo.name,
                    onChange: (e) => setEditName(e.target.value),
                    onBlur: () => setIsRenaming(false),
                    onDoubleClick: () => {
                      if (!isRenaming) {
                        setEditName(sessionInfo.name);
                        setIsRenaming(true);
                      }
                    },
                    onKeyDown: (e) => {
                      if (e.key === "Escape") {
                        setIsRenaming(false);
                        e.currentTarget.blur();
                      }
                    },
                    size: 1,
                    animate: {
                      padding: isRenaming ? "0 8px" : "0",
                      width: isRenaming ? "max(100%, 300px)" : "100%",
                      backgroundColor: isRenaming ? colors.bg.surface : "transparent",
                      borderColor: isRenaming ? colors.border.selected : "transparent"
                    },
                    transition: {
                      padding: { type: "spring", stiffness: 500, damping: 30 },
                      width: { type: "spring", stiffness: 500, damping: 30 },
                      backgroundColor: { duration: 0.15 },
                      borderColor: { duration: 0.15 }
                    },
                    style: {
                      gridArea: "1 / 1",
                      minWidth: 0,
                      height: 32,
                      fontFamily: "inherit",
                      fontSize: fontSize.xl,
                      fontWeight: fontWeight.bold,
                      color: colors.text.primary,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderRadius: radii.md,
                      boxSizing: "border-box",
                      outline: "none",
                      cursor: isRenaming ? "text" : "default",
                      transformOrigin: "left center"
                    }
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "center", width: 24, height: 24 }, children: /* @__PURE__ */ jsx(AnimatePresence, { children: !isRenamingAnim && /* @__PURE__ */ jsx(
            motion.button,
            {
              initial: { opacity: 0, scale: 0.8 },
              animate: { opacity: 1, scale: 1 },
              exit: { opacity: 0, scale: 0.8 },
              transition: { duration: 0.15 },
              title: "Rename session",
              onClick: () => {
                setEditName(sessionInfo.name);
                setIsRenaming(true);
              },
              onMouseDown: (e) => e.currentTarget.style.transform = "scale(0.9)",
              onMouseUp: (e) => e.currentTarget.style.transform = "none",
              onMouseLeave: (e) => e.currentTarget.style.transform = "none",
              style: {
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                margin: -5,
                color: colors.text.tertiary,
                display: "flex",
                alignItems: "center",
                transition: "transform 0.1s ease-in-out"
              },
              children: /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ jsx("path", { d: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" }) })
            }
          ) }) })
        ] }),
        /* @__PURE__ */ jsx(
          motion.div,
          {
            animate: {
              y: isRenaming == false ? -4 : 0
            },
            transition: { type: "spring", stiffness: 500, damping: 30 },
            style: { fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2, y: -4 },
            children: new Date(sessionInfo.createdAt).toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: spacing.lg, justifyContent: "center" }, children: [
        /* @__PURE__ */ jsxs(Card, { padding: `${spacing.md}px ${spacing.xxl}px`, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: spacing.xs }, children: [
          /* @__PURE__ */ jsx("span", { style: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text.primary, height: 32, display: "flex", alignItems: "center" }, children: formatTrackedTime(status.trackedSeconds) }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: "Tracked time" })
        ] }),
        /* @__PURE__ */ jsxs(Card, { padding: `${spacing.md}px ${spacing.xxl}px`, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: spacing.xs }, children: [
          /* @__PURE__ */ jsx("div", { style: { height: 32, display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx(Badge, { status: status.status, variant: "inline", size: "lg" }) }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: fontSize.xs, color: colors.text.tertiary }, children: "Status" })
        ] })
      ] })
    ] })
  ] });
}
var STORAGE_KEY = "lookout-tokens";
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
  const [entries, setEntries] = useState(readStore);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) {
        setEntries(readStore());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const persist = useCallback((next) => {
    setEntries(next);
    writeStore(next);
  }, []);
  const addToken = useCallback(
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
  const archiveToken = useCallback(
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
  const unarchiveToken = useCallback(
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
  const removeToken = useCallback(
    (token) => {
      const current = readStore();
      persist(current.filter((e) => e.token !== token));
    },
    [persist]
  );
  const tokens = entries.filter((e) => !e.archived);
  const archivedTokens = entries.filter((e) => e.archived);
  const getAllTokenValues = useCallback(
    () => tokens.map((e) => e.token),
    [tokens]
  );
  const hasToken = useCallback(
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
var globalSessionsCache = {};
function useGallery({ apiBaseUrl, tokens }) {
  const validTokens = tokens.filter((t) => /^[a-f0-9]{64}$/i.test(t));
  const initialSessions = validTokens.map((t) => globalSessionsCache[t]?.summary).filter((s) => s !== void 0);
  const hasAllInCache = validTokens.length > 0 && initialSessions.length === validTokens.length;
  const [sessions, setSessions] = useState(initialSessions);
  const [loading, setLoading] = useState(!hasAllInCache && validTokens.length > 0);
  const [error, setError] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const tokensKey = tokens.join(",");
  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), []);
  useEffect(() => {
    if (tokens.length === 0) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (validTokens.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!hasAllInCache) {
      setLoading(true);
    }
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
        const now = Date.now();
        const THUMBNAIL_EXPIRY = 45 * 60 * 1e3;
        const mergedSessions = (data.sessions ?? []).map((newSession) => {
          const cached = globalSessionsCache[newSession.token];
          let thumbnailUrl = newSession.thumbnailUrl;
          let fetchedAt = now;
          if (cached && cached.summary.thumbnailUrl) {
            const isImageSame = newSession.screenshotCount === cached.summary.screenshotCount;
            const isFresh = now - cached.thumbnailUrlFetchedAt < THUMBNAIL_EXPIRY;
            if (isImageSame && isFresh) {
              thumbnailUrl = cached.summary.thumbnailUrl;
              fetchedAt = cached.thumbnailUrlFetchedAt;
            }
          }
          const resultSession = { ...newSession, thumbnailUrl };
          globalSessionsCache[newSession.token] = {
            summary: resultSession,
            thumbnailUrlFetchedAt: fetchedAt
          };
          return resultSession;
        });
        setSessions(mergedSessions);
        setError(null);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn("Gallery fetch error:", err instanceof Error ? err.message : err);
        setError(err.message);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, tokensKey, refreshCounter, hasAllInCache]);
  useEffect(() => {
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
  if (path === "add") return { page: "add" };
  if (path === "settings") return { page: "settings" };
  if (path === "tray") return { page: "tray" };
  if (path === "record" && token) return { page: "record", token };
  if (path === "session" && token) return { page: "session", token };
  return { page: "gallery" };
}
function routeToHash(route) {
  switch (route.page) {
    case "gallery":
      return "#/";
    case "add":
      return "#/add";
    case "settings":
      return "#/settings";
    case "tray":
      return "#/tray";
    case "record":
      return `#/record?token=${route.token}`;
    case "session":
      return `#/session?token=${route.token}`;
  }
}
function useHashRouter() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const keyHandler = (e) => {
      const target = e.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.key === "Escape" || e.key === "Backspace") {
        const currentRoute = parseHash(window.location.hash);
        if (currentRoute.page !== "gallery") {
          e.preventDefault();
          window.history.back();
          setTimeout(() => {
            if (parseHash(window.location.hash).page !== "gallery") {
              window.location.hash = "#/";
            }
          }, 50);
        }
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);
  const navigate = useCallback((r) => {
    window.location.hash = routeToHash(r);
  }, []);
  return { route, navigate };
}

export { Badge, Button, CameraPreview, CameraSelector, Card, ErrorDisplay, Gallery, GallerySkeleton, LookoutProvider, LookoutRecorder, PageContainer, ProcessingState, RecordPageSkeleton, RecordingControls, ResultView, ScreenPreview, SessionCard, SessionDetail, SessionDetailSkeleton, Skeleton, Spinner, StatusBar, VideoPlayer, colors, createLookoutClient, fontSize, fontWeight, formatTime, formatTrackedTime, radii, spacing, statusConfig, useCameraCapture, useGallery, useHashRouter, useLookout, useScreenCapture, useSession, useSessionTimer, useTokenStore, useUploader };
