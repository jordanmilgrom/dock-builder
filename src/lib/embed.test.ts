import { describe, expect, it } from "vitest";
import { buildEmbedLoader, embedIframeUrl, embedSnippet, isAllowedOrigin } from "@/lib/embed";

const ORIGIN = "https://app.com";

describe("embed loader (§5.7)", () => {
  it("is deterministic for a given origin", () => {
    expect(buildEmbedLoader(ORIGIN)).toBe(buildEmbedLoader(ORIGIN));
  });

  it("embeds the app origin and points the iframe at /embed?tenant", () => {
    const js = buildEmbedLoader(ORIGIN);
    expect(js).toContain(ORIGIN);
    expect(js).toContain("/embed?tenant=");
    expect(js).toContain("data-tenant");
    // Never touches host cookies.
    expect(js).not.toContain("document.cookie");
  });

  it("stays well under the 8 KB ceiling", () => {
    expect(Buffer.byteLength(buildEmbedLoader(ORIGIN), "utf8")).toBeLessThan(8192);
  });

  it("iframe URL carries the tenant slug (encoded)", () => {
    expect(embedIframeUrl(ORIGIN, "acme-docks")).toBe("https://app.com/embed?tenant=acme-docks");
    expect(embedIframeUrl(ORIGIN, "a b")).toContain("tenant=a%20b");
  });

  it("postMessage origin allow-list accepts only the app origin", () => {
    expect(isAllowedOrigin(ORIGIN, ORIGIN)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", ORIGIN)).toBe(false);
    expect(isAllowedOrigin("http://app.com", ORIGIN)).toBe(false); // scheme differs
  });

  it("snippet is the documented async script tag", () => {
    const snip = embedSnippet(ORIGIN, "acme-docks");
    expect(snip).toContain(`src="${ORIGIN}/embed.js"`);
    expect(snip).toContain(`data-tenant="acme-docks"`);
    expect(snip).toContain("async");
  });
});
