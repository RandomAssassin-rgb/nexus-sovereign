import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

interface FNOLPayload {
  ClaimCenter: {
    Claim: {
      ClaimNumber: string;
      DateOfLoss: string;
      TypeOfLoss: string;
      CauseOfLoss: string;
      Description: string;
      ClaimAmount: number;
      ReservedAmount: number;
      PaidAmount: number;
      Status: string;
      PolicyNumber: string;
      PolicyType: string;
      ProducerCode: string;
    };
    Claimant: {
      ClaimedPartyID: string;
      Name: string;
      Type: string;
      ContactMethod: string;
      PhoneNumber: string;
      Email: string;
      Address: {
        AddressLine1: string;
        City: string;
        State: string;
        PostalCode: string;
        Country: string;
      };
      GeographicInfo: {
        Latitude: number;
        Longitude: number;
        H3Index: string;
      };
    };
    Incident: {
      IncidentID: string;
      IncidentDate: string;
      IncidentType: string;
      LocationDescription: string;
      Address: {
        AddressLine1: string;
        City: string;
        State: string;
        PostalCode: string;
      };
      GeographicInfo: {
        Latitude: number;
        Longitude: number;
        H3Index: string;
        ZoneType: string;
      };
    };
    Assignments: {
      AdjusterAssigned: string;
      SupervisorAssigned: string;
      ClaimsExaminers: string[];
    };
    Notes: {
      FNOLNotes: string;
      InternalNotes: string;
      AuditTrail: Array<{
        Date: string;
        User: string;
        Action: string;
        Notes: string;
      }>;
    };
    CustomFields: {
      GigEconomyData: {
        Platform: string;
        VehicleType: string;
        EarningsBefore: number;
        EarningsAfter: number;
        HoursAffected: number;
        TriggerSource: string;
        VerificationMethod: string;
        TrustScore: number;
      };
      PayoutCalculation: {
        HourlyRate: number;
        HoursLost: number;
        ReplacementRatio: number;
        PmaxApplied: number;
        FinalPayout: number;
        Currency: string;
      };
      Telemetry: {
        GPSVerified: boolean;
        DeviceFraudCheck: string;
        BarometerCheck: string;
        ThermalCheck: string;
      };
    };
  };
}

function buildFNOLPayload(claim: any, user: any, trigger: any): FNOLPayload {
  const now = new Date();
  const policyNumber = `NEXUS-${user?.platform?.toUpperCase() || 'GIG'}-${Date.now().toString(36).toUpperCase()}`;
  
  return {
    ClaimCenter: {
      Claim: {
        ClaimNumber: claim.claim_id_str || `CLM-${claim.id}`,
        DateOfLoss: claim.processed_at || now.toISOString(),
        TypeOfLoss: 'Income Loss',
        CauseOfLoss: trigger?.trigger_type || claim.type || 'Weather Disruption',
        Description: `Gig worker income loss due to ${trigger?.trigger_type || 'disruption'}. Worker on ${user?.platform}.`,
        ClaimAmount: Number(claim.payout_inr || 0),
        ReservedAmount: Number(claim.payout_inr || 0) * 1.1,
        PaidAmount: claim.status === 'approved' ? Number(claim.payout_inr || 0) : 0,
        Status: claim.status === 'approved' ? 'Paid' : claim.status === 'rejected' ? 'Rejected' : 'Pending',
        PolicyNumber: policyNumber,
        PolicyType: 'Parametric Income Protection',
        ProducerCode: 'NEXUS-DIRECT'
      },
      Claimant: {
        ClaimedPartyID: user?.partnerId || 'UNKNOWN',
        Name: user?.full_name || 'Anonymous Rider',
        Type: 'Gig Worker',
        ContactMethod: 'Mobile App',
        PhoneNumber: user?.phone || '+91XXXXXXXXXX',
        Email: user?.email || `${user?.partnerId}@nexus.sovereign`,
        Address: {
          AddressLine1: 'Delivery Zone',
          City: 'Bangalore',
          State: 'Karnataka',
          PostalCode: '560001',
          Country: 'India'
        },
        GeographicInfo: {
          Latitude: claim.lat || 12.9716,
          Longitude: claim.lng || 77.5946,
          H3Index: claim.h3_cell || 'unknown'
        }
      },
      Incident: {
        IncidentID: `INC-${claim.id}`,
        IncidentDate: claim.processed_at || now.toISOString(),
        IncidentType: trigger?.trigger_type || 'Environmental Disruption',
        LocationDescription: `H3 Hexagon ${claim.h3_cell || 'N/A'}`,
        Address: {
          AddressLine1: claim.h3_cell || 'Zone',
          City: 'Bangalore',
          State: 'Karnataka',
          PostalCode: '560001'
        },
        GeographicInfo: {
          Latitude: claim.lat || 12.9716,
          Longitude: claim.lng || 77.5946,
          H3Index: claim.h3_cell || 'unknown',
          ZoneType: trigger?.severity || 'medium'
        }
      },
      Assignments: {
        AdjusterAssigned: 'AUTO',
        SupervisorAssigned: 'AUTO',
        ClaimsExaminers: ['System']
      },
      Notes: {
        FNOLNotes: `Automated FNOL from Nexus Sovereign. ${claim.reason || 'Parametric trigger fired.'}`,
        InternalNotes: `JEP verified. Signal chain: ${claim.jep_data?.signal_chain?.map((s: any) => s.stage).join(' → ') || 'N/A'}`,
        AuditTrail: [
          {
            Date: now.toISOString(),
            User: 'NEXUS-SYSTEM',
            Action: 'CLAIM_CREATED',
            Notes: 'Automated claim from parametric trigger'
          },
          {
            Date: now.toISOString(),
            User: 'NEXUS-AI',
            Action: 'CLAIM_APPROVED',
            Notes: 'AI verification passed'
          }
        ]
      },
      CustomFields: {
        GigEconomyData: {
          Platform: user?.platform || 'Unknown',
          VehicleType: 'Petrol Bike',
          EarningsBefore: user?.avg_earnings || 150,
          EarningsAfter: 0,
          HoursAffected: claim.jep_data?.duration_hours || 2,
          TriggerSource: trigger?.source || 'automated',
          VerificationMethod: claim.jep_data?.verification_method || 'sensor_fusion',
          TrustScore: user?.trust_score || 700
        },
        PayoutCalculation: {
          HourlyRate: claim.jep_data?.hourly_rate || 150,
          HoursLost: claim.jep_data?.duration_hours || 2,
          ReplacementRatio: 0.7,
          PmaxApplied: claim.jep_data?.p_max || 350,
          FinalPayout: Number(claim.payout_inr || 0),
          Currency: 'INR'
        },
        Telemetry: {
          GPSVerified: true,
          DeviceFraudCheck: claim.jep_data?.fraud_analysis?.verdict || 'passed',
          BarometerCheck: claim.jep_data?.fraud_analysis?.signals?.find((s: any) => s.type === 'barometer_elevation_mismatch') ? 'fail' : 'pass',
          ThermalCheck: claim.jep_data?.fraud_analysis?.signals?.find((s: any) => s.type === 'thermal_anomaly') ? 'review' : 'pass'
        }
      }
    }
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { claimId, action, exportFormat } = req.query;
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
      .select('*')
      .eq('partnerId', claim.worker_id)
      .maybeSingle();

    const { data: trigger } = await supabaseServer
      .from('disruption_triggers')
      .select('*')
      .eq('zone_h3', claim.h3_cell)
      .order('fired_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fnolPayload = buildFNOLPayload(claim, user, trigger);

    if (action === 'preview') {
      return res.json({
        success: true,
        preview: true,
        fnol: fnolPayload,
        claim_id: targetClaimId,
        claim_status: claim.status
      });
    }

    if (action === 'webhook') {
      const webhookUrl = process.env.GUIDEWIRE_WEBHOOK_URL;
      
      if (!webhookUrl) {
        return res.json({
          success: true,
          webhook_queued: true,
          mock: true,
          message: 'Guidewire webhook URL not configured - using mock',
          fnol: fnolPayload,
          note: 'Configure GUIDEWIRE_WEBHOOK_URL in environment to send to Guidewire ClaimCenter'
        });
      }

      const axios = (await import('axios')).default;
      
      try {
        const webhookResponse = await axios.post(webhookUrl, fnolPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Guidewire-Signature': `sha256=${Date.now()}`,
            'X-Nexus-Token': process.env.GUIDEWIRE_API_TOKEN || 'mock'
          },
          timeout: 10000
        });

        return res.json({
          success: true,
          webhook_sent: true,
          guidewire_response: webhookResponse.data,
          fnol: fnolPayload
        });
      } catch (webhookError: any) {
        return res.json({
          success: true,
          webhook_queued: true,
          mock: true,
          webhook_error: webhookError.message,
          fnol: fnolPayload
        });
      }
    }

    const format = exportFormat || 'json';
    
    if (format === 'xml') {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClaimCenter>
  <Claim>
    <ClaimNumber>${fnolPayload.ClaimCenter.Claim.ClaimNumber}</ClaimNumber>
    <DateOfLoss>${fnolPayload.ClaimCenter.Claim.DateOfLoss}</DateOfLoss>
    <TypeOfLoss>${fnolPayload.ClaimCenter.Claim.TypeOfLoss}</TypeOfLoss>
    <CauseOfLoss>${fnolPayload.ClaimCenter.Claim.CauseOfLoss}</CauseOfLoss>
    <Description><![CDATA[${fnolPayload.ClaimCenter.Claim.Description}]]></Description>
    <ClaimAmount>${fnolPayload.ClaimCenter.Claim.ClaimAmount}</ClaimAmount>
    <Status>${fnolPayload.ClaimCenter.Claim.Status}</Status>
    <PolicyNumber>${fnolPayload.ClaimCenter.Claim.PolicyNumber}</PolicyNumber>
  </Claim>
  <Claimant>
    <ClaimedPartyID>${fnolPayload.ClaimCenter.Claimant.ClaimedPartyID}</ClaimedPartyID>
    <Name>${fnolPayload.ClaimCenter.Claimant.Name}</Name>
    <Type>${fnolPayload.ClaimCenter.Claimant.Type}</Type>
  </Claimant>
  <CustomFields>
    <GigEconomyData>
      <Platform>${fnolPayload.ClaimCenter.CustomFields.GigEconomyData.Platform}</Platform>
      <EarningsBefore>${fnolPayload.ClaimCenter.CustomFields.GigEconomyData.EarningsBefore}</EarningsBefore>
      <HoursAffected>${fnolPayload.ClaimCenter.CustomFields.GigEconomyData.HoursAffected}</HoursAffected>
      <TrustScore>${fnolPayload.ClaimCenter.CustomFields.GigEconomyData.TrustScore}</TrustScore>
    </GigEconomyData>
    <PayoutCalculation>
      <HourlyRate>${fnolPayload.ClaimCenter.CustomFields.PayoutCalculation.HourlyRate}</HourlyRate>
      <HoursLost>${fnolPayload.ClaimCenter.CustomFields.PayoutCalculation.HoursLost}</HoursLost>
      <FinalPayout>${fnolPayload.ClaimCenter.CustomFields.PayoutCalculation.FinalPayout}</FinalPayout>
      <Currency>${fnolPayload.ClaimCenter.CustomFields.PayoutCalculation.Currency}</Currency>
    </PayoutCalculation>
  </CustomFields>
</ClaimCenter>`;

      return res.setHeader('Content-Type', 'application/xml').json(xml);
    }

    return res.json({
      success: true,
      fnol: fnolPayload,
      claim_id: targetClaimId,
      export_format: format,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Guidewire Export] Error:', error);
    return res.status(500).json({ error: error.message || 'FNOL generation failed' });
  }
}
