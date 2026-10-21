import { describe, it, expect } from "vitest";
import { normalizePhMobile } from "./phone";

describe("normalizePhMobile", () => {
  it("accepts 09xxxxxxxxx", () => expect(normalizePhMobile("09171234567")).toBe("09171234567"));
  it("accepts +639xxxxxxxxx", () => expect(normalizePhMobile("+639171234567")).toBe("09171234567"));
  it("accepts spaced/dashed formatting", () =>
    expect(normalizePhMobile("0917 123-4567")).toBe("09171234567"));
  it("accepts 639xxxxxxxxx", () => expect(normalizePhMobile("639171234567")).toBe("09171234567"));
  it("rejects empty", () => expect(normalizePhMobile("")).toBeNull());
  it("rejects too short", () => expect(normalizePhMobile("0917123456")).toBeNull());
  it("rejects landline-style", () => expect(normalizePhMobile("0322345678")).toBeNull());
  it("rejects letters", () => expect(normalizePhMobile("0917abc4567")).toBeNull());
});
