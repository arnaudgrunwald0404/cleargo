import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases, getReleaseEpics } from '@/lib/aha/client';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { toDateOnlyString } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releases.manage', rules);
        if (!ok) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Parse request body to get start_date filter
        const body = await req.json().catch(() => ({}));
        const startDate = body.start_date || null;

        console.log('🔄 Starting release sync from Aha API...');
        if (startDate) {
            console.log(`📅 Filtering releases with launch dates >= ${startDate}`);
        }

        // Fetch all releases from Aha (paginated)
        let allReleases: any[] = [];
        let page = 1;
        const perPage = 50;
        let hasMore = true;

        while (hasMore) {
            const response = await getReleases({ per_page: perPage, page });
            const releases = response.releases || [];
            allReleases = allReleases.concat(releases);
            
            hasMore = releases.length === perPage;
            page++;
        }

        console.log(`📦 Found ${allReleases.length} total releases in Aha`);

        // Helper function to extract "Releases date (external)" from standard fields or custom_fields
        const getExternalReleaseDate = (release: any): string | null => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:58',message:'getExternalReleaseDate called',data:{releaseName:release.name,releaseId:release.id,hasCustomFields:!!release.custom_fields,customFieldsType:typeof release.custom_fields,isArray:Array.isArray(release.custom_fields),releasesDateExternal:release.releases_date_external,releaseDateExternal:release.release_date_external},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            let externalDateValue: string | null = null;
            
            // First, check standard fields (these are direct properties on the release object)
            const standardDateFields = [
                'releases_date_external',
                'release_date_external',
                'external_release_date',
                'releases_date_internal',
                'release_date_internal',
                'internal_release_date'
            ];
            
            for (const fieldName of standardDateFields) {
                if (release[fieldName]) {
                    externalDateValue = release[fieldName];
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:72',message:'Found external date in standard field',data:{releaseName:release.name,fieldName,externalDateValue},timestamp:Date.now(),runId:'debug1',hypothesisId:'H4'})}).catch(()=>{});
                    // #endregion
                    return externalDateValue;
                }
            }
            
            // If not found in standard fields, check custom_fields
            if (!release.custom_fields) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:82',message:'No custom_fields found',data:{releaseName:release.name},timestamp:Date.now(),runId:'debug1',hypothesisId:'H4'})}).catch(()=>{});
                // #endregion
                return null;
            }
            
            // Handle array format (Aha API typically returns custom_fields as array)
            if (Array.isArray(release.custom_fields)) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:68',message:'custom_fields is array',data:{releaseName:release.name,arrayLength:release.custom_fields.length,firstFewFields:release.custom_fields.slice(0,5).map((cf:any)=>({key:cf.key,name:cf.name,value:cf.value,valueType:typeof cf.value}))},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                // #endregion
                
                // Look for "Releases date (external)" field
                const externalDateField = release.custom_fields.find((cf: any) => {
                    const key = cf.key?.toLowerCase() || '';
                    const name = cf.name?.toLowerCase() || '';
                    const matches = (key.includes('releases date (external)') || 
                            name.includes('releases date (external)') ||
                            key.includes('release date (external)') ||
                            name.includes('release date (external)'));
                    
                    // #region agent log
                    if (key.includes('date') || name.includes('date') || key.includes('external') || name.includes('external')) {
                        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:76',message:'Checking date field',data:{releaseName:release.name,key,name,matches,value:cf.value,valueType:typeof cf.value},timestamp:Date.now(),runId:'debug1',hypothesisId:'H2'})}).catch(()=>{});
                    }
                    // #endregion
                    
                    return matches;
                });
                
                if (externalDateField && externalDateField.value) {
                    externalDateValue = externalDateField.value;
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:88',message:'Found external date in array',data:{releaseName:release.name,externalDateValue,fieldKey:externalDateField.key,fieldName:externalDateField.name},timestamp:Date.now(),runId:'debug1',hypothesisId:'H2'})}).catch(()=>{});
                    // #endregion
                } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:92',message:'No external date field found in array',data:{releaseName:release.name,allFieldNames:release.custom_fields.map((cf:any)=>cf.name),allFieldKeys:release.custom_fields.map((cf:any)=>cf.key)},timestamp:Date.now(),runId:'debug1',hypothesisId:'H2'})}).catch(()=>{});
                    // #endregion
                }
            } else if (typeof release.custom_fields === 'object') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:97',message:'custom_fields is object',data:{releaseName:release.name,objectKeys:Object.keys(release.custom_fields),firstFewEntries:Object.entries(release.custom_fields).slice(0,5).map(([k,v]:[string,any])=>({key:k,value:v,valueType:typeof v}))},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                // #endregion
                
                // Handle object format
                for (const [key, value] of Object.entries(release.custom_fields)) {
                    const field = value as any;
                    const fieldKey = key.toLowerCase();
                    const fieldName = (field?.name || '').toLowerCase();
                    
                    if ((fieldKey.includes('releases date (external)') || 
                         fieldName.includes('releases date (external)') ||
                         fieldKey.includes('release date (external)') ||
                         fieldName.includes('release date (external)')) && field?.value) {
                        externalDateValue = field.value;
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:108',message:'Found external date in object',data:{releaseName:release.name,externalDateValue,fieldKey:key,fieldName:field?.name,fieldValue:field?.value},timestamp:Date.now(),runId:'debug1',hypothesisId:'H2'})}).catch(()=>{});
                        // #endregion
                        break;
                    }
                }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:118',message:'getExternalReleaseDate result',data:{releaseName:release.name,externalDateValue,hasValue:!!externalDateValue},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            return externalDateValue;
        };

        // Filter releases that contain epics
        const releasesWithEpics: Array<{ id: string; name: string; start_date?: string; end_date?: string; external_date?: string | null }> = [];
        
        for (const release of allReleases) {
            try {
                // Check if release has epics (just check first page to see if any exist)
                const epicsResponse = await getReleaseEpics(release.id, { per_page: 1, page: 1 });
                const epics = epicsResponse.epics || [];
                
                if (epics.length > 0) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:102',message:'Release object structure',data:{releaseName:release.name,allKeys:Object.keys(release),hasReleasesDateExternal:!!release.releases_date_external,hasReleaseDateExternal:!!release.release_date_external,releasesDateExternal:release.releases_date_external,releaseDateExternal:release.release_date_external},timestamp:Date.now(),runId:'debug1',hypothesisId:'H4'})}).catch(()=>{});
                    // #endregion
                    
                    const externalDate = getExternalReleaseDate(release);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:125',message:'Release with epics found',data:{releaseName:release.name,externalDate,startDate:release.start_date,endDate:release.end_date},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                    // #endregion
                    releasesWithEpics.push({
                        id: release.id,
                        name: release.name,
                        start_date: release.start_date,
                        end_date: release.end_date,
                        external_date: externalDate,
                    });
                    
                    if (externalDate) {
                        console.log(`📅 Release "${release.name}": Found external date: ${externalDate}`);
                    }
                }
            } catch (error) {
                console.warn(`Failed to check epics for release ${release.name}:`, error);
                // Continue with other releases
            }
        }

        console.log(`✅ Found ${releasesWithEpics.length} releases with epics`);

        // Upsert ALL releases with epics into release_schedule table (including those without dates)
        let synced = 0;
        let errors = 0;
        const releasesWithoutDates: Array<{ name: string; id: string }> = [];

        // Filter releases by start_date if provided
        let releasesToSync = releasesWithEpics;
        if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:203',message:'Applying start_date filter',data:{startDate,startDateObj:startDateObj.toISOString(),totalReleases:releasesWithEpics.length},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            releasesToSync = releasesWithEpics.filter((release) => {
                // Priority: external_date > end_date > start_date
                const launchDate = release.external_date || release.end_date || release.start_date || null;
                
                // #region agent log
                if (release.name.includes('2026.2')) {
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:210',message:'Filtering Release 2026.2',data:{releaseName:release.name,launchDate,externalDate:release.external_date,endDate:release.end_date,startDate:release.start_date,startDateFilter:startDate},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                }
                // #endregion
                
                // Include releases without dates (they can still be synced)
                if (!launchDate) {
                    return true;
                }
                
                // Parse and compare dates
                try {
                    const releaseDateObj = new Date(launchDate);
                    releaseDateObj.setHours(0, 0, 0, 0);
                    const passesFilter = releaseDateObj >= startDateObj;
                    
                    // #region agent log
                    if (release.name.includes('2026.2')) {
                        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:220',message:'Release 2026.2 filter result',data:{releaseName:release.name,launchDate,releaseDateObj:releaseDateObj.toISOString(),startDateObj:startDateObj.toISOString(),passesFilter},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                    }
                    // #endregion
                    
                    return passesFilter;
                } catch (error) {
                    console.warn(`⚠️ Invalid date format for release "${release.name}": ${launchDate}`);
                    return true; // Include releases with invalid dates
                }
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:227',message:'Filter complete',data:{startDate,filteredCount:releasesToSync.length,totalCount:releasesWithEpics.length,filteredReleaseNames:releasesToSync.map(r=>r.name)},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            
            console.log(`📅 Filtered to ${releasesToSync.length} releases with launch dates >= ${startDate} (from ${releasesWithEpics.length} total)`);
        }

        for (const release of releasesToSync) {
            try {
                // Priority: Use "Releases date (external)" if available, otherwise end_date, otherwise start_date, otherwise null
                const launchDate = release.external_date || release.end_date || release.start_date || null;
                
                if (release.external_date) {
                    console.log(`✅ Using external date for "${release.name}": ${release.external_date}`);
                } else if (release.end_date) {
                    console.log(`📅 Using end_date for "${release.name}": ${release.end_date}`);
                } else if (release.start_date) {
                    console.log(`📅 Using start_date for "${release.name}": ${release.start_date}`);
                }

                // Track releases without dates
                if (!launchDate) {
                    releasesWithoutDates.push({
                        name: release.name,
                        id: release.id,
                    });
                    console.warn(`⚠️ Release "${release.name}" has no date in Aha`);
                }

                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:252',message:'About to upsert release',data:{releaseName:release.name,launchDate,externalDate:release.external_date,endDate:release.end_date,startDate:release.start_date},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                // #endregion
                const normalizedLaunchDate = toDateOnlyString(launchDate) ?? launchDate;
                const { error } = await supabase
                    .from('release_schedule')
                    .upsert(
                        {
                            release_name: release.name,
                            launch_date: normalizedLaunchDate,
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'release_name',
                        }
                    );

                if (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:265',message:'Error syncing release',data:{releaseName:release.name,error:error.message,errorCode:error.code},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error syncing release ${release.name}:`, error);
                    errors++;
                } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-releases/route.ts:269',message:'Successfully synced release',data:{releaseName:release.name,launchDate},timestamp:Date.now(),runId:'debug1',hypothesisId:'H1'})}).catch(()=>{});
                    // #endregion
                    synced++;
                }
            } catch (error) {
                console.error(`Error processing release ${release.name}:`, error);
                errors++;
            }
        }

        const withoutDatesCount = releasesWithoutDates.length;
        const message = withoutDatesCount > 0
            ? `Synced ${synced} releases (${withoutDatesCount} without dates, ${errors} errors)`
            : `Synced ${synced} releases (${errors} errors)`;

        return NextResponse.json({
            success: true,
            message,
            total_releases: allReleases.length,
            releases_with_epics: releasesWithEpics.length,
            synced,
            releases_without_dates: releasesWithoutDates,
            errors,
        });
    } catch (error: any) {
        console.error('Error syncing releases:', error);
        return NextResponse.json(
            { error: 'Failed to sync releases', details: error.message },
            { status: 500 }
        );
    }
}

