/**
 * Role types for success measurement feature
 * Maps to existing roles in the system:
 * - ADMIN -> PRODUCT_OPS, CPO, SUPERADMIN
 * - PM -> PM
 * - PMM -> PMM
 * - CS -> SUPPORT_LEAD
 * - EXEC -> CPO
 */
export type Role = 'ADMIN' | 'PM' | 'PMM' | 'CS' | 'EXEC';

