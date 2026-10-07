import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/send-otp-email",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { email, token } = await request.json();
      if (email && token) {
        await ctx.runAction(internal.email.sendOtpEmail, { email, token });
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Missing parameters", { status: 400 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(message, { status: 500 });
    }
  }),
});

export default http;
