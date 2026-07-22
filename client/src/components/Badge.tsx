import { Box } from '@mui/material';
import { BRAND, withAlpha } from '../theme';

interface BadgeProps {
  /** 主色：同时决定圆点、文字与 10% tint 底色 */
  color: string;
  label: string;
}

/**
 * 精致 pill 标识：实心小圆点（6px）+ 主色 10% tint 底 + 主色 500 字。
 * 柔和矩形（圆角 7px，非圆头椭圆），用于来源 / 状态标识。
 */
export default function Badge({ color, label }: BadgeProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 22,
        px: 1,
        borderRadius: '7px',
        bgcolor: withAlpha(color, 0.1),
        color,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: color,
          flexShrink: 0,
        }}
      />
      {label}
    </Box>
  );
}

/**
 * 淡灰 tint 标签：墨色字 + 中性灰底，用于类型 / 标签等中性元信息。
 */
export function Tag({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        px: 1,
        borderRadius: '6px',
        bgcolor: 'rgba(31,41,55,0.05)',
        color: BRAND.textSecondary,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {label}
    </Box>
  );
}
