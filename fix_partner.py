import re

path = r"g:\Webitof company\jcbexchange\admin-portal\src\app\(partner)\partner\listings\page.tsx"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

correct_block = """      setListings((current) =>
        current.map((item) => (item.id === listingId ? response.data.listing : item))
      );
      
      setMessage(response.data.message || 'Availability updated successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (updateError) {
      setListings((current) =>
        current.map((item) => (item.id === listingId ? previousListing : item))
      );
      
      setError(getApiErrorMessage(updateError, 'Unable to update availability.'));
      setTimeout(() => setError(''), 3000);
    } finally {
      setUpdatingAvailabilityIds((current) => current.filter((id) => id !== listingId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-3">
          <button
            onClick={openModal}
            className="flex items-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
          >
            <Plus size={18} />
            Add Vehicle
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
            }`}
        >
          {error || message}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search listings by title, model or brand..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
            />
          </div>
        </div>

        {loadingListings ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading your listings...</div>"""

import re
# We match from `      setListings((current) =>` until `          <div className="p-12 text-center text-sm text-gray-500">Loading your listings...</div>`
pattern = re.compile(r"      setListings\(\(current\) =>\n        current\.map\(\(item\) => \(item\.id === listingId \? response\.data\.listing : item\)\)\n      \);[\s\S]*?<div className=\"p-12 text-center text-sm text-gray-500\">Loading your listings\.\.\.<\/div>")
new_content = pattern.sub(correct_block, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print(f"Fixed {path}")
