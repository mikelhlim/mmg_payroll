// One-time bootstrap of the initial admin user.
//
//   npm run seed:admin
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL,
// and SEED_ADMIN_PASSWORD from .env.local (loaded via node --env-file). The
// admin is created with role=admin and must_change_password=true, so they are
// forced to set a new password on first login.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!email || !password) {
  console.error("Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const appMetadata = { role: "admin", must_change_password: true };
const userMetadata = { full_name: "Administrator" };

// Look for an existing account with this email (createUser errors if it exists).
const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    app_metadata: { ...existing.app_metadata, ...appMetadata },
    user_metadata: { ...existing.user_metadata, ...userMetadata },
  });
  if (error) {
    console.error("Failed to update existing admin:", error.message);
    process.exit(1);
  }
  console.log(`✓ Updated existing admin ${email} (must change password on next login).`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  if (error) {
    console.error("Failed to create admin:", error.message);
    process.exit(1);
  }
  console.log(`✓ Created admin ${email} (must change password on first login).`);
}
