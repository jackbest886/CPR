import { Box, Button, Divider, Paper, Stack, Typography } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { BRAND, DURATION, EASE, MONO } from '../theme';
import type { Regulation, RegStatus, SortMode } from '../../../shared/types';
import RegCard from './RegCard';
import { Tag } from './Badge';

interface Props {
  items: Regulation[];
  sort: SortMode;
  onPatch: (
    id: string,
    patch: { watch?: boolean; status?: RegStatus; by?: string },
  ) => void;
  /** 空态「清除筛选」回调；不传则不显示按钮 */
  onReset?: () => void;
}

/**
 * 入场动效：fade-in + 轻微上移，按序号交错 40ms。
 * 封顶 9 档，避免长列表尾部延迟过久；仅首屏可见部分参与动画。
 */
const enterSx = (index: number) => ({
  animation: `regFadeUp ${DURATION.slow}ms ${EASE} both`,
  animationDelay: `${Math.min(index, 9) * 40}ms`,
});

export default function TimelineView({ items, sort, onPatch, onReset }: Props) {
  if (items.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ px: 4, py: 8, textAlign: 'center', borderColor: 'divider' }}
      >
        {/* 无信号雷达：置于发丝圆盘中 */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: BRAND.hover,
            mb: 2.5,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <circle cx="28" cy="28" r="22" stroke="#cfd3da" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="14" stroke="#cfd3da" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="6" stroke="#cfd3da" strokeWidth="1.5" />
            <line x1="28" y1="2" x2="28" y2="54" stroke="#cfd3da" strokeWidth="1" />
            <line x1="2" y1="28" x2="54" y2="28" stroke="#cfd3da" strokeWidth="1" />
            <circle cx="40" cy="18" r="2.5" fill="#9aa0a6" />
          </svg>
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: BRAND.textPrimary, mb: 0.5 }}>
          没有匹配的法规情报
        </Typography>
        <Typography sx={{ fontSize: 13, color: BRAND.textTertiary, mb: onReset ? 3 : 0 }}>
          调整筛选条件，或等待下次采集
        </Typography>
        {onReset && (
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={onReset}
          >
            清除筛选条件
          </Button>
        )}
      </Paper>
    );
  }

  // 宽屏（lg+）双列网格，提升信息密度同时保持可读性。
  const gridSx = {
    display: 'grid',
    gap: 2,
    gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
  };

  // 列表视图：直接平铺
  if (sort === 'list') {
    return (
      <Box sx={gridSx}>
        {items.map((r, i) => (
          <Box key={r.id} sx={enterSx(i)}>
            <RegCard reg={r} onPatch={onPatch} />
          </Box>
        ))}
      </Box>
    );
  }

  // 时间线视图：按 publish_date 倒序分组
  const groups: Record<string, Regulation[]> = {};
  for (const r of items) {
    const key = r.publishDate ?? '未知日期';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  // 各日期组在整体序列中的起始序号，保证跨组交错动效连贯
  const offsets: number[] = [];
  let acc = 0;
  for (const k of keys) {
    offsets.push(acc);
    acc += groups[k].length;
  }

  return (
    <Stack spacing={3}>
      {keys.map((k, gi) => (
        <Box key={k}>
          {/* 日期头：等宽日期 + 条数 Tag + 发丝延伸线 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography
              sx={{
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 13,
                color: BRAND.textPrimary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {k}
            </Typography>
            <Tag label={`${groups[k].length} 条`} />
            <Divider sx={{ flexGrow: 1 }} />
          </Box>
          <Box sx={gridSx}>
            {groups[k].map((r, i) => (
              <Box key={r.id} sx={enterSx(offsets[gi] + i)}>
                <RegCard reg={r} onPatch={onPatch} />
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
