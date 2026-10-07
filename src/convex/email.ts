"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

export const sendOtpEmail = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
  },
  handler: async (_ctx, { email, token }) => {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "nishita.singh539@gmail.com",
        pass: "tcqtjncenljzcylr",
      },
    });

    await transporter.sendMail({
      from: '"CareerPilot" <nishita.singh539@gmail.com>',
      to: email,
      subject: "CareerPilot — Your Verification Code",
      text: `Your CareerPilot verification code is: ${token}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #111827; margin-top: 0;">CareerPilot Verification Code</h2>
          <p style="color: #4b5563; font-size: 14px;">Here is your 6-digit verification code to sign in to CareerPilot:</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; font-family: monospace;">${token}</span>
          </div>
          <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">This code will expire in 15 minutes. If you did not request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    console.log(`[CareerPilot] Email successfully sent to ${email}`);
  },
});
