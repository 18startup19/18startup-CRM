// Pure types — safe to import from client components. Do not add any runtime
// imports here that touch `next/headers`, `cookies`, or other server-only APIs.

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "member";
}
