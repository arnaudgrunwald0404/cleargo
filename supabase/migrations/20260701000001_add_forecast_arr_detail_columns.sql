-- Add detailed ARR columns to epic_forecast_link
ALTER TABLE public.epic_forecast_link
  ADD COLUMN IF NOT EXISTS arr_incremental_2027_usd integer,
  ADD COLUMN IF NOT EXISTS arr_incremental_2028_usd integer,
  ADD COLUMN IF NOT EXISTS arr_churn_reduction_2027_usd integer,
  ADD COLUMN IF NOT EXISTS arr_churn_reduction_2028_usd integer;

COMMENT ON COLUMN public.epic_forecast_link.arr_incremental_2027_usd IS 'Incremental ARR for 2027 in whole USD';
COMMENT ON COLUMN public.epic_forecast_link.arr_incremental_2028_usd IS 'Incremental ARR for 2028 in whole USD';
COMMENT ON COLUMN public.epic_forecast_link.arr_churn_reduction_2027_usd IS 'Churn reduction ARR for 2027 in whole USD';
COMMENT ON COLUMN public.epic_forecast_link.arr_churn_reduction_2028_usd IS 'Churn reduction ARR for 2028 in whole USD';
