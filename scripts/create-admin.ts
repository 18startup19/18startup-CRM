// One-off script to create the first admin user.
// Usage:  npm run create-admin
// Reads email + password from stdin (or --email / --password flags).

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function ask(prompt: string, mask = false): Promise<string> {
  const rl = createInterface({ input, output, terminal: !mask });
  const answer = await rl.question(prompt);
  rl.close();
  return answer.trim();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const name = arg("--name") ?? (await ask("Admin name: "));
  const email = (arg("--email") ?? (await ask("Admin email: "))).toLowerCase();
  const password = arg("--password") ?? (await ask("Admin password: ", true));

  if (!name || !email || password.length < 8) {
    console.error("Name, email, and 8+ char password are required.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const { error } = await sb.from("users").insert({
    name,
    email,
    password_hash: hash,
    role: "admin",
    permissions: {},
  });

  if (error) {
    console.error("Failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ Admin created: ${email}`);
}

main();
