import { useCallback, useEffect, useRef, useState } from "react";

export function useVisionCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [source, setSource] = useState<"camera" | "screen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSource(null);
    setPending(false);
  }, []);

  const start = useCallback(async (next: "camera" | "screen") => {
    stop();
    const version = generation.current;
    setPending(true);
    setError(null);
    try {
      if (!navigator.mediaDevices) throw new Error("Open Orin in its own secure tab to share video.");
      const stream = next === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      if (version !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", stop, { once: true });
      setSource(next);
    } catch (err) {
      if (version !== generation.current) return;
      setError(err instanceof Error && err.name === "NotAllowedError"
        ? "Sharing was not allowed. You can try again when ready."
        : err instanceof Error ? err.message : "Video sharing could not start.");
    } finally {
      if (version === generation.current) setPending(false);
    }
  }, [stop]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && source && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => setError("Video playback could not start."));
    }
  }, [source]);

  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      generation.current++;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stop]);

  const snapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.65);
  }, []);

  return { videoRef, source, error, pending, start, stop, snapshot };
}