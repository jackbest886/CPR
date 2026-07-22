import { Box, Paper, Skeleton } from '@mui/material';

/** 骨架占位块：淡灰呼吸。 */
const skeletonFillSx = { bgcolor: 'rgba(31,41,55,0.07)' };

/**
 * 时间线加载骨架：6 张卡片占位（与 RegCard 同栅格、同内边距），
 * 淡灰呼吸替代转圈，避免布局跳动。
 */
export default function TimelineSkeleton() {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Paper
          key={i}
          elevation={0}
          sx={{
            p: '20px 22px',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 12,
          }}
        >
          {/* 元信息行：两个 pill 占位 */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <Skeleton variant="rounded" width={62} height={22} sx={{ borderRadius: '7px', ...skeletonFillSx }} />
            <Skeleton variant="rounded" width={78} height={22} sx={{ borderRadius: '7px', ...skeletonFillSx }} />
          </Box>
          {/* 标题两行 */}
          <Skeleton variant="text" width="92%" height={22} sx={skeletonFillSx} />
          <Skeleton variant="text" width="68%" height={22} sx={skeletonFillSx} />
          {/* 摘要两行 */}
          <Skeleton variant="text" width="96%" height={16} sx={{ mt: 1, ...skeletonFillSx }} />
          <Skeleton variant="text" width="58%" height={16} sx={skeletonFillSx} />
          {/* 底部行：日期 + 标签 */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Skeleton variant="text" width={82} height={16} sx={skeletonFillSx} />
            <Skeleton variant="rounded" width={46} height={22} sx={{ borderRadius: '6px', ...skeletonFillSx }} />
            <Skeleton variant="rounded" width={46} height={22} sx={{ borderRadius: '6px', ...skeletonFillSx }} />
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
