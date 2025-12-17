// AUTH DISABLED: Mock superadmin user
export function getMockSuperAdmin() {
  return {
    id: 'mock-superadmin-id',
    email: 'agrunwald@clearcompany.com',
    user_metadata: {},
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    phone: undefined,
    phone_confirmed_at: undefined,
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    role: 'authenticated',
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
