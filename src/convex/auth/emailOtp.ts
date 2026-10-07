import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes

  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },

  async sendVerificationRequest({ identifier: email, token }) {
    console.log(`\n========================================\n  CareerPilot OTP for ${email}: ${token}\n========================================\n`);

    try {
      const siteUrl = process.env.CONVEX_SITE_URL || "https://hip-heron-124.convex.site";
      const res = await fetch(`${siteUrl}/send-otp-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      if (res.ok) {
        console.log(`[CareerPilot] Email OTP sent via Gmail SMTP to ${email}`);
      } else {
        console.warn(`[CareerPilot] send-otp-email returned ${res.status}`);
      }
    } catch (err) {
      console.error("[CareerPilot] Failed to deliver OTP email:", err);
    }
  },
});
