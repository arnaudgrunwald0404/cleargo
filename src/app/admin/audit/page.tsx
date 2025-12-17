'use client';
import AuditLogViewer from '@/components/admin/AuditLogViewer';
import Link from 'next/link';

export default function AuditPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← Back to Admin
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Audit Logs</h1>

      <AuditLogViewer />
    </div>
  );
}
