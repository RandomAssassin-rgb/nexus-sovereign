import React, { useState, useEffect } from 'react';

interface EmbeddedWidgetProps {
  partnerId?: string;
  platform?: 'zepto' | 'swiggy' | 'zomato' | 'blinkit' | 'custom';
  partnerName?: string;
  theme?: 'light' | 'dark';
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  callbackUrl?: string;
  embedToken?: string;
}

interface PremiumQuote {
  weekly_premium: number;
  discounted_premium: number;
  discount_percent: number;
  valid_until: string;
}

const PLATFORM_COLORS = {
  zepto: '#2B2B2B',
  swiggy: '#FC801D',
  zomato: '#E74C3C',
  blinkit: '#FFD600',
  custom: '#d19a2f'
};

export default function EmbeddedInsuranceWidget({
  partnerId,
  platform = 'custom',
  partnerName = 'Delivery Partner',
  theme = 'dark',
  position = 'bottom-right',
  callbackUrl,
  embedToken
}: EmbeddedWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [quote, setQuote] = useState<PremiumQuote | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryColor = PLATFORM_COLORS[platform] || PLATFORM_COLORS.custom;
  const isDark = theme === 'dark';

  useEffect(() => {
    fetchQuote();
  }, [partnerId]);

  const fetchQuote = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const storedPartner = partnerId || localStorage.getItem('partner_id');
      
      if (!storedPartner && !embedToken) {
        setQuote({
          weekly_premium: 45,
          discounted_premium: 35,
          discount_percent: 22,
          valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `/api/ml/calculate-premium?weekly_only=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Partner-Id': storedPartner || '',
            'X-Embed-Token': embedToken || ''
          },
          body: JSON.stringify({
            partnerId: storedPartner,
            platform,
            weekly_only: true
          })
        }
      );

      const data = await response.json();
      
      if (data.premium) {
        setQuote(data.premium);
      }
    } catch (err) {
      console.error('Quote fetch error:', err);
      setError('Unable to load quote');
      setQuote({
        weekly_premium: 45,
        discounted_premium: 35,
        discount_percent: 22,
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!partnerId) {
      if (callbackUrl) {
        window.location.href = callbackUrl;
      } else {
        window.location.href = '/coverage-plans';
      }
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/premium/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId,
          planType: 'standard'
        })
      });

      const data = await response.json();
      if (data.success) {
        setIsEnrolled(true);
      }
    } catch {
      setError('Enrollment failed');
    } finally {
      setIsLoading(false);
    }
  };

  const widgetStyles: React.CSSProperties = {
    position: 'fixed',
    bottom: position.includes('bottom') ? '20px' : undefined,
    [position.includes('right') ? 'right' : 'left']: position.includes('right') || position.includes('left') ? '20px' : undefined,
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, sans-serif'
  };

  const containerStyles: React.CSSProperties = {
    width: isExpanded ? '340px' : '280px',
    background: isDark ? '#1a1a1a' : '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    border: `1px solid ${isDark ? '#333' : '#e5e5e5'}`
  };

  const headerStyles: React.CSSProperties = {
    background: primaryColor,
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer'
  };

  const contentStyles: React.CSSProperties = {
    padding: isExpanded ? '20px' : '0 20px',
    maxHeight: isExpanded ? '400px' : '0',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    opacity: isExpanded ? 1 : 0
  };

  if (position === 'inline') {
    return (
      <div style={containerStyles}>
        <div style={headerStyles} onClick={() => setIsExpanded(!isExpanded)}>
          <div style={{ color: 'white', fontWeight: 600 }}>
            🛡️ Shield My Earnings
          </div>
          <div style={{ color: 'white', fontSize: '20px' }}>
            {isExpanded ? '−' : '+'}
          </div>
        </div>
        <div style={contentStyles}>
          {renderContent()}
        </div>
      </div>
    );
  }

  return (
    <div style={widgetStyles}>
      <div style={containerStyles}>
        <div style={headerStyles} onClick={() => setIsExpanded(!isExpanded)}>
          <div style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>
            🛡️ Shield My Earnings
          </div>
          <div style={{ color: 'white', fontSize: '20px' }}>
            {isExpanded ? '−' : '+'}
          </div>
        </div>
        <div style={contentStyles}>
          {renderContent()}
        </div>
      </div>
    </div>
  );

  function renderContent() {
    if (isLoading) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: isDark ? '#888' : '#666' }}>
          Loading quote...
        </div>
      );
    }

    if (isEnrolled) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
          <div style={{ color: isDark ? '#fff' : '#333', fontWeight: 600, marginBottom: '8px' }}>
            Coverage Active!
          </div>
          <div style={{ color: isDark ? '#888' : '#666', fontSize: '14px' }}>
            Your earnings are protected for this week.
          </div>
        </div>
      );
    }

    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: 800, 
            color: isDark ? '#fff' : '#333',
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px'
          }}>
            <span style={{ fontSize: '16px', fontWeight: 500, color: isDark ? '#888' : '#666' }}>
              ₹
            </span>
            {quote?.discounted_premium || 35}
            {quote?.discount_percent ? (
              <span style={{ 
                fontSize: '12px', 
                background: '#22c55e20', 
                color: '#22c55e',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600
              }}>
                -{quote.discount_percent}%
              </span>
            ) : null}
          </div>
          <div style={{ 
            fontSize: '13px', 
            color: isDark ? '#666' : '#999',
            textDecoration: 'line-through'
          }}>
            Was ₹{quote?.weekly_premium || 45}/week
          </div>
        </div>

        <div style={{ 
          background: isDark ? '#252525' : '#f5f5f5', 
          borderRadius: '8px', 
          padding: '12px',
          marginBottom: '16px',
          fontSize: '13px',
          color: isDark ? '#aaa' : '#666'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>✅ Up to ₹350/payout</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>⚡ 90-sec settlement</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>🛡️ Zero-touch claims</span>
          </div>
        </div>

        <button
          onClick={handleEnroll}
          style={{
            width: '100%',
            padding: '14px',
            background: primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'transform 0.1s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Enable Shield - ₹{quote?.discounted_premium || 35}/week
        </button>

        <div style={{ 
          marginTop: '12px', 
          fontSize: '11px', 
          color: isDark ? '#555' : '#999',
          textAlign: 'center'
        }}>
          Powered by Nexus Sovereign + Guidewire
        </div>
      </div>
    );
  }
}
