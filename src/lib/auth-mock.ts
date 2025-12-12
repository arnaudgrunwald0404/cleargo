// AUTH DISABLED: Mock superadmin user
export function getMockSuperAdmin() {
    return {
        id: 'mock-superadmin-id',
        email: 'superadmin@cleargo.app',
        user_metadata: {},
        app_metadata: {},
    };
}

export function getMockSuperAdminProfile() {
    return {
        id: 'mock-superadmin-id',
        email: 'superadmin@cleargo.app',
        name: 'Super Admin',
        roles: ['SUPERADMIN', 'CPO', 'PRODUCT_OPS'],
        first_name: 'Super',
        last_name: 'Admin',
        avatar_url: null,
    };
}

