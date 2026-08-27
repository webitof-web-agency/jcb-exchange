export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      <div className="w-full border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto h-4 max-w-7xl animate-pulse rounded bg-gray-200" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex-1">
            <div className="mb-8 aspect-[16/10] animate-pulse rounded-xl bg-gray-200" />
            <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
            <div className="mb-10 h-52 animate-pulse rounded-xl bg-white" />
            <div className="h-64 animate-pulse rounded-xl bg-white" />
          </div>

          <div className="w-full lg:w-[380px]">
            <div className="h-[520px] animate-pulse rounded-xl bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
