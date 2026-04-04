import { supabaseServer } from '../src/lib/supabaseServer';

async function init() {
  console.log('🚀 Initializing Supabase Infrastructure...');

  // 1. Create Avatars Bucket
  const { data: bucketData, error: bucketError } = await supabaseServer.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg']
  });

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
      console.log('✅ Bucket "avatars" already exists.');
    } else {
      console.error('❌ Error creating bucket:', bucketError.message);
    }
  } else {
    console.log('✅ Created bucket "avatars".');
  }

  // 2. Ensure basic user exists for testing (optional but good for validation)
  const testPartnerId = 'BLK-98234';
  const { data: userData, error: userError } = await supabaseServer
    .from('users')
    .upsert({ 
      partner_id: testPartnerId,
      name: 'Rahul Kumar',
      trust_score: 842,
      balance: 3450.00,
      premium_tier: 'pro',
      premium_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'partner_id' });

  if (userError) {
    console.error('❌ Error initializing test user:', userError.message);
  } else {
    console.log(`✅ Initialized/Verified user ${testPartnerId}.`);
  }

  console.log('🏁 Infrastructure check complete.');
}

init();
