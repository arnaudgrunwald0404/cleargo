"use client";

import { useEpicScope } from '@/lib/contexts/EpicScopeContext';
import { usePathname } from 'next/navigation';
import { Alert } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

export function ScopeFilterBanner() {
  const { isMyScope } = useEpicScope();
  const pathname = usePathname();

  // Don't show banner if:
  // - Scope is "all"
  // - On EpicDetail page
  // - On search page (search always shows all)
  if (!isMyScope || pathname?.includes('/epics/') || pathname?.includes('/search')) {
    return null;
  }

  return (
    <Alert
      icon={<IconInfoCircle size={20} />}
      title="Content Filtered"
      color="blue"
      variant="light"
      styles={{
        root: {
          marginBottom: '24px',
          backgroundColor: '#eff6ff',
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          padding: '16px 20px',
        },
        title: {
          fontSize: '16px',
          fontWeight: 600,
          color: '#1e40af',
          marginBottom: '4px',
        },
        message: {
          fontSize: '14px',
          color: '#1e3a8a',
        },
        icon: {
          color: '#3b82f6',
        },
      }}
    >
      Content filtered to show epics in your scope. This includes epics where you are the owner of at least one criterion.
    </Alert>
  );
}

