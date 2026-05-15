/**
 * Design Tokens — TypeScript 版
 * 用於 Recharts / lightweight-charts / 內聯樣式等無法直接讀取 CSS 變數的場景
 * 所有值與 tokens.css 保持一致，異動時兩邊同步更新
 */

export const colors = {
  /* 背景層 */
  bg:          '#111111',
  surface:     '#080808',
  panel:       '#1d1d1d',

  /* 邊框 */
  border:      '#2c2c2c',
  borderHi:    '#383838',

  /* 文字 */
  text:        '#cdd6e0',
  textValue:   '#c8d2de',
  muted:       '#7a8390',
  dim:         '#4e5e6e',
  label:       '#5e6c7a',

  /* 漲跌 */
  up:          '#B87A7A',
  upBg:        'rgba(184,122,122,0.10)',
  upBd:        'rgba(184,122,122,0.22)',
  down:        '#7CA88D',
  downBg:      'rgba(124,168,141,0.10)',
  downBd:      'rgba(124,168,141,0.22)',
  flat:        '#636b74',

  /* Accent */
  accent:      '#6A8FB5',
  accentBg:    'rgba(106,143,181,0.10)',
  accentBd:    'rgba(106,143,181,0.26)',

  /* Table 表頭 */
  theadText:   '#808a94',
  theadBg:     'rgba(180,185,190,0.06)',
  theadBd:     'rgba(180,185,190,0.12)',
} as const;

export const fonts = {
  sans: "'Open Sans', sans-serif",
  mono: "'Open Sans', sans-serif",
} as const;

export const fontSizes = {
  '2xs':  10,
  xs:     11,
  sm:     12,
  md:     13,
  base:   14,
  lg:     15,
  xl:     16,
  '2xl':  18,
} as const;

export const radii = {
  xs: 3,
  sm: 4,
  md: 6,
  lg: 10,
} as const;

export const nav = {
  collapsedW: 52,
  expandedW:  192,
} as const;

export const topbarH = 52;

/** SparkLine / KLineChart 漲跌用色快捷包 */
export const chartUiColors = {
  up:   colors.up,
  down: colors.down,
  flat: colors.flat,
  grid: colors.border,
  axis: colors.dim,
  tooltip: {
    bg:     colors.surface,
    border: colors.borderHi,
    text:   colors.text,
  },
} as const;

/** 莫蘭迪 6 色板 — ECharts series color palette / 進度條循環色 */
export const chartColors = [
  '#C8ACA4', // 煙粉 Smoky Rose
  '#A8B4A6', // 苔灰 Moss Grey
  '#A0ACBA', // 霧藍 Fog Blue
  '#C4B8A8', // 燕麥 Oatmeal
  '#B4AEBC', // 薰紫灰 Lavender Smoke
  '#96A8B4', // 鴿藍 Pigeon Blue
] as const;

const theme = { colors, fonts, fontSizes, radii, nav, topbarH, chartColors, chartUiColors };
export default theme;
