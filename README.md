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

## Group booking workflow overview

The platform now supports a dedicated **Group** role tailored for teams that plan
their court time in monthly blocks. Group accounts can sign up directly through
the authentication flow, and once verified they gain access to the Group
dashboard (`src/components/dashboard/GroupDashboard.tsx`). From there, the
monthly planner (`src/components/bookings/GroupMonthlyBooking.tsx`) lets them
review every available slot across their club, select the desired schedule, and
submit the entire batch in one action. The submission pipeline relies on the
`booking_batches` table plus the Supabase RPCs introduced in
`supabase/migrations/20251020123000_group_booking_support.sql` (notably
`get_club_monthly_available_slots` and `create_group_booking_batch`) to price and
persist the bookings safely.

Club operators manage these reservations from the updated
`src/components/bookings/ManageBookings.tsx` page. The interface offers a player
mode—filtered by `club_player_memberships`—and a group mode that lists the club’s
registered group accounts via the `list_club_groups` helper. Club staff can book
slots on behalf of a group using the same monthly planner, ensuring pricing and
availability stay consistent with the group-facing experience.

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
