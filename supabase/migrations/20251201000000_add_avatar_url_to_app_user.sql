-- Add avatar_url column to app_user table
ALTER TABLE public.app_user
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
