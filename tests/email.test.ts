import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const { sendEmail } = await import("@/lib/email");
const mail = { to: "ops@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

beforeEach(() => {
  vi.unstubAllEnvs();
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("CONTACT_SMTP_HOST", "smtp.example.com");
  vi.stubEnv("CONTACT_SMTP_USER", "mailer@example.com");
  vi.stubEnv("CONTACT_SMTP_PASS", "s3cret");
  vi.stubEnv("CONTACT_SMTP_PORT", "");
  vi.stubEnv("CONTACT_SMTP_SECURE", "");
  vi.stubEnv("CONTACT_FROM_EMAIL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("sendEmail over SMTP (D17)", () => {
  it("sends through SMTP when RESEND_API_KEY is unset, without touching the Resend API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail(mail)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ops@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>", from: "PhotoDrive <mailer@example.com>" }),
    );
  });

  it("uses STARTTLS on 587 by default, with credentials and short timeouts", async () => {
    await sendEmail(mail);
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "mailer@example.com", pass: "s3cret" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  });

  it("honours port, secure and the from address from the environment", async () => {
    vi.stubEnv("CONTACT_SMTP_PORT", "465");
    vi.stubEnv("CONTACT_SMTP_SECURE", "true");
    vi.stubEnv("CONTACT_FROM_EMAIL", "PhotoDrive <hello@example.com>");
    await sendEmail({ ...mail, replyTo: "support@example.com" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "PhotoDrive <hello@example.com>", replyTo: "support@example.com" }));
  });

  it("returns false (never throws) when SMTP delivery fails, and does not log the password", async () => {
    sendMail.mockRejectedValue(new Error("connect ETIMEDOUT"));
    expect(await sendEmail(mail)).toBe(false);
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("s3cret");
  });

  it("returns false without trying anything when SMTP is not configured", async () => {
    vi.stubEnv("CONTACT_SMTP_HOST", "");
    expect(await sendEmail(mail)).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
