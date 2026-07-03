import { describe, expect, it } from "vitest";

import { assertSafeHttpsUrl, isSafeHttpsUrl, SafeFetchError } from "@/lib/safeFetch";

describe("assertSafeHttpsUrl", () => {
  it("accepts a valid public HTTPS URL", () => {
    const url = assertSafeHttpsUrl("https://example.edu/about");

    expect(url.hostname).toBe("example.edu");
    expect(url.protocol).toBe("https:");
  });

  it("rejects non-HTTPS protocols", () => {
    expect(() => assertSafeHttpsUrl("http://example.edu")).toThrow(SafeFetchError);
    expect(() => assertSafeHttpsUrl("http://example.edu")).toThrow(
      "Only HTTPS URLs are allowed."
    );
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSafeHttpsUrl("not-a-url")).toThrow(SafeFetchError);
    expect(() => assertSafeHttpsUrl("not-a-url")).toThrow("Invalid URL.");
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => assertSafeHttpsUrl("https://user:pass@example.edu")).toThrow(
      SafeFetchError
    );
    expect(() => assertSafeHttpsUrl("https://user:pass@example.edu")).toThrow(
      "URL credentials are not allowed."
    );
  });

  it("rejects localhost hostnames", () => {
    expect(() => assertSafeHttpsUrl("https://localhost/path")).toThrow(
      "Localhost URLs are not allowed."
    );
    expect(() => assertSafeHttpsUrl("https://app.localhost/path")).toThrow(
      "Localhost URLs are not allowed."
    );
  });

  it("rejects private and link-local IPv4 addresses", () => {
    const blocked = [
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://192.168.0.10",
      "https://172.16.0.1",
      "https://169.254.169.254"
    ];

    for (const url of blocked) {
      expect(() => assertSafeHttpsUrl(url)).toThrow(
        "Private or link-local IP addresses are not allowed."
      );
    }
  });

  it("rejects loopback IPv6", () => {
    expect(() => assertSafeHttpsUrl("https://[::1]/")).toThrow(
      "Private or link-local IP addresses are not allowed."
    );
  });
});

describe("isSafeHttpsUrl", () => {
  it("returns true for safe URLs", () => {
    expect(isSafeHttpsUrl("https://university.edu")).toBe(true);
  });

  it("returns false for unsafe URLs without throwing", () => {
    expect(isSafeHttpsUrl("http://university.edu")).toBe(false);
    expect(isSafeHttpsUrl("https://127.0.0.1")).toBe(false);
  });
});
