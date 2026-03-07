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
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Portfolio Dashboard</h1>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Epic Name
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tier
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Readiness
                            </th>
                            <th scope="col" className="relative px-6 py-3">
                                <span className="sr-only">View</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="!bg-white divide-y divide-gray-200" style={{ backgroundColor: '#FFFFFF' }}>
                        {initialEpics.length === 0 ? (
                            <tr className="!bg-white" style={{ backgroundColor: '#FFFFFF' }}>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No epics found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            initialEpics.map((epic) => (
                                <tr key={epic.id} className="!bg-white hover:bg-gray-50" style={{ backgroundColor: '#FFFFFF' }}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{epic.name}</div>
                                        {epic.product_id && (
                                            <div className="text-xs text-gray-500">Product ID: {epic.product_id}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${epic.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                epic.tier === 'TIER_2' ? 'bg-indigo-100 text-indigo-800' :
                                                    'bg-blue-100 text-blue-800'}`}>
                                            {epic.tier.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {epic.target_launch_date ? formatDateOnlyForDisplay(epic.target_launch_date) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                            {epic.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {epic.readiness_score !== undefined ? `${epic.readiness_score}%` : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Link href={`/epics/${epic.id}`} className="text-blue-600 hover:text-blue-900">
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
