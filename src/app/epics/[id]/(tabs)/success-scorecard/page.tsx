"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { ScorecardPageContent } from '@/components/epic/ScorecardPageContent';

export default function SuccessScorecardPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  if (!id) {
    return <div>Invalid epic ID</div>;
  }

  return <ScorecardPageContent epicId={id} />;
}

