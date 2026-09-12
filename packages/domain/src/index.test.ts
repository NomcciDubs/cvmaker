import { describe, expect, it } from "vitest";

import { aiDailyLimitFor, createBlankCv } from "./index";

describe("domain policies", () => {
  it("preserves the existing role-based AI limits", () => {
    expect(aiDailyLimitFor("USER")).toBe(1);
    expect(aiDailyLimitFor("FRIEND")).toBe(10);
    expect(aiDailyLimitFor("SUPER_ADMIN")).toBeNull();
  });

  it("creates independent blank CV aggregates", () => {
    const first = createBlankCv();
    const second = createBlankCv();

    first.personal_info.links?.push({ label: "Portfolio", url: "https://example.com" });
    expect(second.personal_info.links).toEqual([]);
  });
});
