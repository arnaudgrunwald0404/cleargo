/**
 * Extract Jira epic key from AHA integrations field
 * This is a pure function that can be used on both client and server
 */
export function extractJiraEpicKeyFromIntegrations(integrations: any): string | null {
    if (!integrations) {
        return null;
    }
    
    try {
        // Handle array of integration objects (common Aha API format)
        if (Array.isArray(integrations)) {
            for (const integration of integrations) {
                if (typeof integration === 'object' && integration !== null) {
                    // Check common fields where Jira epic key might be stored
                    const possibleKeys = [
                        integration.reference,
                        integration.reference_num,
                        integration.key,
                        integration.id,
                        integration.name,
                        integration.external_id,
                        integration.external_reference
                    ];
                    
                    for (const keyValue of possibleKeys) {
                        if (typeof keyValue === 'string') {
                            // Prefer canonical ISSUEKEY format (case-insensitive)
                            const keyMatch = keyValue.match(/[A-Z][A-Z0-9]+-\d+/i);
                            if (keyMatch?.[0]) {
                                return keyMatch[0].toUpperCase();
                            }
                            
                            // Fallback: handle "DEV 25525" or "DEV_25525" formats
                            const spacedMatch = keyValue.match(/([A-Z][A-Z0-9]+)[\s_]+(\d+)/i);
                            if (spacedMatch?.[1] && spacedMatch?.[2]) {
                                return `${spacedMatch[1].toUpperCase()}-${spacedMatch[2]}`;
                            }
                        }
                    }
                    
                    // If no direct match, stringify the object and search
                    const asString = JSON.stringify(integration);
                    const keyMatch = asString.match(/[A-Z][A-Z0-9]+-\d+/i);
                    if (keyMatch?.[0]) {
                        return keyMatch[0].toUpperCase();
                    }
                }
            }
            return null;
        }
        
        // Handle object format
        if (typeof integrations === 'object') {
            const possibleKeys = [
                integrations.reference,
                integrations.reference_num,
                integrations.key,
                integrations.id,
                integrations.name,
                integrations.external_id,
                integrations.external_reference
            ];
            
            for (const keyValue of possibleKeys) {
                if (typeof keyValue === 'string') {
                    const keyMatch = keyValue.match(/[A-Z][A-Z0-9]+-\d+/i);
                    if (keyMatch?.[0]) {
                        return keyMatch[0].toUpperCase();
                    }
                    
                    const spacedMatch = keyValue.match(/([A-Z][A-Z0-9]+)[\s_]+(\d+)/i);
                    if (spacedMatch?.[1] && spacedMatch?.[2]) {
                        return `${spacedMatch[1].toUpperCase()}-${spacedMatch[2]}`;
                    }
                }
            }
        }
        
        // Handle string format
        const asString = typeof integrations === 'string' ? integrations : JSON.stringify(integrations);

        // Prefer canonical ISSUEKEY format (case-insensitive)
        const keyMatch = asString.match(/[A-Z][A-Z0-9]+-\d+/i);
        if (keyMatch?.[0]) {
            return keyMatch[0].toUpperCase();
        }

        // Fallback: handle "DEV 25525" or "DEV_25525" formats
        const spacedMatch = asString.match(/([A-Z][A-Z0-9]+)[\s_]+(\d+)/i);
        if (spacedMatch?.[1] && spacedMatch?.[2]) {
            return `${spacedMatch[1].toUpperCase()}-${spacedMatch[2]}`;
        }

        return null;
    } catch (error) {
        console.warn('Error extracting Jira epic key from integrations:', error);
        return null;
    }
}
