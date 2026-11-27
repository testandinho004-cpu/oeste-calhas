import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })],
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
  callbacks: {
    async signIn({ profile }) {
      return Boolean((profile as { email_verified?: boolean } | undefined)?.email_verified);
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const u = await db.user.upsert({
          where: { email: profile.email.toLowerCase() },
          update: { name: profile.name },
          create: { email: profile.email.toLowerCase(), name: profile.name },
        });
        token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};
