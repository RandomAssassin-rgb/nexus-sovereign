import { supabaseServer } from './supabase';

/**
 * Ensures a skeleton user exists in the 'users' table.
 * Standardizes the enrollment logic used by various endpoints.
 */
export async function ensureSkeletonUser(partnerId: string, initialBalance: number = 0, fullName: string | null = null) {
  const { data: user, error: fetchError } = await supabaseServer
    .from("users")
    .select("*")
    .eq("partnerId", partnerId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (user) {
    // If we have a new name, update it
    if (fullName && (!user.full_name || user.full_name === 'Anonymous Rider')) {
       await supabaseServer.from("users").update({ full_name: fullName }).eq("partnerId", partnerId);
       return { ...user, full_name: fullName };
    }
    return user;
  }

  console.log(`[Auth] Creating skeleton user for ${partnerId} (${fullName || 'Anonymous'})...`);
  const phone = `+91-${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
  const aadhaarNumber = `6372-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const payloads = [
    {
      partnerId,
      full_name: fullName || 'Anonymous Rider',
      phone,
      platform: "Blinkit",
      aadhaar_number: aadhaarNumber,
      balance: initialBalance,
      auth_method: 'phone',
      biometric_status: 'pending',
      trust_score: 842,
      avatar_url: null,
      payout_upi: `${Math.floor(Math.random() * 9000000000 + 1000000000)}@ybl`
    },
    {
      partnerId,
      phone,
      platform: "Blinkit",
      password: null,
      faceDescriptor: null,
      faceImage: null,
      aadhaarVerified: false,
      created_at: new Date().toISOString(),
      premium_until: null,
    }
  ];

  let lastError: any = null;

  for (const payload of payloads) {
    const { data: newUser, error: createError } = await supabaseServer
      .from("users")
      .insert([payload])
      .select()
      .single();

    if (!createError) {
      return newUser;
    }

    lastError = createError;
  }

  console.error(`[Auth] Failed to create skeleton user: ${lastError?.message}`);
  throw lastError;
}
