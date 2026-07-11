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
  dim:         '#627282',
  label:       '#708292',

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
  '2xs':  11,
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

/** 暗礦 6 色板 — ECharts series color palette / 進度條循環色（深色主題，S:25-87 / L:25-40） */
export const chartColors = [
  '#2d5578', // 青金石 Lapis        — H:208° S:45 L:32
  '#216226', // 碧玉   Nephrite     — H:125° S:50 L:26
  '#4c4c7e', // 紫晶   Amethyst     — H:240° S:25 L:40
  '#ac770c', // 虎眼   Tiger Eye    — H:40°  S:87 L:36
  '#702837', // 玫瑰石英 Rose Quartz  — H:348° S:47 L:30
  '#6b3714', // 煙晶   Smoky Quartz  — H:24°  S:68 L:25
] as const;

const theme = { colors, fonts, fontSizes, radii, nav, topbarH, chartColors, chartUiColors };
// chartColors 色相分佈：24°(煙晶) / 40°(虎眼) / 125°(碧玉) / 208°(青金石) / 240°(紫晶) / 348°(玫瑰石英)
export default theme;
