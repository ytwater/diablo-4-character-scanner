import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";

import type { DB } from "@acme/db/client";
import * as schema from "@acme/db/schema";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  db: DB;
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  googleClientId: string;
  googleClientSecret: string;
  trustedOrigins?: string[];
  extraPlugins?: TExtraPlugins;

  mailgunApiKey: string | undefined;
  mailgunDomain: string | undefined;
}) {
  const config = {
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema,
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        if (!options.mailgunApiKey || !options.mailgunDomain) {
          console.error(
            "Cannot send reset password email: Mailgun is not configured",
          );
          return;
        }
        const body = new URLSearchParams({
          from: `Diablo 4 Scanner <noreply@${options.mailgunDomain}>`,
          to: user.email,
          subject: "Reset your password",
          text: `Click the link below to reset your password:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
        }).toString();
        const res = await fetch(
          `https://api.mailgun.net/v3/${options.mailgunDomain}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`api:${options.mailgunApiKey}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          },
        );
        if (!res.ok) {
          console.error(
            "Failed to send reset password email",
            res.status,
            await res.text(),
          );
        }
      },
    },
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
        redirectURI: `${options.productionUrl}/api/auth/callback/google`,
      },
    },
    trustedOrigins: ["d4scanner://", ...(options.trustedOrigins ?? [])],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
