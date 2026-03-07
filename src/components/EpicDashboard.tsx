'use client';

import { formatDateOnlyForDisplay } from '@/lib/date-utils';
import { Epic } from '@/types/epics';
import Link from 'next/link';

interface EpicDashboardProps {
    initialEpics: Epic[];
}

export default function EpicDashboard({ initialEpics }: EpicDashboardProps) {
    // We rely on router.refresh() in EpicForm to update the data prop from the server
    // but we can also optimistically update or just wait for the refresh.
    // Since initialEpics comes from the server page, router.refresh() will update it.

    return (
        <div className="space-y-6" style={{ fontFamily: 'var(--font-body)' }}>
            <div className="flex justify-between items-center">
                <h1 style={{ 
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'var(--font-size-page-title)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-gray-900)',
                    marginBottom: 'var(--spacing-6)'
                }}>Portfolio Dashboard</h1>
            </div>

            <div style={{
                backgroundColor: 'var(--table-bg)',
                boxShadow: 'var(--shadow-base)',
                overflow: 'hidden',
                borderRadius: 'var(--radius-md)',
                border: `1px solid var(--table-border)`
            }}>
                <table className="min-w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: 'var(--table-header-bg)' }}>
                        <tr>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                textAlign: 'left',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--table-header-text)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                fontFamily: 'var(--font-body)',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                Epic Name
                            </th>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                textAlign: 'left',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--table-header-text)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                fontFamily: 'var(--font-body)',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                Tier
                            </th>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                textAlign: 'left',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--table-header-text)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                fontFamily: 'var(--font-body)',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                Date
                            </th>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                textAlign: 'left',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--table-header-text)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                fontFamily: 'var(--font-body)',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                Status
                            </th>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                textAlign: 'left',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--table-header-text)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                fontFamily: 'var(--font-body)',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                Readiness
                            </th>
                            <th scope="col" style={{
                                padding: 'var(--table-cell-padding)',
                                position: 'relative',
                                borderBottom: `2px solid var(--table-border)`
                            }}>
                                <span className="sr-only">View</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="!bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                        {initialEpics.length === 0 ? (
                            <tr className="!bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                                <td colSpan={6} style={{
                                    padding: 'var(--spacing-12) var(--spacing-6)',
                                    textAlign: 'center',
                                    color: 'var(--color-gray-500)',
                                    fontSize: 'var(--font-size-base)',
                                    fontFamily: 'var(--font-body)'
                                }}>
                                    No epics found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            initialEpics.map((epic) => (
                                <tr 
                                    key={epic.id}
                                    className="!bg-white"
                                    style={{
                                        backgroundColor: '#FFFFFF',
                                        borderBottom: `1px solid var(--table-border)`,
                                        transition: 'var(--transition-fast)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--table-row-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                                >
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <div style={{
                                            fontSize: 'var(--font-size-sm)',
                                            fontWeight: 'var(--font-weight-medium)',
                                            color: 'var(--color-gray-900)',
                                            fontFamily: 'var(--font-body)'
                                        }}>{epic.name}</div>
                                        {epic.product_id && (
                                            <div style={{
                                                fontSize: 'var(--font-size-xs)',
                                                color: 'var(--color-gray-500)',
                                                fontFamily: 'var(--font-body)'
                                            }}>Product ID: {epic.product_id}</div>
                                        )}
                                    </td>
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <span style={{
                                            padding: 'var(--spacing-1) var(--spacing-2)',
                                            display: 'inline-flex',
                                            fontSize: 'var(--font-size-xs)',
                                            lineHeight: '1.25',
                                            fontWeight: 'var(--font-weight-semibold)',
                                            borderRadius: 'var(--radius-full)',
                                            backgroundColor: epic.tier === 'TIER_1' ? '#F3E8FF' : epic.tier === 'TIER_2' ? '#E0E7FF' : 'var(--color-blue-100)',
                                            color: epic.tier === 'TIER_1' ? '#6B21A8' : epic.tier === 'TIER_2' ? '#4338CA' : 'var(--color-blue-800)',
                                            fontFamily: 'var(--font-body)'
                                        }}>
                                            {epic.tier.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap',
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-gray-500)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {epic.target_launch_date ? formatDateOnlyForDisplay(epic.target_launch_date) : '-'}
                                    </td>
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <span style={{
                                            padding: 'var(--spacing-1) var(--spacing-2)',
                                            display: 'inline-flex',
                                            fontSize: 'var(--font-size-xs)',
                                            lineHeight: '1.25',
                                            fontWeight: 'var(--font-weight-semibold)',
                                            borderRadius: 'var(--radius-full)',
                                            backgroundColor: 'var(--color-success-light)',
                                            color: 'var(--color-success-dark)',
                                            fontFamily: 'var(--font-body)'
                                        }}>
                                            {epic.status}
                                        </span>
                                    </td>
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap',
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-gray-500)',
                                        fontFamily: 'var(--font-body)'
                                    }}>
                                        {epic.readiness_score !== undefined ? `${epic.readiness_score}%` : 'N/A'}
                                    </td>
                                    <td style={{
                                        padding: 'var(--table-cell-padding)',
                                        whiteSpace: 'nowrap',
                                        textAlign: 'right',
                                        fontSize: 'var(--font-size-sm)',
                                        fontWeight: 'var(--font-weight-medium)'
                                    }}>
                                        <Link href={`/epics/${epic.id}`} style={{
                                            color: 'var(--color-blue-600)',
                                            textDecoration: 'none',
                                            fontFamily: 'var(--font-body)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                        >
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );
}
