/*
  # Group Batch Approval Functions

  Creates secure RPCs to approve/reject booking batches.
  - approve_booking_batch(p_batch_id uuid)
  - reject_booking_batch(p_batch_id uuid)

  Behavior:
    * Verifies caller is the club owner of the batch's club (via club_users.user_id = auth.uid()).
    * Updates booking_batches.status and booking_batch_items.status.
    * For approve: sets related court_slots.is_booked = true.
    * For reject: sets related court_slots.is_booked = false (releases slots).
    * (Optional) Materializes approved bookings rows linked to the batch if they don't exist.

  Safe to rerun: functions are created OR replaced; grants are idempotent.
*/

-- Approve a booking batch
CREATE OR REPLACE FUNCTION public.approve_booking_batch(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_user_id uuid;
  v_club_id uuid;
BEGIN
  -- Verify caller is the club owner for this batch
  SELECT cu.user_id, bb.club_id
    INTO v_club_user_id, v_club_id
  FROM booking_batches bb
  JOIN club_users cu ON cu.id = bb.club_id
  WHERE bb.id = p_batch_id;

  IF v_club_user_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_club_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to approve this batch' USING ERRCODE = '42501';
  END IF;

  -- Update batch and items
  UPDATE booking_batches SET status = 'approved', updated_at = now() WHERE id = p_batch_id;
  UPDATE booking_batch_items SET status = 'approved' WHERE batch_id = p_batch_id;

  -- Flip slots to booked
  UPDATE court_slots cs
     SET is_booked = true
    FROM booking_batch_items bi
   WHERE bi.batch_id = p_batch_id
     AND bi.slot_id = cs.id;

  -- Materialize bookings (optional but helpful)
  INSERT INTO bookings (player_id, group_id, slot_id, status, payment_status, total_amount, booking_date, booking_batch_id)
  SELECT bb.player_id, bb.group_id, bi.slot_id, 'approved', 'pending', COALESCE(bi.price, 0), now(), bb.id
    FROM booking_batches bb
    JOIN booking_batch_items bi ON bi.batch_id = bb.id
   WHERE bb.id = p_batch_id
ON CONFLICT DO NOTHING;

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'club_id', v_club_id);
END;
$$;

-- Reject a booking batch
CREATE OR REPLACE FUNCTION public.reject_booking_batch(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_user_id uuid;
  v_club_id uuid;
BEGIN
  -- Verify caller is the club owner for this batch
  SELECT cu.user_id, bb.club_id
    INTO v_club_user_id, v_club_id
  FROM booking_batches bb
  JOIN club_users cu ON cu.id = bb.club_id
  WHERE bb.id = p_batch_id;

  IF v_club_user_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_club_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to reject this batch' USING ERRCODE = '42501';
  END IF;

  -- Update batch and items
  UPDATE booking_batches SET status = 'rejected', updated_at = now() WHERE id = p_batch_id;
  UPDATE booking_batch_items SET status = 'rejected' WHERE batch_id = p_batch_id;

  -- Release slots
  UPDATE court_slots cs
     SET is_booked = false
    FROM booking_batch_items bi
   WHERE bi.batch_id = p_batch_id
     AND bi.slot_id = cs.id;

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'club_id', v_club_id);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.approve_booking_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_booking_batch(uuid) TO authenticated;
