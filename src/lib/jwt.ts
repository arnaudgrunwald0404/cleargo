import { SignJWT, jwtVerify, JWTPayload, generateKeyPair, importPKCS8, importJWK } from "jose";

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
