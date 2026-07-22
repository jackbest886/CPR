import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { MetaResponse, RegFilter } from '../../../shared/types';
import { BRAND, EYEBROW } from '../theme';

interface Props {
  meta: MetaResponse | null;
  filter: RegFilter;
  onChange: (patch: Partial<RegFilter>) => void;
}

function toggleIn<T extends string>(
  list: T[] | undefined,
  value: T,
): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(value)
    ? cur.filter((x) => x !== value)
    : [...cur, value];
  return next.length ? next : undefined;
}

export default function FilterPanel({ meta, filter, onChange }: Props) {
  const reset = () =>
    onChange({
      source: undefined,
      type: undefined,
      status: undefined,
      tags: undefined,
      q: undefined,
      from: undefined,
      to: undefined,
      watch: undefined,
      page: 1,
    });

  const groups: { key: string; label: string; node: ReactNode }[] = [];

  if (meta) {
    groups.push({
      key: 'source',
      label: '来源',
      node: (
        <WrapCheck
          options={meta.sources}
          selected={filter.source ?? []}
          onToggle={(v) => onChange({ source: toggleIn(filter.source, v) })}
        />
      ),
    });
    groups.push({
      key: 'type',
      label: '类型',
      node: (
        <WrapCheck
          options={meta.types}
          selected={filter.type ?? []}
          onToggle={(v) => onChange({ type: toggleIn(filter.type, v) })}
        />
      ),
    });
    groups.push({
      key: 'status',
      label: '状态',
      node: (
        <WrapCheck
          options={meta.statuses}
          selected={filter.status ?? []}
          onToggle={(v) => onChange({ status: toggleIn(filter.status, v) })}
        />
      ),
    });
    groups.push({
      key: 'tags',
      label: '标签',
      node: (
        <Stack direction="row" flexWrap="wrap" spacing={0.5} useFlexGap>
          {[...meta.formTags, ...meta.dimTags].map((tag) => {
            const active = (filter.tags ?? []).includes(tag);
            return (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                onClick={() => onChange({ tags: toggleIn(filter.tags, tag) })}
                sx={{
                  height: 24,
                  fontSize: 11,
                  borderRadius: 6,
                  borderColor: active ? BRAND.ink : 'divider',
                  bgcolor: active ? 'rgba(31,41,55,0.05)' : 'transparent',
                  color: active ? BRAND.ink : BRAND.textSecondary,
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': {
                    borderColor: active ? BRAND.ink : BRAND.hairlineStrong,
                    bgcolor: active ? 'rgba(31,41,55,0.07)' : BRAND.hover,
                  },
                }}
              />
            );
          })}
        </Stack>
      ),
    });
  }

  groups.push({
    key: 'range',
    label: '发布时间范围',
    node: (
      <Stack spacing={1}>
        <TextField
          label="起始"
          type="date"
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
          value={filter.from ?? ''}
          onChange={(e) => onChange({ from: e.target.value || undefined })}
        />
        <TextField
          label="截止"
          type="date"
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
          value={filter.to ?? ''}
          onChange={(e) => onChange({ to: e.target.value || undefined })}
        />
      </Stack>
    ),
  });

  groups.push({
    key: 'watch',
    label: '关注',
    node: (
      <FormControlLabel
        sx={{ m: 0 }}
        control={
          <Checkbox
            size="small"
            checked={filter.watch === true}
            onChange={(e) => onChange({ watch: e.target.checked || undefined })}
          />
        }
        label="仅看持续关注"
      />
    ),
  });

  return (
    <Box>
      {groups.map((g, i) => (
        <Group key={g.key} label={g.label} separated={i > 0}>
          {g.node}
        </Group>
      ))}

      <Divider sx={{ my: 2 }} />

      <Button
        fullWidth
        variant="outlined"
        startIcon={<RestartAltIcon />}
        sx={{
          borderColor: 'divider',
          color: BRAND.textSecondary,
          '&:hover': { borderColor: BRAND.hairlineStrong, bgcolor: BRAND.hover },
        }}
        onClick={reset}
      >
        重置筛选
      </Button>
    </Box>
  );
}

/** 分组容器：发丝线分隔 + 三级灰标签。 */
function Group({
  label,
  children,
  separated,
}: {
  label: string;
  children: ReactNode;
  separated?: boolean;
}) {
  return (
    <Box
      sx={{
        pt: separated ? 2 : 0,
        mt: separated ? 2 : 0,
        ...(separated ? { borderTop: '1px solid', borderColor: 'divider' } : {}),
      }}
    >
      <Typography sx={{ ...EYEBROW, mb: 1, lineHeight: 1.4 }}>{label}</Typography>
      {children}
    </Box>
  );
}

/** 来源/类型/状态多选：紧凑换行。 */
function WrapCheck<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: T[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ rowGap: 0 }}>
      {options.map((opt) => (
        <FormControlLabel
          key={opt}
          sx={{ mr: 1, mb: 0.25 }}
          control={
            <Checkbox
              size="small"
              checked={selected.includes(opt)}
              onChange={() => onToggle(opt)}
            />
          }
          label={opt}
        />
      ))}
    </Stack>
  );
}
