import { describe, expect, it } from "vitest";
import { downloadsAllowed, downloadsLocked } from "@/lib/gallery/downloads";

describe("downloadsAllowed", () => {
  it("is on by default", () => {
    expect(downloadsAllowed({})).toBe(true);
    expect(downloadsAllowed({ allowDownload: true })).toBe(true);
  });
  it("is off when the owner switched it off", () => {
    expect(downloadsAllowed({ allowDownload: false })).toBe(false);
  });
  it("a selection sent while 'switch off after sending' is on locks downloads", () => {
    expect(downloadsAllowed({ disableDownloadAfterSubmit: true, downloadsLockedAt: 1700000000000 })).toBe(false);
    expect(downloadsLocked({ disableDownloadAfterSubmit: true, downloadsLockedAt: 1 })).toBe(true);
  });
  it("the option alone locks nothing until a selection is sent", () => {
    expect(downloadsAllowed({ disableDownloadAfterSubmit: true })).toBe(true);
    expect(downloadsAllowed({ disableDownloadAfterSubmit: true, downloadsLockedAt: null })).toBe(true);
  });
  it("a stale stamp does nothing once the option is off", () => {
    expect(downloadsAllowed({ disableDownloadAfterSubmit: false, downloadsLockedAt: 5 })).toBe(true);
    expect(downloadsAllowed({ downloadsLockedAt: 5 })).toBe(true);
  });
});
