"use client";

import { Alert, Stack, Text, Title } from '@mantine/core';
import { IconChartLine } from '@tabler/icons-react';

interface ForecastPageContentProps {
  epicAhaId: string;
}

/**
 * Phase 0 stub — the Forecast tab's data model (forecast_runs, forecast_assumptions,
 * forecast_periods, forecast_narrative) exists, but this tab does not read from it yet.
 * Phase 1 migrates the 11 existing Chrysalis forecasts into that model; Phase 2 renders
 * the migrated run here (annual/quarterly tables, assumptions, narrative).
 */
export function ForecastPageContent({ epicAhaId }: ForecastPageContentProps) {
  return (
    <Stack gap="md">
      <Title order={4}>Forecast</Title>
      <Alert icon={<IconChartLine size={18} />} color="gray" variant="light">
        <Text size="sm">
          The in-app forecast for this epic ({epicAhaId}) is being migrated from the Chrysalis
          product-requirements repo. This tab will show revenue and churn-reduction projections,
          editable assumptions, and the supporting narrative once migration lands.
        </Text>
      </Alert>
    </Stack>
  );
}
