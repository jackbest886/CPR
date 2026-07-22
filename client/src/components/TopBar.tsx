import {
  Box,
  Button,
  InputBase,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import type { StatsResponse } from '../../../shared/types';
import { BRAND, MONO, SHADOW } from '../theme';

interface Props {
  q: string;
  onSearch: (q: string) => void;
  onRun: () => void;
  running: boolean;
  /** 保留：统计信息已移至顶栏下方细行（见 App）。 */
  stats: StatsResponse | null;
}

export default function TopBar({ q, onSearch, onRun, running }: Props) {
  return (
    <Paper
      square
      elevation={0}
      sx={{
        px: { xs: 2, md: 4 },
        py: 1.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          maxWidth: 1536,
          mx: 'auto',
        }}
      >
        {/* 产品标识 + 字样 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            component="span"
            sx={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid',
              borderColor: BRAND.hairline,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="3" stroke={BRAND.ink} strokeWidth="1.4" />
              <path
                d="M5 8h6M8 5v6"
                stroke={BRAND.ink}
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </Box>
          <Box>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                color: BRAND.ink,
              }}
            >
              法规情报
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                fontFamily: MONO,
                color: BRAND.textHelper,
                letterSpacing: '0.06em',
                lineHeight: 1.2,
              }}
            >
              药械组合 · COMBINATION
            </Typography>
          </Box>
        </Box>

        {/* 弹性占位，把搜索与按钮推到右侧 */}
        <Box sx={{ flexGrow: 1 }} />

        {/* 搜索框：发丝边框、圆角、克制，聚焦变墨黑 */}
        <Paper
          component="form"
          elevation={0}
          onSubmit={(e) => e.preventDefault()}
          sx={{
            p: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: 380,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 10,
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
            '&:focus-within': { borderColor: BRAND.ink, boxShadow: SHADOW.focusRing },
          }}
        >
          <SearchIcon fontSize="small" sx={{ color: BRAND.textTertiary, mr: 1 }} />
          <InputBase
            sx={{ flex: 1, fontSize: 14, color: 'text.primary' }}
            placeholder="搜索标题 / 关键词"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
        </Paper>

        <Tooltip title="立即运行一次采集任务">
          <span>
            <Button
              variant="contained"
              disableElevation
              startIcon={<AutorenewIcon />}
              onClick={onRun}
              disabled={running}
            >
              {running ? '采集中…' : '运行采集'}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Paper>
  );
}
