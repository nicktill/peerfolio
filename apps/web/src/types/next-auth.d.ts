import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    /** `admin` only picks what the nav shows; admin routes authorize on the server. */
    user: { id: string; admin?: boolean } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
  }
}
