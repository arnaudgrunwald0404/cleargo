export function getEpicDisplayName(epic: { name: string; aha_fields?: Record<string, any> | null }): string {
    if (epic.aha_fields && typeof epic.aha_fields === 'object') {
        const cf = (epic.aha_fields as any).custom_fields;
        if (cf && typeof cf === 'object') {
            const gtmName = cf.gtm_name;
            if (gtmName && typeof gtmName === 'string' && gtmName.trim()) {
                return gtmName.trim();
            }
        }
    }
    return epic.name;
}
