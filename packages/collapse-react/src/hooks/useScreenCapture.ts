import { useRef, useState, useCallback } from "react";
import {
  CANVAS_TO_BLOB_TIMEOUT_MS,
  VIDEO_READY_TIMEOUT_MS,
} from "@collapse/shared";
import type { CaptureResult, CaptureSettings } from "../types.js";
import { useCollapseContext } from "../CollapseProvider.js";

/** Wait for the video element to have decoded dimensions after play(). */
function waitForVideoReady(
  video: HTMLVideoElement,
  timeoutMs: number,
): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    (function check() {
      if (video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      if (Date.now() > deadline)
        return reject(new Error("Video not ready — no frames received"));
      requestAnimationFrame(check);
    })();
  });
}

/**
 * Handles getDisplayMedia, canvas snapshots, and stream lifecycle.
 *
 * Reads capture settings from CollapseProvider context. Pass explicit
 * settings to override or use standalone (without provider).
 */
export function useScreenCapture(overrides?: CaptureSettings) {
  let settings: Required<Omit<CaptureSettings, "displayMediaConstraints">> & {
    displayMediaConstraints?: DisplayMediaStreamOptions;
  };

  try {
    const { config } = useCollapseContext();
    settings = {
      ...config.capture,
      ...overrides,
    };
  } catch {
    // Standalone mode — no provider, require explicit settings
    settings = {
      intervalMs: overrides?.intervalMs ?? 60_000,
      jpegQuality: overrides?.jpegQuality ?? 0.85,
      maxWidth: overrides?.maxWidth ?? 1920,
      maxHeight: overrides?.maxHeight ?? 1080,
      displayMediaConstraints: overrides?.displayMediaConstraints,
    };
  }

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  // Store settings in a ref so takeScreenshot always uses latest
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const startSharing = useCallback(async () => {
    const s = settingsRef.current;
    const constraints: DisplayMediaStreamOptions = {
      video: {
        width: { ideal: s.maxWidth, max: s.maxWidth },
        height: { ideal: s.maxHeight, max: s.maxHeight },
        frameRate: { ideal: 1, max: 5 },
      },
      audio: false,
      ...s.displayMediaConstraints,
    };

    // Try full constraints first; Safari <16 throws TypeError on frameRate/nested constraints
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      if (err instanceof TypeError) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
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

    // Wait for first frame to be decoded before allowing captures
    await waitForVideoReady(video, VIDEO_READY_TIMEOUT_MS);

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

  const takeScreenshot = useCallback((): Promise<CaptureResult | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const s = settingsRef.current;
    if (!video || !canvas || !streamRef.current) {
      return Promise.resolve(null);
    }

    // Guard against zero-dimension video (race condition / not ready)
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return Promise.resolve(null);
    }

    const scale = Math.min(
      s.maxWidth / video.videoWidth,
      s.maxHeight / video.videoHeight,
      1,
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Promise.resolve(null);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const toBlobPromise = new Promise<CaptureResult | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(
            blob
              ? { blob, width: canvas.width, height: canvas.height }
              : null,
          );
        },
        "image/jpeg",
        s.jpegQuality,
      );
    });

    // Timeout prevents the pipeline from stalling if toBlob hangs
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), CANVAS_TO_BLOB_TIMEOUT_MS),
    );

    return Promise.race([toBlobPromise, timeoutPromise]);
  }, []);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsSharing(false);
  }, []);

  return { isSharing, startSharing, takeScreenshot, stopSharing };
}
