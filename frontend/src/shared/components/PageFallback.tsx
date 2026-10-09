/** Shown for the moment a page's code is still downloading (first visit only). */
export default function PageFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center ${fullScreen ? 'min-h-screen bg-surface' : 'min-h-[50vh]'}`}
      role="status"
      aria-label="Loading"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
    </div>
  );
}
