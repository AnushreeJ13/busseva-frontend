import React, { useEffect, useMemo, useRef, useState } from 'react';

// Big bus intro + reliable audio on tap + lighter palette + clean animation
const BusSevaBigBusIntro = ({
  onDone = () => {},
  holdMs = 1400, // keep overlay briefly after audio start
  welcomeSrc = '/audio/busseva-welcome.mp3' // "BusSeva me aapka swagat hai!"
}) => {
  const [done, setDone] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const rawBufRef = useRef(null); // ArrayBuffer preloaded early

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  // Preload audio bytes early to avoid long async chain inside the gesture
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(welcomeSrc, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) throw new Error(`Audio preload failed: ${res.status}`);
        const arr = await res.arrayBuffer();
        if (!cancelled) rawBufRef.current = arr;
      } catch (e) {
        // Non-fatal: will fallback to fetch during tap or to HTMLAudio
        console.warn('Audio preload error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [welcomeSrc]);

  // End after brief hold once audio is started
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setDone(true);
      onDone();
    }, holdMs);
    return () => clearTimeout(t);
  }, [playing, holdMs, onDone]);

  const styles = useMemo(() => ({
    wrap: {
      position: 'fixed',
      inset: 0,
      display: done ? 'none' : 'grid',
      placeItems: 'center',
      zIndex: 9999,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #ecfdf5 100%)'
    },
    center: {
      textAlign: 'center',
      color: '#0f172a',
      padding: 16,
      width: 'min(680px, 94vw)'
    },
    busWrap: {
      position: 'relative',
      display: 'inline-block',
      background: 'white',
      borderRadius: 20,
      padding: 20,
      boxShadow: '0 20px 60px rgba(2,6,23,0.15)',
      border: '1px solid rgba(2,6,23,0.06)',
      animation: reduced ? 'none' : 'busEnter 700ms cubic-bezier(.2,.7,.2,1)'
    },
    title: {
      marginTop: 14,
      fontSize: 28,
      fontWeight: 900,
      letterSpacing: 0.4,
      background: 'linear-gradient(90deg,#0ea5e9,#10b981)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textShadow: '0 8px 24px rgba(2,6,23,0.1)'
    },
    sub: { marginTop: 6, fontSize: 16, fontWeight: 700, color: '#334155' },
    btnRow: { display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 },
    btn: {
      background: '#0ea5e9',
      color: 'white',
      border: 'none',
      borderRadius: 9999,
      padding: '12px 18px',
      fontWeight: 900,
      cursor: 'pointer',
      boxShadow: '0 14px 32px rgba(14,165,233,0.35)'
    },
    btnGhost: {
      background: 'white',
      color: '#0f172a',
      border: '1px solid rgba(2,6,23,0.1)',
      borderRadius: 9999,
      padding: '12px 16px',
      fontWeight: 800,
      cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(2,6,23,0.08)'
    },
    sweep: {
      position: 'absolute',
      inset: 0,
      borderRadius: 18,
      pointerEvents: 'none',
      background:
        'linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 10%, rgba(255,255,255,0) 20%)',
      transform: 'translateX(-120%)',
      animation: reduced ? 'none' : 'sweep 1600ms ease-out 250ms both'
    },
    road: {
      marginTop: 12,
      height: 6,
      background: 'repeating-linear-gradient(90deg, rgba(2,6,23,0.08) 0 40px, rgba(2,6,23,0.02) 40px 80px)',
      borderRadius: 999
    },
    error: { marginTop: 10, color: '#b91c1c', fontWeight: 700, fontSize: 13 }
  }), [done, reduced]);

  // Start: resume/create AudioContext, decode preloaded bytes, play buffer; fallback to <audio>
  const handleStart = async () => {
    setErrorMsg('');
    try {
      const ACtx = window.AudioContext || window.webkitAudioContext;
      if (ACtx) {
        if (!ctxRef.current) ctxRef.current = new ACtx();
        await ctxRef.current.resume(); // unlock on gesture
        let audioBuf;
        if (rawBufRef.current) {
          // Clone the ArrayBuffer before decode on Safari
          audioBuf = await ctxRef.current.decodeAudioData(rawBufRef.current.slice(0));
        } else {
          const res = await fetch(welcomeSrc, { mode: 'cors' });
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          const arr = await res.arrayBuffer();
          audioBuf = await ctxRef.current.decodeAudioData(arr);
        }
        const src = ctxRef.current.createBufferSource();
        src.buffer = audioBuf;
        src.connect(ctxRef.current.destination);
        src.start(0);
        setPlaying(true);
        src.onended = () => {};
        return;
      }
    } catch (e) {
      console.warn('WebAudio path failed', e);
      setErrorMsg('Audio blocked or failed, trying fallback…');
    }
    try {
      if (audioRef.current) {
        audioRef.current.crossOrigin = 'anonymous';
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        setPlaying(true);
        return;
      }
    } catch (e) {
      console.warn('HTMLAudio path failed', e);
      setErrorMsg('Audio could not start; check device volume and silent mode.');
      setPlaying(false);
    }
  };

  const handleSkip = () => {
    setDone(true);
    onDone();
  };

  return (
    <div style={styles.wrap} role="dialog" aria-label="BusSeva welcome">
      <style>{`
        @keyframes busEnter {
          0% { transform: translateY(18px) scale(0.97); opacity: 0; }
          60% { transform: translateY(-2px) scale(1.01); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(140%); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={styles.center}>
        <div style={styles.busWrap}>
          {/* Headlight sweep */}
          <div style={styles.sweep} />

          {/* Big friendly bus */}
          <svg width="420" height="200" viewBox="0 0 420 200" fill="none" aria-hidden="true">
            {/* body */}
            <rect x="36" y="60" width="340" height="86" rx="16" fill="#0ea5e9" />
            <rect x="36" y="60" width="340" height="46" rx="16" fill="#38bdf8" opacity="0.4" />
            {/* windows */}
            {[0,1,2,3,4,5].map(i => (
              <rect key={i} x={56 + i*48} y="74" width="38" height="26" rx="6" fill="#f1f5f9" />
            ))}
            {/* door */}
            <rect x="300" y="70" width="14" height="56" rx="4" fill="#e2f0fb" />
            {/* bumper */}
            <rect x="360" y="112" width="12" height="10" rx="2" fill="#bae6fd" />
            {/* wheels */}
            <g transform="translate(120,148)">
              <circle r="16" fill="#0f172a" />
              <circle r="6" fill="#94a3b8" />
              <g style={{ transformOrigin: 'center', animation: reduced ? 'none' : 'spin 1.2s linear 2' }}>
                <rect x="-1" y="-16" width="2" height="32" fill="#1e293b" />
              </g>
            </g>
            <g transform="translate(300,148)">
              <circle r="16" fill="#0f172a" />
              <circle r="6" fill="#94a3b8" />
              <g style={{ transformOrigin: 'center', animation: reduced ? 'none' : 'spin 1.2s linear 2' }}>
                <rect x="-1" y="-16" width="2" height="32" fill="#1e293b" />
              </g>
            </g>
            {/* headlight glow */}
            <circle cx="370" cy="116" r="6" fill="#fde68a" />
            <ellipse cx="390" cy="116" rx="22" ry="8" fill="url(#glow)" opacity="0.55" />
            <defs>
              <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
                gradientTransform="translate(390 116) rotate(0) scale(22 8)">
                <stop offset="0" stopColor="#fff7cc" />
                <stop offset="1" stopColor="#fff7cc" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        <div style={styles.title}>BusSeva</div>
        <div style={styles.sub}>BusSeva me aapka swagat hai!</div>

        <div style={styles.btnRow}>
          <button style={styles.btn} onClick={handleStart}>
            {playing ? 'Entering…' : 'Tap to start'}
          </button>
          
        </div>

        {errorMsg && <div style={styles.error}>{errorMsg}</div>}

        {/* HTMLAudio fallback (hidden) */}
        <audio ref={audioRef} src={welcomeSrc} preload="auto" crossOrigin="anonymous" />
        {/* Decorative road */}
        <div style={styles.road} />
      </div>
    </div>
  );
};

export default BusSevaBigBusIntro;
