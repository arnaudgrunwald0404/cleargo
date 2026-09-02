import { Suspense } from 'react';
import GtmLaunchesClient from './GtmLaunchesClient';

export const dynamic = 'force-dynamic';

/**
 * Server shell around the client list, matching /epics. The Suspense boundary is
 * required rather than cosmetic: the client reads filter state out of the query
 * string with useSearchParams(), which cannot be prerendered without one.
 *
 * The fallback mirrors the real layout — header, filter bar, table — so the page
 * does not collapse to a spinner and reflow once data lands.
 */
export default function GTMLaunchesPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen" style={{ background: 'var(--color-platinum)' }}>
                    <div
                        style={{
                            maxWidth: 'var(--page-container-max-width)',
                            margin: '0 auto',
                            paddingLeft: 'var(--page-container-padding-x)',
                            paddingRight: 'var(--page-container-padding-x)',
                            paddingTop: 'var(--page-container-padding-top)',
                            paddingBottom: 'var(--spacing-8)',
                        }}
                    >
                        <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded w-80 mb-6 animate-pulse" />
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <div className="h-7 bg-gray-200 rounded w-48 animate-pulse" />
                            <div className="h-9 bg-gray-200 rounded w-56 animate-pulse" />
                            <div className="h-9 bg-gray-200 rounded w-32 animate-pulse" />
                            <div className="h-9 bg-gray-200 rounded w-36 animate-pulse" />
                            <div className="h-9 bg-gray-200 rounded w-40 animate-pulse" />
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="h-11 bg-gray-50 border-b border-gray-200" />
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-14 border-b border-gray-100 flex items-center px-5 gap-5">
                                    <div className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
                                    <div className="h-5 bg-gray-200 rounded animate-pulse w-16" />
                                    <div className="h-5 bg-gray-200 rounded animate-pulse w-24" />
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                                    <div className="h-4 bg-gray-200 rounded animate-pulse w-36" />
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            }
        >
            <GtmLaunchesClient />
        </Suspense>
    );
}
