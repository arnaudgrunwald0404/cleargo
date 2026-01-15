/**
 * Manual mock for jwt module
 */
export async function verifyToken<T = any>(token: string): Promise<T> {
  return {} as T;
}

export async function createToken(payload: any, expiresIn: string | number): Promise<string> {
  return 'mock-token';
}
