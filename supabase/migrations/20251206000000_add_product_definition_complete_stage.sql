-- Add "Product Definition Complete" launch stage if it doesn't exist
-- This stage should come before all other stages (sort_order 0)
-- Duration: 31 days

DO $$
BEGIN
    -- Check if "Product Definition Complete" stage already exists
    IF NOT EXISTS (
        SELECT 1 FROM public.launch_stages WHERE name = 'Product Definition Complete'
    ) THEN
        -- Check if sort_order 0 is available
        IF NOT EXISTS (
            SELECT 1 FROM public.launch_stages WHERE sort_order = 0
        ) THEN
            -- Insert with sort_order 0
            INSERT INTO public.launch_stages (name, sort_order, duration_days, details)
            VALUES (
                'Product Definition Complete',
                0,
                31,
                'Product definition is complete and ready for GTM planning.'
            );
        ELSE
            -- If sort_order 0 is taken, find the minimum sort_order and insert before it
            -- This shouldn't happen in normal circumstances, but handle it gracefully
            INSERT INTO public.launch_stages (name, sort_order, duration_days, details)
            SELECT 
                'Product Definition Complete',
                COALESCE(MIN(sort_order) - 1, 0),
                31,
                'Product definition is complete and ready for GTM planning.'
            FROM public.launch_stages;
        END IF;
    END IF;
END $$;

