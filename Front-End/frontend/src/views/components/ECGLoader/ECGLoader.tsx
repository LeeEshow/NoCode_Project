import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ECGLoader.css';

function buildStockPath(n: number): { line: string; area: string } {
  let seed = 0x9E3779B9;
  const rng = () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  const yStart = 48;
  const yEnd   = 12;
  let y = yStart;
  let v = 0;
  const pts: string[] = [];

  for (let i = 0; i < n; i++) {
    const t  = i / (n - 1);                        // 0 → 1
    const x  = t * 1000;
    const cy = Math.max(13, Math.min(52, y));
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${cy.toFixed(1)}`);

    // 均值回歸：持續把 y 拉向理想趨勢線，防止後段變平
    const target    = yStart + (yEnd - yStart) * t;
    const reversion = (target - y) * 0.07;

    const noise = (rng() - 0.5) * 4;
    const spike = rng() < 0.04 ? (rng() - 0.45) * 10 : 0;
    v = v * 0.4 + (noise + spike + reversion) * 0.6;
    y += v;
  }

  const line = pts.join(' ');
  return { line, area: `${line} L 1000 60 L 0 60 Z` };
}

const { line: STOCK_LINE, area: STOCK_AREA } = buildStockPath(300);

/* 底部刻度點：每 40 SVG 單位一個，共 26 個 */
const TICK_PATH = Array.from({ length: 80 }, (_, i) => `M ${(i * 1000 / 79).toFixed(1)} 56.5 L ${(i * 1000 / 79).toFixed(1)} 56.5`).join(' ');

export default function ECGLoader() {
  const location = useLocation();
  const [animKey, setAnimKey] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }

    if (timerRef.current) clearTimeout(timerRef.current);
    setAnimKey(k => k + 1);
    setVisible(true);

    timerRef.current = setTimeout(() => setVisible(false), 700);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="ecg-loader" key={animKey} aria-hidden="true">
      <svg
        className="ecg-loader__line"
        viewBox="0 0 1000 60"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="stock-glow" x="-5%" y="-80%" width="110%" height="260%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="stock-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#B87A7A" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#B87A7A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={STOCK_AREA} fill="url(#stock-area-grad)" />
        <path
          d={STOCK_LINE}
          fill="none"
          stroke="#B87A7A"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#stock-glow)"
        />
        {/* 底部刻度點 */}
        <path
          d={TICK_PATH}
          stroke="#333"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {/* 發光圓點：跟隨折線趨勢從左下移至右上 */}
      <div className="ecg-loader__dot" />
    </div>
  );
}
