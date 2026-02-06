-- Allow authors to update their own comments (for edit feature)
DROP POLICY IF EXISTS "Users can update their own comments" ON criterion_comment;
CREATE POLICY "Users can update their own comments"
  ON criterion_comment FOR UPDATE
  USING (created_by IN (
    SELECT id FROM app_user WHERE LOWER(email) = LOWER((SELECT auth.jwt() ->> 'email'))
  ))
  WITH CHECK (created_by IN (
    SELECT id FROM app_user WHERE LOWER(email) = LOWER((SELECT auth.jwt() ->> 'email'))
  ));
