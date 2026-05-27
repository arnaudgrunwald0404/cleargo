import { TextEncoder } from "util";

Object.assign(global, { TextEncoder });

jest.mock("crypto", () => ({
  randomBytes: jest.fn(() => Buffer.from("a".repeat(32))),
}));

jest.mock("jose", () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue("mock-portal-jwt"),
  })),
}));

import {
  buildAhaIdeasPortalJwtCallbackUrl,
  createAhaIdeasPortalJwt,
  splitAhaPortalName,
} from "../ideasPortalJwt";

describe("ideasPortalJwt", () => {
  const originalSecret = process.env.AHA_IDEAS_WIDGET_JWT_SECRET;

  beforeAll(() => {
    process.env.AHA_IDEAS_WIDGET_JWT_SECRET = "test-portal-jwt-secret";
  });

  afterAll(() => {
    process.env.AHA_IDEAS_WIDGET_JWT_SECRET = originalSecret;
  });

  it("splits profile names for portal JWT", () => {
    expect(
      splitAhaPortalName({
        email: "kim@clearcompany.com",
        first_name: "Kim",
        last_name: "Edwards",
      })
    ).toEqual({ first_name: "Kim", last_name: "Edwards" });

    expect(
      splitAhaPortalName({
        email: "jane@example.com",
        name: "Jane Q Public",
      })
    ).toEqual({ first_name: "Jane", last_name: "Q Public" });
  });

  it("creates a portal JWT", async () => {
    const token = await createAhaIdeasPortalJwt({
      id: "uuid-1",
      email: "kim@clearcompany.com",
      first_name: "Kim",
      last_name: "Edwards",
    });
    expect(token).toBe("mock-portal-jwt");
  });

  it("builds callback URL with return_to and state", () => {
    const url = buildAhaIdeasPortalJwtCallbackUrl("https://cleargo.ideas.aha.io/", "tok", {
      returnTo: "/ideas/CLEARGO-I-1",
      state: "abc",
    });
    expect(url).toContain("https://cleargo.ideas.aha.io/auth/jwt/callback");
    expect(url).toContain("jwt=tok");
    expect(url).toContain("return_to=%2Fideas%2FCLEARGO-I-1");
    expect(url).toContain("state=abc");
  });

  it("uses identity-provider callback URL when configured", () => {
    process.env.AHA_IDEAS_PORTAL_JWT_CALLBACK_URL =
      "https://clearco.identity.aha.io/idea_portal_provider/jwt_callback/7644603561049421993";
    const url = buildAhaIdeasPortalJwtCallbackUrl("https://cleargo.ideas.aha.io/", "tok", {
      returnTo: "/",
    });
    expect(url).toContain("clearco.identity.aha.io/idea_portal_provider/jwt_callback");
    expect(url).not.toContain("cleargo.ideas.aha.io/auth/jwt/callback");
    delete process.env.AHA_IDEAS_PORTAL_JWT_CALLBACK_URL;
  });
});
