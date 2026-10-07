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
    // Log the OTP code to server logs for verification & debugging
    console.log(`\n========================================\n  CareerPilot OTP for ${email}: ${token}\n========================================\n`);

    // If RESEND_API_KEY is configured, send official CareerPilot branded email
    if (process.env.RESEND_API_KEY) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "CareerPilot <onboarding@resend.dev>",
            to: [email],
            subject: "CareerPilot — Your Verification Code",
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 20px; border: 1px solid #e4e4e7; border-radius: 8px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #09090b;">CareerPilot Verification Code</h2>
              <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.5;">Enter the following 6-digit verification code to sign in to your CareerPilot account:</p>
              <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #09090b;">${token}</span>
              </div>
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">This code will expire in 15 minutes. If you did not request this code, you can safely ignore this email.</p>
            </div>`,
          }),
        });

        if (response.ok) {
          console.log(`CareerPilot OTP email delivered successfully to ${email}`);
        } else {
          console.warn(`Resend email delivery returned status ${response.status}`);
        }
      } catch (err) {
        console.warn("Email delivery network error:", err);
      }
    }
  },
});
