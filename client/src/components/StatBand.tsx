import { Box, Paper, Skeleton } from '@mui/material';
import type { StatsResponse } from '../../../shared/types';
import {
  BRAND,
  DURATION,
  EASE,
  EYEBROW,
  MONO,
  SHADOW,
  SOURCE_COLOR,
} from '../theme';

interface Props {
  /** 统计数据；null 表示未就绪，渲染同尺寸骨架屏 */
  stats: StatsResponse | null;
}

interface StatItem {
  key: string;
  label: string;
  value: number;
  helper: string;
  /** 来源卡片的主色小圆点 */
  dotColor?: string;
}

/** 栅格：移动端 2 列 → 平板 3 列 → 桌面 5 列一行排开；卡片间距 16px。 */
const gridSx = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: {
    xs: 'repeat(2, minmax(0, 1fr))',
    sm: 'repeat(3, minmax(0, 1fr))',
    lg: 'repeat(5, minmax(0, 1fr))',
  },
  mb: 3,
};

/** 卡片：白底 + 发丝边框 + 圆角 12；hover 极软投影 + 边框略深 + 轻抬起。 */
const cardSx = {
  p: '18px 20px',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 12,
  transition: `border-color ${DURATION.base}ms ${EASE}, box-shadow ${DURATION.base}ms ${EASE}, transform ${DURATION.base}ms ${EASE}`,
  '&:hover': {
    borderColor: BRAND.hairlineStrong,
    boxShadow: SHADOW.cardHover,
    transform: 'translateY(-1px)',
  },
};

/** 骨架占位块：淡灰呼吸。 */
const skeletonFillSx = { bgcolor: 'rgba(31,41,55,0.07)' };

/**
 * 顶部统计概览条：法规总数 / FDA / EMA / NMPA / 近30天新增。
 * 大号等宽数字 + uppercase eyebrow 标签，与 RegCard 同一套 hover 语言。
 */
export default function StatBand({ stats }: Props) {
  // 数据未就绪：骨架屏（与卡片同尺寸，避免布局跳动）
  if (stats == null) {
    return (
      <Box sx={gridSx}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Paper
            key={i}
            elevation={0}
            sx={{
              p: '18px 20px',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 12,
            }}
          >
            <Skeleton variant="text" width={52} height={14} sx={{ mb: 1.25, ...skeletonFillSx }} />
            <Skeleton variant="text" width={64} height={36} sx={skeletonFillSx} />
            <Skeleton variant="text" width={72} height={14} sx={{ mt: 1, ...skeletonFillSx }} />
          </Paper>
        ))}
      </Box>
    );
  }

  const total = Object.values(stats.bySource).reduce((a, b) => a + b, 0);
  const items: StatItem[] = [
    { key: 'total', label: '法规总数', value: total, helper: '三来源合计' },
    { key: 'fda', label: 'FDA', value: stats.bySource.FDA ?? 0, helper: '美国', dotColor: SOURCE_COLOR.FDA },
    { key: 'ema', label: 'EMA', value: stats.bySource.EMA ?? 0, helper: '欧盟', dotColor: SOURCE_COLOR.EMA },
    { key: 'nmpa', label: 'NMPA', value: stats.bySource.NMPA ?? 0, helper: '中国', dotColor: SOURCE_COLOR.NMPA },
    { key: 'recent', label: '近30天新增', value: stats.recent, helper: '新增入库' },
  ];

  return (
    <Box sx={gridSx}>
      {items.map((it, i) => (
        <Paper
          key={it.key}
          elevation={0}
          sx={{
            ...cardSx,
            animation: `regFadeUp ${DURATION.slow}ms ${EASE} both`,
            animationDelay: `${i * 40}ms`,
          }}
        >
          {/* eyebrow：uppercase + 加宽字距；来源卡片带主色小圆点 */}
          <Box
            sx={{
              ...EYEBROW,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mb: 1,
              lineHeight: 1.4,
            }}
          >
            {it.dotColor && (
              <Box
                component="span"
                aria-hidden
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: it.dotColor,
                  flexShrink: 0,
                }}
              />
            )}
            {it.label}
          </Box>

          {/* 大号等宽数字 */}
          <Box
            sx={{
              fontFamily: MONO,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: BRAND.textPrimary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {it.value}
          </Box>

          {/* 小字说明 */}
          <Box sx={{ fontSize: 12, color: BRAND.textTertiary, mt: 0.75, lineHeight: 1.4 }}>
            {it.helper}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
