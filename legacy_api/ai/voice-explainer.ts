import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

interface PayoutExplanation {
  claimId: string;
  amount: number;
  hourlyRate: number;
  hoursLost: number;
  reason: string;
  triggerType: string;
}

const HINDI_TEMPLATES = {
  rain: [
    "Bhaiya, kal {location} mein {hours} ghante ki heavy rain thi. Aapka average ₹{rate}/hr hai, isliye ₹{amount} aapke UPI mein bhej diye gaye hain.",
    "Dada, aaj malik ke area mein baarish hui. Aap ₹{rate} per hour kamate ho, to ₹{amount} payout kiya gaya.",
    "Boss, {hours} ghante barish ke karan aap kaam nahi kar paye. Aapke ₹{rate}/hr rate pe ₹{amount} bhej diya."
  ],
  flood: [
    "Bhaiya, kal {location} mein flood ho gaya. Do ghante tak road block tha. ₹{amount} aapke account mein.",
    "Malik, area mein flood aa gaya. Aapke ₹{rate}/hr rate pe, ₹{amount} bhej diya."
  ],
  aqi: [
    "Bhaiya, aaj Delhi mein bahut pollution thi (AQI {aqi}). Government ne baat banayi. ₹{amount} aapko milte hain.",
    "Malik, GRAP Stage 4 active hai. Non-electric vehicles allowed nahi. ₹{amount} lockout compensation ke liye."
  ],
  civic: [
    "Bhaiya, {location} mein police ne road block kar diya. 20 minute tak traffic stuck raha. ₹{amount} bhej diya.",
    "Dada, local strike ke karan aap kaam nahi kar paye. ₹{amount} aapke liye."
  ],
  default: [
    "Bhaiya, aapke area mein disruption hua. Aapke ₹{rate}/hr rate pe ₹{amount} payout kiya gaya.",
    "Malik, claim verify ho gaya. ₹{amount} aapke wallet mein transfer ho gaya."
  ]
};

const HINDI_AQI_LEVELS = {
  good: "acha",
  moderate: "thik-thak",
  poor: "kamzor",
  very_poor: "bahut kamzor",
  severe: "khatarnak",
  hazardous: "jeevan ke liye危险"
};

function determineHindiTemplate(triggerType: string): string[] {
  const type = triggerType.toLowerCase();
  
  if (type.includes('rain') || type.includes('monsoon') || type.includes('storm')) {
    return HINDI_TEMPLATES.rain;
  }
  if (type.includes('flood') || type.includes('waterlogging')) {
    return HINDI_TEMPLATES.flood;
  }
  if (type.includes('aqi') || type.includes('pollution') || type.includes('grap')) {
    return HINDI_TEMPLATES.aqi;
  }
  if (type.includes('civic') || type.includes('strike') || type.includes('blockade')) {
    return HINDI_TEMPLATES.civic;
  }
  
  return HINDI_TEMPLATES.default;
}

function generateHindiExplanation(explanation: PayoutExplanation): string {
  const hours = explanation.hoursLost;
  const rate = explanation.hourlyRate;
  const amount = explanation.amount;
  const trigger = explanation.triggerType.toLowerCase();
  
  if (trigger.includes('rain') || trigger.includes('monsoon') || trigger.includes('storm')) {
    return `Bhaiya, aapke area mein ${hours} ghante ki barish hui. Aapka average ₹${rate}/hr hai, isliye ₹${amount} aapke UPI mein bhej diye gaye hain.`;
  }
  if (trigger.includes('flood') || trigger.includes('waterlogging')) {
    return `Bhaiya, aapke area mein flood ho gaya. Road block ke karan aap kaam nahi kar paye. ₹${amount} compensate ke liye bhej diye gaye hain.`;
  }
  if (trigger.includes('aqi') || trigger.includes('pollution') || trigger.includes('grap')) {
    return `Bhaiya, aaj pollution bahut zyada hai. Government ne restrictions lagayi hain. ₹${amount} lockout compensation ke liye mile hain.`;
  }
  if (trigger.includes('civic') || trigger.includes('strike') || trigger.includes('blockade')) {
    return `Bhaiya, aapke area mein road blockade hua. Police ne road band kar diya. ₹${amount} income loss ke liye bhej diya.`;
  }
  return `Bhaiya, aapke area mein disruption hua. Aapke ₹${rate}/hr rate pe, ${hours} ghante ke liye, total ₹${amount} payout kiya gaya hai.`;
}

function generateEnglishExplanation(explanation: PayoutExplanation): string {
  const amount = explanation.amount;
  const rate = explanation.hourlyRate;
  const hours = explanation.hoursLost;
  
  return `Brother, there was a ${explanation.triggerType.replace(/_/g, ' ')} in your area for ${hours} hours. Your average earnings are ₹${rate}/hour, so ₹${amount} has been sent to your UPI. This is your payout for income loss due to ${explanation.reason}.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { claimId, language, format } = req.query;
    const bodyClaimId = req.body?.claimId;
    const targetClaimId = claimId || bodyClaimId;

    if (!targetClaimId) {
      return res.status(400).json({ error: 'Missing claimId' });
    }

    const { data: claim, error: claimError } = await supabaseServer
      .from('claims')
      .select('*')
      .eq('claim_id_str', targetClaimId)
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const { data: user } = await supabaseServer
      .from('users')
      .select('full_name, platform')
      .eq('partnerId', claim.worker_id)
      .maybeSingle();

    const explanation: PayoutExplanation = {
      claimId: targetClaimId as string,
      amount: Number(claim.payout_inr || 0),
      hourlyRate: claim.jepData?.hourly_rate || 150,
      hoursLost: claim.jepData?.duration_hours || 2,
      reason: claim.reason || claim.type || 'Disruption',
      triggerType: claim.type || 'weather_disruption'
    };

    const lang = (language as string) || 'hi';
    const outputFormat = (format as string) || 'text';

    let spokenText: string;
    let fullScript: string;

    if (lang === 'hi' || lang === 'hinglish') {
      spokenText = generateHindiExplanation(explanation);
      fullScript = `Hindi: ${spokenText}\n\nEnglish: ${generateEnglishExplanation(explanation)}`;
    } else {
      spokenText = generateEnglishExplanation(explanation);
      fullScript = spokenText;
    }

    if (outputFormat === 'ssml') {
      const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang === 'hi' ? 'hi-IN' : 'en-IN'}">
  <voice name="${lang === 'hi' ? 'hi-IN-Wavenet-A' : 'en-IN-Wavenet-A'}">
    <prosody rate="0.9" pitch="0st">
      ${spokenText}
    </prosody>
  </voice>
</speak>`;
      
      return res.setHeader('Content-Type', 'application/xml').json(ssml);
    }

    if (outputFormat === 'audio') {
      return res.json({
        success: true,
        message: 'Audio generation requires ElevenLabs/Azure TTS integration',
        text: spokenText,
        ssml: `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang === 'hi' ? 'hi-IN' : 'en-IN'}">
  <voice name="${lang === 'hi' ? 'hi-IN-Wavenet-A' : 'en-IN-Wavenet-A'}">
    ${spokenText}
  </voice>
</speak>`,
        tts_provider: 'Configure ELEVENLABS_API_KEY or AZURE_SPEECH_KEY for audio'
      });
    }

    return res.json({
      success: true,
      claim_id: targetClaimId,
      language: lang,
      text: spokenText,
      full_script: fullScript,
      explanation: {
        hourly_rate: explanation.hourlyRate,
        hours_lost: explanation.hoursLost,
        total_payout: explanation.amount,
        reason: explanation.reason
      },
      generated_at: new Date().toISOString(),
      note: 'Hindi voice explanation for payout transparency'
    });

  } catch (error: any) {
    console.error('[Voice AI] Error:', error);
    return res.status(500).json({ error: error.message || 'Voice generation failed' });
  }
}
