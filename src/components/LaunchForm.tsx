'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateLaunchDTO, LaunchTier } from '@/types/launches';

interface LaunchFormProps {
    onSuccess?: () => void;
    onCancel?: () => void;
}

export default function LaunchForm({ onSuccess, onCancel }: LaunchFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<CreateLaunchDTO>({
        name: '',
        tier: 'TIER_1',
        target_launch_date: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/launches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create launch');
            }

            router.refresh(); // Refresh server components
            if (onSuccess) onSuccess();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                    {error}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700">Launch Name</label>
                <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Q4 Feature Release"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Tier</label>
                <select
                    value={formData.tier}
                    onChange={(e) => setFormData({ ...formData, tier: e.target.value as LaunchTier })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                    <option value="TIER_1">Tier 1 (Major)</option>
                    <option value="TIER_2">Tier 2 (Significant)</option>
                    <option value="TIER_3">Tier 3 (Minor)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                    Tier determines the readiness criteria and approval process.
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Target Launch Date</label>
                <input
                    type="date"
                    value={formData.target_launch_date || ''}
                    onChange={(e) => setFormData({ ...formData, target_launch_date: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {loading ? 'Creating...' : 'Create Launch'}
                </button>
            </div>
        </form>
    );
}
