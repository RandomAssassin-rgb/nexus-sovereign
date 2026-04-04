import React from 'react';
import { Share2 } from 'lucide-react';

interface ViralShareButtonProps {
  claimId: string;
  amount: number;
}

export default function ViralShareButton({ claimId, amount }: ViralShareButtonProps) {
  const handleShare = async () => {
    const shareData = {
      title: 'Nexus Sovereign Payout',
      text: `Just got my income protected with Nexus Sovereign! Claim ${claimId} approved for ₹${amount}. #NexusSovereign #IncomeProtection`,
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback for browsers that don't support Web Share API
        window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`, '_blank');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center justify-center gap-2 w-full bg-emerald-600 text-white font-semibold py-4 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20"
    >
      <Share2 size={20} />
      Share My Win
    </button>
  );
}
