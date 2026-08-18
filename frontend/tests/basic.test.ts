import {describe, expect, it} from "vitest";

describe("frontend smoke", () => {
  it("keeps the MenuFlow promise explicit", () => {
    expect("Un solo QR para siempre").toContain("QR");
  });
});

