-- Add year-specific ARR upside columns to epic_forecast_link
ALTER TABLE public.epic_forecast_link
  ADD COLUMN IF NOT EXISTS arr_upside_2026_usd integer,
  ADD COLUMN IF NOT EXISTS arr_upside_2027_usd integer;

COMMENT ON COLUMN public.epic_forecast_link.arr_upside_2026_usd IS 'ARR upside for calendar year 2026 in whole USD';
COMMENT ON COLUMN public.epic_forecast_link.arr_upside_2027_usd IS 'ARR upside for calendar year 2027 in whole USD';
