import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import type {
  MetaResponse,
  RegFilter,
  RegStatus,
  StatsResponse,
} from '../../shared/types';
import { DEFAULT_PAGE_SIZE } from '../../shared/constants';
import {
  fetchMeta,
  fetchRegulations,
  fetchStats,
  runCollection,
  type RegulationsResult,
} from './api';
import { BRAND, MONO } from './theme';
import TopBar from './components/TopBar';
import StatBand from './components/StatBand';
import FilterPanel from './components/FilterPanel';
import TimelineView from './components/TimelineView';
import TimelineSkeleton from './components/TimelineSkeleton';

export default function App() {
  const [filter, setFilter] = useState<RegFilter>({
    sort: 'timeline',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [data, setData] = useState<RegulationsResult | null>(null);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((e) => setError(String((e as Error).message)));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([fetchRegulations(filter), fetchStats()]);
      setData(d);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      await runCollection();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const patch = useCallback(
    async (id: string, p: { watch?: boolean; status?: RegStatus; by?: string }) => {
      const res = await fetch(`/api/regulations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      await refresh();
    },
    [refresh],
  );

  const updateFilter = (patchFilter: Partial<RegFilter>) => {
    setFilter((f) => ({ ...f, ...patchFilter, page: 1 }));
  };

  /** 空态「清除筛选」：清空全部条件，保留排序与分页大小 */
  const resetFilters = useCallback(() => {
    setFilter((f) => ({ sort: f.sort, page: 1, pageSize: f.pageSize }));
  }, []);

  const goPage = (page: number) => setFilter((f) => ({ ...f, page }));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopBar
        q={filter.q ?? ''}
        onSearch={(q) => updateFilter({ q })}
        onRun={handleRun}
        running={running}
        stats={stats}
      />

      <Container maxWidth="xl" sx={{ px: { xs: 2, md: 4, xl: 5 }, mt: 3, pb: 8 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }}>
            {error}
          </Alert>
        )}

        {/* 顶部统计概览条：法规总数 / FDA / EMA / NMPA / 近30天新增 */}
        <StatBand stats={stats} />

        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {/* 左栏筛选：窄屏折叠为抽屉 */}
          <Box
            sx={{
              width: 220,
              flexShrink: 0,
              display: { xs: 'none', md: 'block' },
            }}
          >
            <FilterPanel meta={meta} filter={filter} onChange={updateFilter} />
          </Box>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography
                sx={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: BRAND.textTertiary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                共 {data?.total ?? 0} 条
                {data
                  ? ` · 第 ${data.page}/${Math.max(1, Math.ceil(data.total / data.pageSize))} 页`
                  : ''}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* 排序：发丝边框分段控件 */}
                <Paper
                  elevation={0}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 8,
                    p: 0.25,
                    display: { xs: 'none', md: 'inline-flex' },
                  }}
                >
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={filter.sort ?? 'timeline'}
                    onChange={(e, val) => {
                      if (val) updateFilter({ sort: val });
                    }}
                  >
                    <ToggleButton value="timeline">时间线</ToggleButton>
                    <ToggleButton value="list">列表</ToggleButton>
                  </ToggleButtonGroup>
                </Paper>
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                  <IconButton onClick={() => setDrawerOpen(true)} aria-label="筛选">
                    <FilterAltIcon />
                  </IconButton>
                </Box>
              </Box>
            </Stack>

            {loading ? (
              <TimelineSkeleton />
            ) : (
              data && (
                <>
                  <TimelineView
                    items={data.items}
                    sort={filter.sort ?? 'timeline'}
                    onPatch={patch}
                    onReset={resetFilters}
                  />
                  <Stack
                    direction="row"
                    justifyContent="center"
                    spacing={2}
                    sx={{ mt: 3 }}
                  >
                    <Button
                      variant="outlined"
                      disabled={(data.page ?? 1) <= 1}
                      onClick={() => goPage((data.page ?? 1) - 1)}
                      sx={{ minWidth: 96 }}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={(data.page ?? 1) * data.pageSize >= data.total}
                      onClick={() => goPage((data.page ?? 1) + 1)}
                      sx={{ minWidth: 96 }}
                    >
                      下一页
                    </Button>
                  </Stack>
                </>
              )
            )}
          </Box>
        </Box>
      </Container>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 320, p: 2.5 }}>
          <FilterPanel meta={meta} filter={filter} onChange={updateFilter} />
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setDrawerOpen(false)}>
            完成
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
