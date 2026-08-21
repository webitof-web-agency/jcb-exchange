import re

def remove_modal_from_file(path, route_prefix):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace the "viewListing" state declaration
    content = re.sub(r'const \[viewListing, setViewListing\] = useState<ListingRecord \| null>\(null\);\n?', '', content)

    # Replace the View button
    # It might look like: onClick={() => setViewListing(listing)}
    # Find the button and replace its onClick
    # Wait, the button has <Eye className="h-4 w-4" />
    button_regex = r'<button[^>]*onClick=\{\(\) => setViewListing\(listing\)\}[^>]*>([\s\S]*?)<\/button>'
    replacement = rf'<Link href={{`{route_prefix}/${{listing.id}}`}} className="rounded-lg p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600" title="View details">\1</Link>'
    content = re.sub(button_regex, replacement, content)

    # If it was an action button for view in dropdown, maybe we need to check if there is a dropdown? No, it's just a button.

    # Remove the modal block at the bottom
    # It looks like: {viewListing ? ( ... ) : null}
    # It's a huge block. Let's use regex that balances braces or just match until : null}
    modal_regex = r'\{viewListing \? \(\s*<div className="fixed inset-0[^>]*>[\s\S]*?\)\s*:\s*null\}'
    content = re.sub(modal_regex, '', content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Removed modal from {path}")

remove_modal_from_file(
    r"g:\Webitof company\jcbexchange\admin-portal\src\app\(admin)\superadmin\listings\page.tsx",
    "/superadmin/listings"
)
remove_modal_from_file(
    r"g:\Webitof company\jcbexchange\admin-portal\src\app\(partner)\partner\listings\page.tsx",
    "/partner/listings"
)
