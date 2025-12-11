-- Remove unique constraint from sort_order in launch_stages
ALTER TABLE public.launch_stages DROP CONSTRAINT IF EXISTS launch_stages_sort_order_key;
