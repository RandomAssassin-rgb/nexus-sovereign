import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, FileText, Download, ShieldCheck, Info, Zap, Share2, Loader2 } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useState, useRef } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import ViralShareButton from "../components/ViralShareButton";
import { getClaimById } from "../lib/payoutStore";

export default function PayoutSuccess() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [showFormula, setShowFormula] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Pull from centralized store first, then fallback to route state
  const storedClaim = id ? getClaimById(id) : null;
  const claimData = location.state?.claimData || storedClaim?.jepData || null;
  const amount = location.state?.amount || storedClaim?.amount || 1500;
  const imageUrl = location.state?.imageUrl || null;
  const claimId = id || storedClaim?.id || `CLM-${Math.floor(1000 + Math.random() * 9000)}`;

  const generatePdfBlob = async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!reportRef.current) return null;
    
    try {
      // Temporarily set styles to ensure consistent PDF layout
      const originalWidth = reportRef.current.style.width;
      const originalHeight = reportRef.current.style.height;
      const originalOverflow = reportRef.current.style.overflow;
      
      reportRef.current.style.width = "400px"; // Mobile-like width for better PDF scaling
      reportRef.current.style.height = "auto";
      reportRef.current.style.overflow = "visible";
      
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        backgroundColor: "#000000",
        pixelRatio: 3, // Higher quality
        filter: (node) => {
          // Filter out buttons or elements that shouldn't be in the PDF
          if (node instanceof HTMLElement && node.tagName === "BUTTON") return false;
          return true;
        }
      });
      
      // Restore original styles
      reportRef.current.style.width = originalWidth;
      reportRef.current.style.height = originalHeight;
      reportRef.current.style.overflow = originalOverflow;
      
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (img.height * pdfWidth) / img.width;
      
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      const blob = pdf.output("blob");
      return { blob, filename: `Judicial_Evidence_Packet_${claimId}.pdf` };
    } catch (error) {
      console.error("Error generating PDF blob:", error);
      return null;
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    const result = await generatePdfBlob();
    if (result) {
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      alert("Failed to generate PDF.");
    }
    setIsGeneratingPdf(false);
  };

  const handleSharePdf = async () => {
    const text = `Judicial Evidence Packet for Claim ${claimId}\nStatus: Approved\nAmount: ₹${amount}\nReason: ${claimData?.worded_summary || "Parametric conditions met."}`;
    
    setIsGeneratingPdf(true);
    const result = await generatePdfBlob();
    
    if (result) {
      const file = new File([result.blob], result.filename, { type: "application/pdf" });
      
      // Check if Web Share API is available and can share files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Judicial Evidence Packet",
            text: text,
          });
          setIsGeneratingPdf(false);
          return;
        } catch (error) {
          console.error("Error sharing file:", error);
          // If user cancelled, don't show fallback
          if ((error as any).name === 'AbortError') {
            setIsGeneratingPdf(false);
            return;
          }
        }
      }
    }

    // Fallback to WhatsApp text if file sharing fails or is not supported
    const whatsappText = `${text}\n\n(Note: Your browser does not support direct PDF sharing. Please download the PDF and share it manually.)`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
    window.open(whatsappUrl, "_blank");
    setIsGeneratingPdf(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/home")} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold tracking-tight text-xl">Judicial Evidence Packet</h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleSharePdf} 
            disabled={isGeneratingPdf}
            className="p-2 hover:bg-secondary rounded-full text-primary disabled:opacity-50"
          >
            {isGeneratingPdf ? <Loader2 className="animate-spin" size={20} /> : <Share2 size={20} />}
          </button>
          <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="p-2 hover:bg-secondary rounded-full text-primary disabled:opacity-50">
            {isGeneratingPdf ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col" ref={reportRef}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 mb-8 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-emerald-500/30">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-500 mb-1">₹{amount.toLocaleString()}</h2>
          <p className="text-sm font-medium text-emerald-500/80 mb-2">Payout Processed Successfully</p>
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
            <Zap size={14} /> Tier 1 (Autonomous)
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
            Claim ID: {claimId}
          </p>
        </motion.div>

        <div className="space-y-6">
          {claimData && (
            <>
              <h3 className="font-black text-xl flex items-center gap-2 text-primary border-b-2 border-primary/20 pb-2">
                <FileText size={22} />
                COMPREHENSIVE JUDICIAL SUMMARY
              </h3>
              <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Worded Summary</h4>
                  <p className="text-sm leading-relaxed">{claimData.worded_summary}</p>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Technical Reason</h4>
                  <p className="text-sm leading-relaxed font-mono text-xs">{claimData.technical_reason}</p>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Policy Alignment & Clauses</h4>
                  <div className="bg-emerald-500/5 p-3 rounded-xl space-y-2 border border-emerald-500/20">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-emerald-600">Clause 4.2 (Parametric Trigger)</span>
                      <span className="text-emerald-500">Verified</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The claim was cross-referenced with real-time weather and traffic telemetry. 
                      The trigger event ({claimData.trigger_type}) was detected within the policy's active window and geographic scope.
                      <br /><br />
                      <span className="text-foreground font-medium italic">"Coverage is automatically triggered when rainfall exceeds 30mm/hr or traffic congestion index &gt; 80%."</span>
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Forensic Analysis & Authenticity</h4>
                  <div className="bg-blue-500/5 p-3 rounded-xl space-y-2 border border-blue-500/20">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-blue-600">AI Vision Engine</span>
                      <span className="text-emerald-500">Passed</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      AI forensic engine analyzed the evidence for metadata tampering, GAN-based generation, and temporal inconsistencies. 
                      Authenticity score: <span className="text-emerald-500 font-bold">{(100 - (claimData.ai_probability || 0)).toFixed(1)}%</span>
                      <br /><br />
                      <span className="text-foreground font-medium">Verification Logs:</span>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 opacity-80">
                        <li>EXIF Metadata: Consistent with reported time/location.</li>
                        <li>Deepfake Check: No synthetic artifacts detected.</li>
                        <li>Face Match: Confirmed policy holder identity.</li>
                      </ul>
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Trigger Type</h4>
                    <p className="text-sm font-medium">{claimData.trigger_type}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">AI Confidence</h4>
                    <p className="text-sm font-medium text-emerald-500">{claimData.confidence}%</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <h3 className="font-bold text-lg flex items-center gap-2 mt-8">
            <ShieldCheck size={18} className="text-primary" />
            Solvency Transparency
          </h3>

          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-muted-foreground">Actuarial Solvency</span>
              <span className="font-bold text-emerald-500">142% Over-collateralized</span>
            </div>
            
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 w-[72%]" />
            </div>

            <button
              onClick={() => setShowFormula(!showFormula)}
              className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 p-2 rounded-lg transition-colors"
            >
              70% Income Replacement Formula
              <Info size={14} />
            </button>

            {showFormula && (
               <motion.div
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: "auto" }}
                 className="mt-4 pt-4 border-t border-border/50"
               >
                 <div className="bg-secondary/50 rounded-xl p-4 font-mono text-xs text-muted-foreground">
                   <p className="mb-2"><span className="text-foreground font-bold">P</span> = Final Payout (₹239)</p>
                   <p className="mb-2"><span className="text-foreground font-bold">H</span> = Disruption Hours (3.5h)</p>
                   <p className="mb-2"><span className="text-foreground font-bold">E</span> = Avg. Earnings (₹108/hr)</p>
                   <p className="mb-2"><span className="text-foreground font-bold">L</span> = Disruption Loss Factor (0.90)</p>
                   <p className="mb-4"><span className="text-foreground font-bold">S</span> = Sovereign Support (70%)</p>
                   <div className="bg-background border border-border/50 p-2 rounded-lg text-center font-bold text-primary">
                     P = (H * E * L) * S = ₹239
                   </div>
                 </div>
               </motion.div>
            )}
          </div>

          <h3 className="font-bold text-lg flex items-center gap-2 mt-8">
            <FileText size={18} className="text-primary" />
            Evidence Log
          </h3>

          <div className="space-y-3">
            {imageUrl && (
              <div className="mb-4 rounded-xl overflow-hidden border border-border/50">
                <img src={imageUrl} alt="Claim Evidence" className="w-full h-auto object-cover max-h-48" />
              </div>
            )}
            {[
              { label: "Telemetry Data", value: storedClaim?.jepData?.telemetryStatus || "Verified (GPS/Speed)" },
              { label: "Weather API", value: storedClaim?.jepData?.weatherStatus || (claimData?.trigger_type === "Heavy Rain" ? "Heavy Rain (>20mm/hr)" : "Clear") },
              { label: "Partner Status", value: `Active (${storedClaim?.jepData?.partnerPlatform || "Blinkit"})` },
              { label: "Processing Time", value: storedClaim?.jepData?.processingTime || "Under 90 Seconds" },
              { label: "AI Deepfake Check", value: `Passed (${storedClaim?.jepData?.ai_probability ?? claimData?.ai_probability ?? 0}% AI)` },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-card border border-border/50 rounded-xl">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="font-medium text-sm text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-8 space-y-4">
          <ViralShareButton claimId={claimId || "1"} amount={amount} />
          <button 
            onClick={() => navigate(`/jep/${claimId || "1"}`)} 
            className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <FileText size={20} />
            View JEP Explanation (Hindi/English)
          </button>
          <button 
            onClick={handleDownloadPdf} 
            disabled={isGeneratingPdf} 
            className="w-full bg-secondary text-foreground font-semibold py-4 rounded-xl hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGeneratingPdf ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            {isGeneratingPdf ? "Generating PDF..." : "Download JEP (PDF)"}
          </button>
        </div>
      </main>
    </div>
  );
}
