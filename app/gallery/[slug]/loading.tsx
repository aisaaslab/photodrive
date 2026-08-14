export default function GalleryLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header skeleton */}
      <header className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        <div className="h-3 w-28 bg-stone-200 rounded-full mx-auto mb-6 animate-pulse" />
        <div className="h-12 w-80 bg-stone-200 rounded-xl mx-auto mb-4 animate-pulse" />
        <div className="h-4 w-48 bg-stone-200 rounded mx-auto animate-pulse" />
      </header>

      {/* Grid skeleton */}
      <div className="px-3 sm:px-6 pb-20 pt-6 max-w-screen-2xl mx-auto">
        <div className="masonry-grid">
          {[260, 190, 320, 210, 280, 160, 300, 240, 180, 340, 220, 270].map((h, i) => (
            <div
              key={i}
              className="masonry-item bg-stone-200 rounded-xl animate-pulse"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
