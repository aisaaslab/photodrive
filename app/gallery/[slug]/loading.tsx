export default function GalleryLoading() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Header skeleton */}
      <header className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        <div className="h-3 w-28 bg-surface-2 rounded-full mx-auto mb-6 animate-pulse" />
        <div className="h-12 w-80 bg-surface-2 rounded-xl mx-auto mb-4 animate-pulse" />
        <div className="h-4 w-48 bg-surface-2 rounded mx-auto animate-pulse" />
      </header>

      {/* Grid skeleton */}
      <div className="px-3 sm:px-6 pb-20 pt-6 max-w-screen-2xl mx-auto">
        <div className="photo-grid">
          {[1.5, 0.75, 1.5, 1, 1.78, 0.67, 1.5, 1.33, 1, 1.5, 0.75, 1.5].map((r, i) => (
            <div
              key={i}
              className="photo-item bg-surface-2 rounded-xl animate-pulse"
              style={{ "--r": r, aspectRatio: String(r) } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
