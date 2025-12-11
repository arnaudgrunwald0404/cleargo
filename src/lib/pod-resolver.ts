import { getSettings } from "./settings-db";

const POD_PM_PLACEHOLDER = "[name of pod's product manager]";

/**
 * Resolves the decision owner email for a criterion based on pod mapping.
 * If the criterion has the pod product manager placeholder, resolves it using the pod from the launch.
 * Otherwise, returns the stored email.
 */
export async function resolveDecisionOwnerEmail(
    criterionEmail: string | null | undefined,
    pod: string | null | undefined
): Promise<string | null> {
    if (!criterionEmail) {
        return null;
    }

    // If it's not the placeholder, return as-is
    if (criterionEmail !== POD_PM_PLACEHOLDER && !criterionEmail.toLowerCase().includes("pod")) {
        return criterionEmail;
    }

    // If it's the placeholder but no pod is provided, return null
    if (!pod) {
        return null;
    }

    // Resolve using pod mapping from settings
    const settings = await getSettings();
    const mapping = settings.pod_product_manager_mapping || {};
    
    return mapping[pod] || null;
}








