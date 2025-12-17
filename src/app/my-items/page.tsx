'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type MyItem = {
  id: string;
  status: string;
  condition?: string;
  condition_due_date?: string;
  launch: {
    id: string;
    name: string;
    target_launch_date?: string;
    tier: string;
  };
  criterion: {
    label: string;
    category: string;
  };
};

export default function MyItemsPage() {
  const [items, setItems] = useState<MyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch('/api/my-items');
      if (!res.ok) throw new Error('Failed to fetch items');
      const data = await res.json();
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="pt-24 p-8">Loading...</div>;

  return (
    <div className="pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold mb-6">My Items</h1>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>}

      {items.length === 0 ? (
        <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
          <div className="px-4 py-8 text-center text-gray-500">You have no assigned items.</div>
        </div>
      ) : (
        <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
          <table className="min-w-full divide-y divide-purple-200 table-fixed">
            <colgroup>
              <col className="w-auto" />
              <col className="w-auto" />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-24" />
            </colgroup>
            <thead className="bg-purple-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Launch</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                  Criterion
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">
                  Condition Due
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-purple-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-purple-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.launch.name}</div>
                    <div className="text-xs text-gray-500">
                      {item.launch.target_launch_date
                        ? new Date(item.launch.target_launch_date).toLocaleDateString()
                        : 'No date'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{item.criterion.label}</div>
                    <div className="text-xs text-gray-500">{item.criterion.category}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap w-24">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'GO'
                          ? 'bg-green-100 text-green-800'
                          : item.status === 'NO_GO'
                            ? 'bg-red-100 text-red-800'
                            : item.status === 'CONDITIONAL'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                    {item.condition_due_date ? (
                      <span
                        className={
                          new Date(item.condition_due_date) < new Date()
                            ? 'text-red-600 font-medium'
                            : ''
                        }
                      >
                        {new Date(item.condition_due_date).toLocaleDateString()}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                    <Link
                      href={`/launches/${item.launch.id}`}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
