import { describe, expect, it } from "vitest";
import { localDevLoginEmail, localDevSignInEmail } from "../../src/lib/local-dev-login";

const open = {
  nodeEnv: "development",
  enabled: "1",
  email: "alessa@nizek.com",
};

describe("localDevLoginEmail", () => {
  it("allows this machine and private LAN addresses", () => {
    expect(localDevLoginEmail({ ...open, host: "localhost:3001" })).toBe("alessa@nizek.com");
    expect(localDevLoginEmail({ ...open, host: "10.0.111.165:3001" })).toBe("alessa@nizek.com");
    expect(localDevLoginEmail({ ...open, host: "192.168.1.20:3001" })).toBe("alessa@nizek.com");
  });

  it("stays closed in production, without the flag, and on a public host", () => {
    expect(localDevLoginEmail({ ...open, nodeEnv: "production", host: "localhost:3001" })).toBeNull();
    expect(localDevLoginEmail({ ...open, enabled: undefined, host: "localhost:3001" })).toBeNull();
    expect(
      localDevLoginEmail({ ...open, host: "nizek-staging.up.railway.app" }),
    ).toBeNull();
    expect(localDevLoginEmail({ ...open, email: "", host: "localhost:3001" })).toBeNull();
  });
});

describe("localDevSignInEmail", () => {
  it("uses the configured account unless another address is asked for", () => {
    expect(localDevSignInEmail("alessa@nizek.com", undefined)).toBe("alessa@nizek.com");
    expect(localDevSignInEmail("alessa@nizek.com", " Other@nizek.com ")).toBe("other@nizek.com");
  });

  it("refuses a request when the local gate is closed", () => {
    expect(localDevSignInEmail(null, "other@nizek.com")).toBeNull();
    expect(localDevSignInEmail("alessa@nizek.com", "not-an-email")).toBeNull();
  });
});
