# Truss Tech — website prototype (Phase A) and website v1

| Folder | Published at | What it is |
|---|---|---|
| repo root | trusstech.com/awesome/trusstech/luisdmonroyr/website-prototype/ | Sketch prototype (line drawings, prototype notes), kept as it was before the 3D animations |
| `v1/` | trusstech.com/awesome/trusstech/luisdmonroyr/website/v1/ | Website first version: 3D animations, illustrations, no prototype notes; admin with a test-stage notice |

`v1/` is generated from the prototype sources with `_build/v1.py` (illustrations rendered with `_build/stills.html`).


Interactive design prototype for the new trusstech.com, built on the Truss design system.
Work in progress for client review: copy is provisional and unconfirmed data is tagged.
Not the official Truss Tech website. Not indexed by search engines.

Designed and built by Luis Monroy.

## Admin: quote requests (`admin/`)

Internal inbox where the team reviews "Submit plans" requests: status, owner, internal notes, plan preview and download, CSV export.
Linked from the site header ("Admin") and the mobile menu. **Sign-in required** (Supabase Auth, email + password): only people in
`staff_members` see data. Includes forgot/reset password, change password and sign out (Settings, gear icon).
Reads and writes the Supabase backend (repo `truss-tech-backend`). `admin/demo-files/` holds sample plan sheets marked as test data.
