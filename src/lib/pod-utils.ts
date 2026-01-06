import { getSettings } from "./settings-db";

/**
 * Sorts an array of pod names based on the saved order in settings.
 * Pods not in the saved order will appear at the end, sorted alphabetically.
 * 
 * @param pods - Array of pod names to sort
 * @returns Sorted array of pod names
 */
export async function sortPodsByOrder(pods: string[]): Promise<string[]> {
  const settings = await getSettings();
  const podOrder = settings.pod_order || [];
  
  const ordered: string[] = [];
  const unordered: string[] = [];
  
  // First, add pods in the saved order
  podOrder.forEach(pod => {
    if (pods.includes(pod)) {
      ordered.push(pod);
    }
  });
  
  // Then add any pods not in the order (sorted alphabetically)
  pods.forEach(pod => {
    if (!podOrder.includes(pod)) {
      unordered.push(pod);
    }
  });
  
  unordered.sort((a, b) => a.localeCompare(b));
  
  return [...ordered, ...unordered];
}

/**
 * Client-side version that takes settings directly (for use in components)
 * 
 * @param pods - Array of pod names to sort
 * @param podOrder - Ordered array of pod names from settings
 * @returns Sorted array of pod names
 */
export function sortPodsByOrderClient(pods: string[], podOrder: string[] = []): string[] {
  const ordered: string[] = [];
  const unordered: string[] = [];
  
  // First, add pods in the saved order
  podOrder.forEach(pod => {
    if (pods.includes(pod)) {
      ordered.push(pod);
    }
  });
  
  // Then add any pods not in the order (sorted alphabetically)
  pods.forEach(pod => {
    if (!podOrder.includes(pod)) {
      unordered.push(pod);
    }
  });
  
  unordered.sort((a, b) => a.localeCompare(b));
  
  return [...ordered, ...unordered];
}

