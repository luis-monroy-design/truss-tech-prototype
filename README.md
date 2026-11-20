# Truss Tech — website prototype (Phase A)

Interactive design prototype for the new trusstech.com, built on the Truss design system.
Work in progress for client review: copy is provisional and unconfirmed data is tagged.
Not the official Truss Tech website. Not indexed by search engines.

Designed and built by Luis Monroy.

## Admin: quote requests (`admin/`)

Internal inbox where the team reviews "Submit plans" requests: status, owner, internal notes, plan preview and download, CSV export.
Reads and writes the Supabase backend (repo `truss-tech-backend`). **Preview mode:** the page is public and the database only
returns and accepts changes on the 3 test requests (`is_demo`); real requests need sign-in, which comes before launch.
`admin/demo-files/` holds sample plan sheets marked as test data.
