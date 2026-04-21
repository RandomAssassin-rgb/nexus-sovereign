import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { estimatePremium } from '../_lib/fallbacks';
import axios from 'axios';

interface WeeklyForecast {
  date: string;
  aqi: number;
  rain_mm: number;
  temp_c: number;
  conditions: string[];
}

interface DynamicPremium {
  weekly_premium: number;
  base_premium: number;
  weather_adj: number;
  aqi_adj: number;
  traffic_adj: number;
  trust_discount: number;
  hustler_bonus: number;
  valid_from: string;
  valid_until: string;
  risk_factors: string[];
  city_forecast: WeeklyForecast[];
}

async function fetch7DayForecast(lat: number, lon: number): Promise<WeeklyForecast[]> {
  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.VITE_OPENWEATHER_API_KEY;
  
  if (!apiKey || apiKey.includes('placeholder')) {
    console.warn('[Premium] No OpenWeather API key - returning minimal forecast');
    return [];
  }

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );
    
    const dailyMap = new Map<string, WeeklyForecast>();
    
    response.data?.list?.forEach((item: any) => {
      const date = item.dt_txt.split(' ')[0];
      const existing = dailyMap.get(date) || {
        date,
        aqi: 0,
        rain_mm: 0,
        temp_c: item.main.temp,
        conditions: []
      };
      
      existing.rain_mm += item.rain?.['3h'] || 0;
      existing.conditions.push(item.weather?.[0]?.main || 'Unknown');
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, existing);
      }
    });

    return Array.from(dailyMap.values()).slice(0, 7);
  } catch {
    return [];
  }
}

function calculateDynamicPremium(
  basePremium: number,
  forecast: WeeklyForecast[],
  trustScore: number,
  claimHistory: number,
  platformActivity: number
): DynamicPremium {
  let weatherAdj = 0;
  let aqiAdj = 0;
  let trafficAdj = 0;
  const riskFactors: string[] = [];

  const rainDays = forecast.filter(f => f.rain_mm > 10).length;
  const monsoonProbability = rainDays / 7;
  
  if (monsoonProbability > 0.6) {
    weatherAdj = basePremium * 0.4;
    riskFactors.push('Monsoon flood risk high (80%+)');
  } else if (monsoonProbability > 0.3) {
    weatherAdj = basePremium * 0.2;
    riskFactors.push('Moderate rain expected');
  }

  const avgAqi = forecast.reduce((sum, f) => sum + f.aqi, 0) / 7;
  if (avgAqi > 300) {
    aqiAdj = basePremium * 0.25;
    riskFactors.push('Severe AQI - GRAP restrictions likely');
  } else if (avgAqi > 200) {
    aqiAdj = basePremium * 0.15;
    riskFactors.push('Poor air quality expected');
  }

  const hotDays = forecast.filter(f => f.temp_c > 38).length;
  if (hotDays >= 3) {
    trafficAdj = basePremium * 0.1;
    riskFactors.push('Heatwave conditions - reduced orders');
  }

  const totalAdj = weatherAdj + aqiAdj + trafficAdj;
  const adjustedPremium = Math.round(basePremium + totalAdj);

  let trustDiscount = 0;
  let hustlerBonus = 0;

  if (trustScore > 800) {
    trustDiscount = adjustedPremium * 0.2;
    riskFactors.push('High trust score applied (-20%)');
  } else if (trustScore > 600) {
    trustDiscount = adjustedPremium * 0.1;
    riskFactors.push('Good trust score applied (-10%)');
  }

  if (claimHistory < 2 && platformActivity > 100) {
    hustlerBonus = -(adjustedPremium * 0.15);
    riskFactors.push('Proof of Hustle applied (-15%)');
  } else if (claimHistory > 5) {
    const penalty = adjustedPremium * 0.2;
    riskFactors.push(`Moral hazard penalty applied (+${Math.round(penalty)})`);
  }

  const finalPremium = Math.max(12, Math.min(99, Math.round(adjustedPremium - trustDiscount + hustlerBonus)));

  const now = new Date();
  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    weekly_premium: finalPremium,
    base_premium: basePremium,
    weather_adj: Math.round(weatherAdj),
    aqi_adj: Math.round(aqiAdj),
    traffic_adj: Math.round(trafficAdj),
    trust_discount: Math.round(trustDiscount),
    hustler_bonus: Math.round(hustlerBonus),
    valid_from: validFrom,
    valid_until: validUntil,
    risk_factors: riskFactors,
    city_forecast: forecast
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, zone_h3, lat, lon, platform, weekly_only } = req.body || {};

    let zoneRisk = 0.15;
    if (zone_h3) {
      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { count, error } = await supabaseServer
          .from('disruption_triggers')
          .select('*', { count: 'exact', head: true })
          .eq('zone_h3', zone_h3)
          .gte('fired_at', ninetyDaysAgo.toISOString());

        if (!error && typeof count === 'number') {
          zoneRisk = Math.min(1, count / 20);
        }
      } catch {
        zoneRisk = 0.15;
      }
    }

    const baseQuote = estimatePremium({ ...(req.body || {}), zoneRisk });
    const basePremium = baseQuote.weekly_premium || 58;

    let trustScore = 700;
    let claimHistory = 0;
    let platformActivity = 50;

    if (partnerId) {
      const { data: user } = await supabaseServer
        .from('users')
        .select('trust_score, platform')
        .eq('partnerId', partnerId)
        .maybeSingle();

      if (user) {
        trustScore = user.trust_score || 700;
      }

      const { count: claimsCount } = await supabaseServer
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('worker_id', partnerId);

      claimHistory = claimsCount || 0;

      const { data: txnData } = await supabaseServer
        .from('transactions')
        .select('amount')
        .eq('worker_id', partnerId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      platformActivity = txnData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 50;
    }

    const latVal = Number(lat) || 12.9716;
    const lonVal = Number(lon) || 77.5946;
    const forecast = await fetch7DayForecast(latVal, lonVal);

    const dynamicQuote = calculateDynamicPremium(
      basePremium,
      forecast,
      trustScore,
      claimHistory,
      platformActivity
    );

    if (weekly_only) {
      return res.json({
        success: true,
        type: 'dynamic_weekly',
        premium: dynamicQuote,
        quote: baseQuote
      });
    }

    return res.json({
      success: true,
      type: 'dynamic_weekly',
      premium: dynamicQuote,
      quote: baseQuote,
      summary: {
        generated_at: new Date().toISOString(),
        effective_period: '7 days',
        next_update: dynamicQuote.valid_until,
       影响因素: {
          weather_forecast: forecast.length > 0,
          trust_scoring: !!partnerId,
          claim_history: claimHistory,
          platform_activity: platformActivity
        }
      }
    });

  } catch (error: any) {
    console.error('[Dynamic Premium] Error:', error);
    const fallback = estimatePremium(req.body || {});
    return res.json({
      success: true,
      type: 'dynamic_weekly_fallback',
      premium: fallback,
      warning: 'Using fallback calculation'
    });
  }
}
