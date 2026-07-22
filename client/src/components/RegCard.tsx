import {
  Box,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { Regulation, RegStatus } from '../../../shared/types';
import { REG_STATUSES } from '../../../shared/constants';
import {
  BRAND,
  DURATION,
  EASE,
  MONO,
  SHADOW,
  SOURCE_COLOR,
  STATUS_COLOR,
} from '../theme';
import Badge, { Tag } from './Badge';

interface Props {
  reg: Regulation;
  onPatch: (
    id: string,
    patch: { watch?: boolean; status?: RegStatus; by?: string },
  ) => void;
}

export default function RegCard({ reg, onPatch }: Props) {
  const sourceColor = SOURCE_COLOR[reg.source] ?? '#9aa0a6';
  const statusColor = (reg.status && STATUS_COLOR[reg.status]) || '#8a8f98';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: '20px 22px',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        transition: `background-color ${DURATION.base}ms ${EASE}, border-color ${DURATION.base}ms ${EASE}, box-shadow ${DURATION.base}ms ${EASE}, transform ${DURATION.base}ms ${EASE}`,
        '&:hover': {
          bgcolor: BRAND.hover,
          borderColor: BRAND.hairlineStrong,
          boxShadow: SHADOW.cardHover,
          transform: 'translateY(-1px)',
        },
      }}
    >
      {/* 左侧来源色脊线（信号色仅此一处，与标识区 pill 左边对齐） */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: sourceColor,
        }}
      />

      {/* 1. 元信息行：来源 badge · 子机构 · 状态 badge + 末尾类型 tag + 右上星标 */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1.25, flexWrap: 'wrap', pr: 0.5, rowGap: 0.75 }}
      >
        <Badge color={sourceColor} label={reg.source} />
        {reg.sourceSub && (
          <Typography
            sx={{ fontSize: 12, color: BRAND.textTertiary, lineHeight: 1.4 }}
          >
            {reg.sourceSub}
          </Typography>
        )}
        {reg.status && <Badge color={statusColor} label={reg.status} />}

        <Box sx={{ flexGrow: 1 }} />

        <Tag label={reg.type} />
        <Tooltip title={reg.watch ? '取消持续关注' : '持续关注'}>
          <IconButton
            size="small"
            color={reg.watch ? 'warning' : 'default'}
            onClick={() => onPatch(reg.id, { watch: !reg.watch })}
            aria-label="关注"
            sx={{ ml: 0.25 }}
          >
            {reg.watch ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* 2. 标题（2 行截断，悬停 Tooltip 查看完整） */}
      <Tooltip title={reg.title} placement="top">
        <Typography
          variant="subtitle1"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}
        >
          {reg.title}
        </Typography>
      </Tooltip>

      {/* 3. 摘要（3 行截断） */}
      {reg.summary && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 1,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {reg.summary}
        </Typography>
      )}

      {/* 发丝分隔线：强化结构化 */}
      <Divider sx={{ my: 1.5, borderColor: 'divider' }} />

      {/* 4. 底部行：等宽日期 · 前 1–2 标签 · 原文链接 · 状态校正 */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ flexWrap: 'wrap', rowGap: 0.75 }}
      >
        <Typography
          sx={{
            fontSize: 12,
            color: BRAND.textTertiary,
            fontFamily: MONO,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.6,
          }}
        >
          {reg.publishDate ?? '日期未知'}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          {reg.tags.slice(0, 2).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {reg.originalUrl ? (
          <Link
            href={reg.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              fontSize: 12,
              fontWeight: 500,
              color: BRAND.ink,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              lineHeight: 1.6,
              pb: '1px',
              // 下划线微动效：自左向右生长
              backgroundImage: `linear-gradient(${BRAND.ink}, ${BRAND.ink})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '0 100%',
              backgroundSize: '0% 1px',
              transition: `background-size ${DURATION.base}ms ${EASE}`,
              '&:hover': { backgroundSize: '100% 1px' },
            }}
          >
            查看原文 ↗
          </Link>
        ) : (
          <Tooltip title="暂无原文链接">
            <Typography
              sx={{
                fontSize: 12,
                color: BRAND.textTertiary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                lineHeight: 1.6,
              }}
            >
              查看原文 ↗
            </Typography>
          </Tooltip>
        )}

        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel id={`st-${reg.id}`}>状态</InputLabel>
          <Select
            labelId={`st-${reg.id}`}
            label="状态"
            value={reg.status ?? ''}
            onChange={(e) =>
              onPatch(reg.id, {
                status: (e.target.value || undefined) as RegStatus | undefined,
                by: 'user',
              })
            }
          >
            <MenuItem value="">
              <em>不变</em>
            </MenuItem>
            {REG_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
}
