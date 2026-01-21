import { SignJWT, jwtVerify, JWTPayload, generateKeyPair, importPKCS8, importJWK, decodeJwt } from "jose";

const getSecret = () => {
  const secret = process.env.MAGIC_LINK_SECRET;
  if (!secret) throw new Error("MAGIC_LINK_SECRET not set");
  return new TextEncoder().encode(secret);
};

export async function createToken(payload: JWTPayload, expiresIn: string | number) {
  const secret = getSecret();
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken<T = JWTPayload>(token: string) {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret);
  return payload as T;
}

/**
 * Decode JWT token without verification (useful for extracting email from expired tokens)
 * WARNING: This does not verify the token signature - only use when verification has already failed
 */
export function decodeTokenUnsafe<T = JWTPayload>(token: string): T | null {
  try {
    const decoded = decodeJwt(token);
    return decoded as T;
  } catch (error) {
    return null;
  }
}
