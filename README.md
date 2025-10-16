badmintonbooking_Updated
========================

## Brand assets

`index.html` expects the favicon and logo PNGs to exist under
`public/brand`. The repository keeps that directory empty (aside from a
`.gitkeep`) so binary assets do not end up in version control. Generate the
files locally with:

```
python tools/generate_brand_assets.py
```

The command above writes the resized PNGs plus a multi-size `favicon.ico`
directly to `public/brand`. To regenerate the set from a different square PNG,
provide the source path:

```
python tools/generate_brand_assets.py --source /path/to/new_logo.png
```

If you need a single archive to download or share, supply the optional
`--archive` flag. For example, this creates `tools/downloads/brand-assets.zip`
alongside the individual files:

```
python tools/generate_brand_assets.py --archive tools/downloads/brand-assets.zip
```

## Admin console status reference

The admin console manages two kinds of partner accounts—clubs and event organizers.
Both groups share the same lifecycle fields, so the status rules below apply to
either entity type.

### Approval status

Each profile carries an `approval_status` value. New registrations start in the
`pending` state and are hidden from public listings. Approving a profile moves it
to `approved` and automatically makes it visible in search results. Rejected
profiles switch to `rejected` and remain hidden. If you manually toggle
visibility on a pending profile, the console upgrades it to `approved` so the
listing can surface. Changing a profile back to `pending` or `rejected` forces it
off the public directory.

| Status    | Purpose                                                     |
|-----------|-------------------------------------------------------------|
| `pending` | Awaiting manual review. Hidden from club/organizer listings. |
| `approved`| Cleared for use. Visible unless explicitly hidden.          |
| `rejected`| Denied access. Always hidden from customer-facing views.    |

The same three states are enforced at the database level for both
`club_users` and `organizer_users` tables.

### Payment status

The `payment_status` field tracks subscription billing. Admins can switch
between:

| Status   | Meaning                                             |
|----------|-----------------------------------------------------|
| `unpaid` | Default for new sign-ups that have not been charged. |
| `paid`   | Active subscription in good standing.                |
| `overdue`| Payment issue that needs follow-up.                  |

### Visibility toggle

Finally, the `is_visible` flag controls whether a profile appears in the
customer directory. Approving a profile sets it to visible; rejecting or
reverting to pending forces it off. Admins can hide an approved profile without
changing its approval status, but revealing a hidden, pending profile will
promote it to `approved` first to maintain consistent public listings.
