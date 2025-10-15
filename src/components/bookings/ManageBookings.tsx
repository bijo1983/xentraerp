const fetchCourts = async () => {
  if (!userProfile) return;

  try {
    const uid = userProfile.user_id;

    // -------- 1) Try to discover how your schema links club -> user --------
    // First attempt: club_users has a column `club_id` (membership table).
    let clubIds: string[] | null = null;
    let membershipIds: string[] | null = null;

    let res1 = await supabase
      .from('club_users')
      .select('club_id')
      .eq('user_id', uid);

    if (res1.error) {
      // If this fails (likely "column club_id does not exist") fall back to selecting id only.
      console.warn('[manageBookings] club_users select club_id failed, fallback to id:', res1.error);
      const res2 = await supabase
        .from('club_users')
        .select('id')
        .eq('user_id', uid);

      if (res2.error) {
        console.error('[manageBookings] club_users select id failed:', res2.error);
        setCourts([]);
        return;
      }

      membershipIds = (res2.data ?? []).map((r: any) => r.id);
    } else {
      clubIds = (res1.data ?? []).map((r: any) => r.club_id).filter(Boolean);
    }

    // -------- 2) Try different court link shapes until one works ----------
    // Helper to try a query shape and only treat 200 as success
    const tryCourtsBy = async (shape: 'club_id'|'club_user_id'|'owner_user_id'|'created_by'|'created_by_user_id') => {
      let q = supabase.from('courts').select('*').order('name');

      if (shape === 'club_id' && clubIds && clubIds.length) {
        q = q.in('club_id', clubIds);
      } else if (shape === 'club_user_id' && membershipIds && membershipIds.length) {
        q = q.in('club_user_id', membershipIds);
      } else if (shape === 'owner_user_id') {
        q = q.eq('owner_user_id', uid);
      } else if (shape === 'created_by') {
        q = q.eq('created_by', uid);
      } else if (shape === 'created_by_user_id') {
        q = q.eq('created_by_user_id', uid);
      } else {
        return { ok: false as const };
      }

      const { data, error } = await q;
      if (error) {
        // 400: column doesn’t exist; 401/403: RLS; we just report and try next shape
        console.warn(`[manageBookings] courts by ${shape} failed:`, error);
        return { ok: false as const };
      }
      return { ok: true as const, data: data as Court[] };
    };

    // Try the likely options in order
    const attempts: Array<Parameters<typeof tryCourtsBy>[0]> = [
      'club_id',
      'club_user_id',
      'owner_user_id',
      'created_by',
      'created_by_user_id',
    ];

    let found: Court[] | null = null;
    for (const shape of attempts) {
      const r = await tryCourtsBy(shape);
      if (r.ok) {
        found = r.data ?? [];
        break;
      }
    }

    if (!found) {
      // Nothing worked
      console.error('[manageBookings] Unable to resolve courts for current user. Check schema & RLS.');
      setCourts([]);
      return;
    }

    setCourts(found);
    if (found.length > 0 && !found.some(c => c.id === selectedCourt)) {
      setSelectedCourt(found[0].id);
    }
  } catch (e) {
    console.error('[manageBookings] fetchCourts exception:', e);
    setCourts([]);
  }
};
