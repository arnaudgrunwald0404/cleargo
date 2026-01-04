"use client";
import AuditLogViewer from '@/components/admin/AuditLogViewer';
import Link from 'next/link';

export default function AuditPage() {
    return (
        <div style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingTop: 'var(--page-container-padding-top)',
          paddingBottom: 'var(--spacing-8)',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)'
        }}
        className="sm:px-6 lg:px-8"
        >
            <div className="mb-6">
                <Link href="/admin" className="text-blue-600 hover:underline">← Back to Admin</Link>
            </div>

            <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-page-title)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)',
                marginBottom: 'var(--spacing-6)'
            }}>Audit Logs</h1>

            <AuditLogViewer />
        </div>
    );
}
