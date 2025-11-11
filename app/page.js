"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function HomePage() {
  const [file, setFile] = useState(null);
  const [objectUrl, setObjectUrl] = useState("");
  const [speed, setSpeed] = useState(0.5); // 0.1x - 1.0x
  const [recording, setRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [status, setStatus] = useState("");

  const videoRef = useRef(null);
  const progressRef = useRef(0);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [objectUrl, downloadUrl]);

  useEffect(() => {
    if (videoRef.current) {
      // Update playback rate in real-time for preview
      videoRef.current.playbackRate = Math.max(0.1, Math.min(1, Number(speed)));
    }
  }, [speed]);

  const onSelectFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const url = URL.createObjectURL(f);
    setFile(f);
    setObjectUrl(url);
    setDownloadUrl("");
  };

  const pickBestMimeType = () => {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "video/webm";
  };

  const recordSlowMotion = async () => {
    if (!videoRef.current || !objectUrl || recording) return;

    setStatus("Preparing...");
    setRecording(true);
    setDownloadUrl("");
    progressRef.current = 0;

    const video = videoRef.current;

    // Ensure we start from the beginning
    try {
      video.pause();
      video.currentTime = 0;
      await new Promise((res) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          res();
        };
        video.addEventListener("seeked", onSeeked);
      });
    } catch {}

    // Prepare AudioContext if audio included
    let audioCtx = null;
    let audioDest = null;
    try {
      if (includeAudio) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        const source = audioCtx.createMediaElementSource(video);
        audioDest = audioCtx.createMediaStreamDestination();
        source.connect(audioDest);
        // Optional: also route to speakers during export
        source.connect(audioCtx.destination);
      }
    } catch (e) {
      console.warn("Audio context init failed", e);
    }

    // Build combined stream
    const vStream = video.captureStream?.() || video.mozCaptureStream?.();
    if (!vStream) {
      setRecording(false);
      setStatus("CaptureStream not supported in this browser.");
      return;
    }

    const combinedTracks = [
      ...vStream.getVideoTracks(),
      ...(includeAudio && audioDest ? audioDest.stream.getAudioTracks() : []),
    ];
    const combined = new MediaStream(combinedTracks);

    const mimeType = pickBestMimeType();
    let chunks = [];
    let recorder;

    try {
      recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 5_000_000 });
    } catch (e) {
      try {
        recorder = new MediaRecorder(combined);
      } catch (err) {
        setRecording(false);
        setStatus("MediaRecorder not supported.");
        return;
      }
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setRecording(false);
      setStatus("Export complete.");
      // Cleanup
      combined.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close();
    };

    // Progress loop
    const duration = video.duration || 0;
    const updateProgress = () => {
      const t = video.currentTime || 0;
      const pct = duration > 0 ? Math.min(100, Math.round((t / duration) * 100)) : 0;
      progressRef.current = pct;
      setStatus(`Exporting... ${pct}%`);
      if (!video.paused && !video.ended && recording) requestAnimationFrame(updateProgress);
    };

    // Start recording then play
    recorder.start(250);

    // Set playback rate to desired slow speed and play
    const rate = Math.max(0.1, Math.min(1, Number(speed)));
    video.playbackRate = rate;

    try {
      await video.play();
    } catch (e) {
      // Some browsers require user interaction; if play fails, stop gracefully
      recorder.stop();
      setRecording(false);
      setStatus("Playback failed to start. Click video to allow audio.");
      if (audioCtx) audioCtx.close();
      return;
    }

    requestAnimationFrame(updateProgress);

    // When playback ends at slow rate, stop recorder
    const onEnded = () => {
      video.removeEventListener("ended", onEnded);
      try { recorder.stop(); } catch {}
    };
    video.addEventListener("ended", onEnded);
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Slow Motion</h1>
        <p>Upload a video, preview in slow motion, and export a slowed WebM.</p>
      </header>

      <section className="panel">
        <label className="file-label">
          <input
            type="file"
            accept="video/*"
            onChange={onSelectFile}
          />
          <span>Choose video</span>
        </label>

        <div className="control-row">
          <label htmlFor="speed">Speed: {speed.toFixed(2)}x</label>
          <input
            id="speed"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>

        <div className="control-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
            />
            Include audio in export
          </label>
        </div>

        <div className="buttons">
          <button
            className="primary"
            disabled={!objectUrl || recording}
            onClick={recordSlowMotion}
          >
            {recording ? "Exporting..." : "Export slowed video"}
          </button>
          {downloadUrl && (
            <a className="secondary" href={downloadUrl} download="slow-motion.webm">Download</a>
          )}
        </div>

        {status && <div className="status">{status}</div>}
      </section>

      <section className="video-panel">
        {objectUrl ? (
          <video
            ref={videoRef}
            src={objectUrl}
            controls
            playsInline
            controlsList="nodownload noplaybackrate"
            className="player"
          />
        ) : (
          <div className="placeholder">Select a video to begin</div>
        )}
      </section>

      <footer className="footer">
        <small>
          Export uses in-browser recording for compatibility. For best results, keep this tab active during export.
        </small>
      </footer>
    </main>
  );
}
