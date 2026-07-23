-- ============================================================
-- Feedback Reports System
-- ============================================================

-- 1. feedback_reports table
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      text NOT NULL CHECK (category IN ('bug_report','feature_request','improvement','question','general','other')),
  subject       text NOT NULL CHECK (length(trim(subject)) >= 3 AND length(subject) <= 200),
  description   text NOT NULL CHECK (length(trim(description)) >= 10 AND length(description) <= 5000),
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  screenshot_url text,
  browser       text,
  os            text,
  current_page  text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','resolved','closed')),
  admin_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_reports_user_id ON public.feedback_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON public.feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_created_at ON public.feedback_reports(created_at DESC);

-- 3. Unique constraint: prevent duplicate submissions within 60 seconds
CREATE OR REPLACE FUNCTION public.check_feedback_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.feedback_reports
    WHERE user_id = NEW.user_id
      AND subject = NEW.subject
      AND description = NEW.description
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate feedback submission detected. Please wait before submitting again.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feedback_duplicate
  BEFORE INSERT ON public.feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.check_feedback_duplicate();

-- 4. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON public.feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_timestamp();

-- 5. RLS policies
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON public.feedback_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON public.feedback_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
  ON public.feedback_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND profile_type = 'admin'
    )
  );

-- Admins can update feedback (status, notes)
CREATE POLICY "Admins can update feedback"
  ON public.feedback_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND profile_type = 'admin'
    )
  );

-- 6. Storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
) ON CONFLICT (id) DO NOTHING;

-- 7. Storage RLS: users can upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Storage RLS: anyone can read feedback screenshots (public bucket)
CREATE POLICY "Public read access for feedback screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-screenshots');

-- 9. Storage RLS: users can delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. RPC for submitting feedback (validates and inserts in one call)
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_category text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'medium',
  p_screenshot_url text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_os text DEFAULT NULL,
  p_current_page text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate category
  IF p_category NOT IN ('bug_report','feature_request','improvement','question','general','other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Validate priority
  IF p_priority NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  -- Validate lengths
  IF length(trim(p_subject)) < 3 OR length(p_subject) > 200 THEN
    RAISE EXCEPTION 'Subject must be 3-200 characters';
  END IF;

  IF length(trim(p_description)) < 10 OR length(p_description) > 5000 THEN
    RAISE EXCEPTION 'Description must be 10-5000 characters';
  END IF;

  INSERT INTO public.feedback_reports (user_id, category, subject, description, priority, screenshot_url, browser, os, current_page)
  VALUES (v_user_id, p_category, p_subject, p_description, p_priority, p_screenshot_url, p_browser, p_os, p_current_page)
  RETURNING to_jsonb(feedback_reports.*) INTO v_result;

  RETURN v_result;
END;
$$;

-- 11. RPC for admin to update status
CREATE OR REPLACE FUNCTION public.update_feedback_status(
  p_feedback_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profile_type = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('new','in_review','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.feedback_reports
  SET status = p_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_feedback_id
  RETURNING to_jsonb(feedback_reports.*) INTO v_result;

  RETURN v_result;
END;
$$;
