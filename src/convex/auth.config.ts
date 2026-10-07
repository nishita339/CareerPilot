import type { AuthConfig } from "convex/server";

export default {
  providers: [
    // Convex Auth provider for CareerPilot sign-in.
    // Self-issues JWTs validated via OIDC discovery at
    // `${domain}/.well-known/openid-configuration`, served by
    // auth.addHttpRoutes() in convex/http.ts.
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
