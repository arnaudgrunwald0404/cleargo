// AUTH DISABLED: Mock superadmin user
export function getMockSuperAdmin() {
    return {
        id: 'mock-superadmin-id',
        email: 'agrunwald@clearcompany.com',
        user_metadata: {},
        app_metadata: {},
    };
}

export function getMockSuperAdminProfile() {
    return {
        id: 'mock-superadmin-id',
        email: 'agrunwald@clearcompany.com',
        name: 'Arnaud Grunwald',
        roles: ['SUPERADMIN', 'CPO', 'PRODUCT_OPS'],
        first_name: 'Arnaud',
        last_name: 'Grunwald',
        avatar_url: null,
    };
}

