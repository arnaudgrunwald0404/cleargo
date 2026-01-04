"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { RetroPageContent } from '@/components/epic/RetroPageContent';

export default function RetroPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  if (!id) {
    return <div>Invalid epic ID</div>;
  }

  return <RetroPageContent epicId={id} />;
}

