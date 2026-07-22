import { createTheme } from '@mui/material/styles';

/**
 * 品牌色板（克制版，对标 Stripe / Linear / Vercel）：
 * 墨黑主色 + 冷调近白画布 + 发丝边框 + 四级文字。
 * 来源信号色（NMPA/FDA/EMA）只用于 3–4px 色脊线 / 小圆点，禁止大面积上色。
 */
export const BRAND = {
  ink: '#1f2937',
  canvas: '#f7f8fa',
  surface: '#ffffff',
  hover: '#fafbfc',
  hairline: '#e6e8ec',
  hairlineStrong: '#d6d9de',
  textPrimary: '#1f2937',
  textSecondary: '#5b6573',
  textTertiary: '#8a8f98',
  textHelper: '#9aa0a6',
};

/** 数据字体：IBM Plex Mono（等宽数字）。 */
export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** 监管来源信号色。仅用于左脊线 / 小圆点。 */
export const SOURCE_COLOR: Record<string, string> = {
  NMPA: '#A32D2D',
  FDA: '#185FA5',
  EMA: '#3B6D11',
};

/** 法规类型色。 */
export const TYPE_COLOR: Record<string, string> = {
  指南: '#185FA5',
  法规: '#6B3FA0',
  征求意见: '#BA7517',
  批准: '#2E7D32',
  其他: '#6B7280',
};

/** 法规状态色。 */
export const STATUS_COLOR: Record<string, string> = {
  征求意见中: '#BA7517',
  已生效: '#2E7D32',
  已更新: '#6B3FA0',
  已废止: '#8A8F98',
};

/**
 * 将 hex 主色按透明度转为 rgba，用于 pill/badge 的 tint 底色（10% 级，克制）。
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 极软投影：仅用于卡片 hover，克制不花哨。 */
export const SHADOW = {
  cardHover: '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)',
  focusRing: '0 0 0 3px rgba(31,41,55,0.06)',
};

/** 统一动效曲线与时长（150–250ms）。 */
export const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const DURATION = { fast: 150, base: 180, slow: 250 };

/** eyebrow 小标签：uppercase + 加宽字距 + 三级灰，用于分组 / 统计标签。 */
export const EYEBROW = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: BRAND.textTertiary,
} as const;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: BRAND.ink },
    text: { primary: BRAND.textPrimary, secondary: BRAND.textSecondary },
    background: { default: BRAND.canvas, paper: BRAND.surface },
    divider: BRAND.hairline,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    // 唯一一处 600：页面主标题（如顶栏产品字样）。
    h6: { fontSize: 22, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: BRAND.textPrimary },
    // 卡片标题 15/500
    subtitle1: { fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: BRAND.textPrimary },
    subtitle2: { fontSize: 13, fontWeight: 500, color: BRAND.textSecondary },
    // 正文 14/400 · 13/400
    body1: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
    body2: { fontSize: 13, fontWeight: 400, lineHeight: 1.6 },
    // 元信息 12/400（配合 tabular-nums）
    caption: { fontSize: 12, fontWeight: 400, color: BRAND.textTertiary },
    button: { textTransform: 'none', fontWeight: 500, fontSize: 13 },
    overline: { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.textTertiary },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          '&:focusVisible': { boxShadow: 'none' },
        },
        // 扁平墨色主按钮：无阴影，hover 仅轻微变深。
        containedPrimary: {
          backgroundColor: BRAND.ink,
          color: '#ffffff',
          '&:hover': { backgroundColor: '#111827' },
        },
        // 克制描边按钮：发丝边框 + 次级文字，hover 仅淡底。
        outlinedPrimary: {
          borderColor: BRAND.hairline,
          color: BRAND.textSecondary,
          '&:hover': { borderColor: BRAND.hairlineStrong, backgroundColor: BRAND.hover },
        },
      },
    },
    MuiChip: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiToggleButtonGroup: {
      styleOverrides: {
        grouped: { margin: 0, border: 0, '&:not(:first-of-type)': { borderRadius: 8 } },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: 13,
          borderRadius: 8,
          border: 'none',
          px: 1.5,
          color: BRAND.textSecondary,
          '&:hover': { backgroundColor: 'rgba(31,41,55,0.04)' },
          '&.Mui-selected': {
            color: BRAND.ink,
            backgroundColor: '#eef0f2',
            '&:hover': { backgroundColor: '#e7e9ec' },
          },
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: BRAND.canvas, color: BRAND.textPrimary },
        '*': { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        // 卡片入场：fade-in + 轻微上移（配合 animationDelay 交错使用）
        '@keyframes regFadeUp': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        // 尊重系统减弱动效偏好
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },
  },
});
