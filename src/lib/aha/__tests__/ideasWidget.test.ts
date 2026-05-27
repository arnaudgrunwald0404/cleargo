import { TextEncoder } from "util";

Object.assign(global, { TextEncoder });

jest.mock("jose", () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue("mock-jwt-token"),
  })),
}));

import {
  createAhaIdeasWidgetJwt,
  formatAhaIdeasWidgetUserName,
  getAhaIdeasWidgetAccount,
  getAhaIdeasWidgetApplicationId,
} from "../ideasWidget";

describe("ideasWidget", () => {
  const originalSecret = process.env.AHA_IDEAS_WIDGET_JWT_SECRET;

  beforeAll(() => {
    process.env.AHA_IDEAS_WIDGET_JWT_SECRET = "test-widget-jwt-secret";
  });

  afterAll(() => {
    process.env.AHA_IDEAS_WIDGET_JWT_SECRET = originalSecret;
  });

  it("formats display name from profile fields", () => {
    expect(
      formatAhaIdeasWidgetUserName({
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Doe",
      })
    ).toBe("Jane Doe");

    expect(
      formatAhaIdeasWidgetUserName({
        email: "jane@example.com",
        name: "Jane Q",
      })
    ).toBe("Jane Q");

    expect(
      formatAhaIdeasWidgetUserName({
        email: "jane@example.com",
      })
    ).toBe("jane@example.com");
  });

  it("creates a JWT via SignJWT when secret is configured", async () => {
    const token = await createAhaIdeasWidgetJwt({
      id: "user-uuid-1",
      name: "Jane Doe",
      email: "jane@example.com",
    });

    expect(token).toBe("mock-jwt-token");
  });

  it("resolves account and application id defaults", () => {
    expect(getAhaIdeasWidgetApplicationId()).toBe("6457569509733897795");
    expect(getAhaIdeasWidgetAccount()).toBeTruthy();
  });
});
