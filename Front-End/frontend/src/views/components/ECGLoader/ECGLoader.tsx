import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ECGLoader.css';

/* PQRST waveform: viewBox 0 0 1000 28, baseline y=14
   spike 在約 55~62% 處，視覺上在掃過中段出現 */
const ECG_PATH =
  'M 0 14 L 500 14 Q 535 9 550 14 L 565 14 L 572 17 L 588 2 L 604 24 L 622 14 Q 652 6 680 14 L 1000 14';

export default function ECGLoader() {
  const location = useLocation();
  const [animKey, setAnimKey]   = useState(0);
  const [visible, setVisible]   = useState(false);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    /* 首次 mount 不觸發，只有切換路由時才播放 */
    if (isFirstRender.current) { isFirstRender.current = false; return; }

    if (timerRef.current) clearTimeout(timerRef.current);
    setAnimKey(k => k + 1);
    setVisible(true);

    /* 動畫總時長：掃描 500ms + 淡出 200ms */
    timerRef.current = setTimeout(() => setVisible(false), 700);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="ecg-loader" key={animKey} aria-hidden="true">
      <svg
        className="ecg-loader__line"
        viewBox="0 0 1000 28"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="ecg-glow" x="-5%" y="-80%" width="110%" height="260%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={ECG_PATH}
          fill="none"
          stroke="#8C7215"
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#ecg-glow)"
        />
      </svg>

      {/* 掃描頭：垂直發光線，與 SVG 同步向右移動 */}
      <div className="ecg-loader__scanner" />
    </div>
  );
}
