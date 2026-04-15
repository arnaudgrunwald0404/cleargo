import Link from 'next/link';

/**
 * Explicit 404 page so the app route graph does not depend only on Next’s
 * built-in not-found bundle (helps avoid Turbopack “module factory is not available”
 * when unknown paths are requested).
 */
export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-4"
      style={{
        backgroundColor: 'var(--color-platinum)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <h1
        className="text-2xl font-bold text-gray-900"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        Page not found
      </h1>
      <p className="text-gray-600 text-center max-w-md">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link href="/" className="text-blue-600 hover:underline font-medium">
        Return home
      </Link>
    </div>
  );
}
