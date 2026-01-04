"use client";

import { CriteriaManager } from "@/components/admin/CriteriaManager";

export default function CriteriaAdminPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div style={{
        maxWidth: 'var(--page-container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--page-container-padding-x)',
        paddingRight: 'var(--page-container-padding-x)',
        paddingTop: 'var(--page-container-padding-top)',
        paddingBottom: 'var(--spacing-8)'
      }}
      className="sm:px-6 lg:px-8"
      >
        <CriteriaManager />
      </div>
    </main>
  );
}
