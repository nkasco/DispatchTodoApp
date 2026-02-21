import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "member" | "admin";
      isFrozen: boolean;
      showAdminQuickAccess: boolean;
      assistantEnabled: boolean;
      timeZone: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: "member" | "admin";
    isFrozen?: boolean;
    showAdminQuickAccess?: boolean;
    assistantEnabled?: boolean;
    timeZone?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "member" | "admin";
    isFrozen?: boolean;
    showAdminQuickAccess?: boolean;
    assistantEnabled?: boolean;
    timeZone?: string | null;
    provider?: string;
  }
}
