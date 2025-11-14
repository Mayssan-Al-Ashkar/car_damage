import { useEffect, useRef, useState } from 'react';

type Props = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setError('Camera access denied or unavailable.');
      }
    }
    init();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  function takePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.92);
  }

  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <h3>Camera</h3>
      {error && <p style={{ color: 'salmon' }}>{error}</p>}
      <video ref={videoRef} style={{ width: '100%', borderRadius: 8 }} playsInline muted />
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="primary" onClick={takePhoto}>Capture</button>
        <button style={{ marginLeft: 8 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}


