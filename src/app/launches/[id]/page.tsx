"use client";
import { useEffect, useState } from "react";
import { Launch } from "@/types/launches";
import Link from "next/link";
import { useParams } from "next/navigation";
import Matrix from "@/components/Matrix";
import { createClient } from "@/lib/supabase/client";

export default function LaunchDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [launch, setLaunch] = useState<Launch | null>(null);
    const [matrix, setMatrix] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    async function loadData() {
        try {
            // Fetch launch
            const res = await fetch(`/api/launches/${id}`);
            if (!res.ok) throw new Error("Failed to fetch launch");
            const data = await res.json();
            setLaunch(data);

            // Fetch matrix
            // We can use Supabase client directly here for ease, or create an API route.
            // Let's use Supabase client for read-only (or authenticated read)
            const supabase = createClient();
            const { data: matrixData, error: matrixError } = await supabase
                .from('launch_criterion_status')
                .select(`
                    *,
                    criterion:criterion_id (*)
                `)
                .eq('launch_id', id)
                .order('criterion(sort_order)'); // This might fail if sort_order is not on the join? 
            // Supabase join sorting syntax is tricky. Let's sort in JS.

            if (matrixError) throw matrixError;

            // Sort by criterion sort_order
            const sorted = (matrixData || []).sort((a: any, b: any) =>
                (a.criterion?.sort_order || 0) - (b.criterion?.sort_order || 0)
            );

            setMatrix(sorted);

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="p-8">Loading...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!launch) return <div className="p-8">Launch not found</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="mb-6">
                <Link href="/launches" className="text-blue-600 hover:underline">← Back to Launches</Link>
            </div>

            <div className="bg-white p-6 rounded shadow border mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{launch.name}</h1>
                        <div className="flex gap-3 text-sm text-gray-600">
                            <span className="bg-gray-100 px-2 py-1 rounded">{(launch as any).product?.name || 'No Product'}</span>
                            <span className="bg-gray-100 px-2 py-1 rounded">{launch.tier}</span>
                            <span className="bg-gray-100 px-2 py-1 rounded">{launch.status}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-500">Target Date</div>
                        <div className="font-medium text-lg">
                            {launch.target_launch_date ? new Date(launch.target_launch_date).toLocaleDateString() : 'Not set'}
                        </div>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-4 gap-4 border-t pt-6">
                    <div>
                        <div className="text-sm text-gray-500">Readiness Score</div>
                        <div className="text-2xl font-bold">{launch.readiness_score ? `${Math.round(launch.readiness_score * 100)}%` : '0%'}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500">Risk Level</div>
                        <div className={`text-2xl font-bold ${launch.risk_level === 'HIGH' ? 'text-red-600' : launch.risk_level === 'MEDIUM' ? 'text-orange-500' : 'text-green-600'}`}>
                            {launch.risk_level || 'LOW'}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500">Aha! Link</div>
                        <div>
                            {launch.aha_url ? (
                                <a href={launch.aha_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    View in Aha!
                                </a>
                            ) : (
                                <span className="text-gray-400">Not linked</span>
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500">Owner</div>
                        <div>{(launch as any).owner?.name || (launch as any).owner?.email || 'Unassigned'}</div>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <h2 className="text-xl font-bold mb-4">Readiness Matrix</h2>
                {matrix.length === 0 ? (
                    <div className="bg-yellow-50 p-4 rounded text-yellow-800">
                        No criteria found. This might be because no criteria matched the launch tier ({launch.tier}) or none are active.
                    </div>
                ) : (
                    <Matrix launchId={launch.id} items={matrix} onUpdate={loadData} />
                )}
            </div>
        </div>
    );
}
