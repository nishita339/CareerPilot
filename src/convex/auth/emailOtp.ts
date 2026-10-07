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
      const response = await fetch("https://auth.freebuff.app/send_otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4",
        },
        body: JSON.stringify({
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "CareerPilot",
        }),
      });

      if (!response.ok) {
        console.warn(`Email OTP gateway returned ${response.status}. Token is logged for verification.`);
      } else {
        console.log(`Email OTP sent successfully to ${email}`);
      }
    } catch (error) {
      console.warn("Email OTP delivery warning (gateway unreachable):", error);
      // Best-effort delivery: token is stored in database and logged above so auth is never blocked
    }
  },
});
