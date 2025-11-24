'use client';

import { useState } from 'react';
import { Launch } from '@/types/launches';
import LaunchForm from './LaunchForm';
import Link from 'next/link';

interface LaunchDashboardProps {
    initialLaunches: Launch[];
}

export default function LaunchDashboard({ initialLaunches }: LaunchDashboardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    // We rely on router.refresh() in LaunchForm to update the data prop from the server
    // but we can also optimistically update or just wait for the refresh.
    // Since initialLaunches comes from the server page, router.refresh() will update it.

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Portfolio Dashboard</h1>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                    + New Launch
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Launch Name
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
                    <tbody className="bg-white divide-y divide-gray-200">
                        {initialLaunches.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No launches found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            initialLaunches.map((launch) => (
                                <tr key={launch.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{launch.name}</div>
                                        {launch.product_id && (
                                            <div className="text-xs text-gray-500">Product ID: {launch.product_id}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${launch.tier === 'TIER_1' ? 'bg-purple-100 text-purple-800' :
                                                launch.tier === 'TIER_2' ? 'bg-indigo-100 text-indigo-800' :
                                                    'bg-blue-100 text-blue-800'}`}>
                                            {launch.tier.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {launch.target_launch_date ? new Date(launch.target_launch_date).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                            {launch.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {launch.readiness_score !== undefined ? `${launch.readiness_score}%` : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Link href={`/dashboard/launches/${launch.id}`} className="text-blue-600 hover:text-blue-900">
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Simple Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setIsModalOpen(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
                                    Create New Launch
                                </h3>
                                <LaunchForm
                                    onSuccess={() => setIsModalOpen(false)}
                                    onCancel={() => setIsModalOpen(false)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
