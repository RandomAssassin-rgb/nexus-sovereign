import { motion } from "framer-motion";
import { ArrowLeft, Camera, AlertCircle, CheckCircle2, Scale, FileText, Download, Share2, Loader2 } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useState, useRef } from "react";
import { cn } from "../lib/utils";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { fetchJsonOrThrow } from "../lib/fetchJson";

export default function ClaimEvidence() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [evidence, setEvidence] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Get data passed from FileClaim or use defaults
  const claimData = location.state?.claimData || null;
  const imageUrl = location.state?.imageUrl || null;
  const claimId = id || `CLM-${Math.floor(1000 + Math.random() * 9000)}`;

  const handleUpload = () => {
    // Simulate file upload
    setTimeout(() => {
      setEvidence("https://picsum.photos/seed/evidence/400/300");
    }, 1000);
  };

  const handleSubmit = async () => {
    try {
      const data = await fetchJsonOrThrow<{ success: boolean; message?: string }>("/api/claims/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, reason: "User escalated to Tier 3" }),
      }, "Dispute submission failed");
      if (!data.success) throw new Error(data.message);

      setSubmitted(true);
      setTimeout(() => {
        navigate("/claims");
      }, 2000);
    } catch (error: any) {
      alert("Failed to submit dispute: " + error.message);
    }
  };

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
      return { blob, filename: `Claim_Rejection_Summary_${claimId}.pdf` };
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
    const text = `Claim Rejection Summary for Claim ${claimId}\nStatus: Rejected\nReason: ${claimData?.worded_summary || "Could not verify disruption."}`;
    
    setIsGeneratingPdf(true);
    const result = await generatePdfBlob();
    
    if (result) {
      const file = new File([result.blob], result.filename, { type: "application/pdf" });
      
      // Check if Web Share API is available and can share files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Claim Rejection Summary",
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
          <h1 className="font-bold tracking-tight text-xl">Challenge Decision (Tier 3)</h1>
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="text-destructive shrink-0 mt-0.5" size={18} />
            <div>
              <h4 className="font-bold text-sm text-destructive mb-1">Claim {claimId} Rejected</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {claimData?.worded_summary || "Our automated system could not verify the disruption using partner telemetry data. Please provide photographic evidence to escalate to a Tier 3 human adjuster review."}
              </p>
            </div>
          </div>

          {claimData && (
            <div className="mb-8 space-y-6">
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
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Policy Alignment & Rejection Clauses</h4>
                  <div className="bg-destructive/5 p-3 rounded-xl space-y-2 border border-destructive/20">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-destructive">{claimData?.rejection_clause || "Clause 7.1 (Verification Failure)"}</span>
                      <span className="text-destructive">Unverified</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {claimData?.clause_description || "The claim failed to meet the Parametric Threshold."}
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Forensic Analysis & AI Confidence</h4>
                  <div className="bg-orange-500/5 p-3 rounded-xl space-y-2 border border-orange-500/20">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-orange-600">AI Vision Engine</span>
                      <span className={cn(claimData.ai_probability > 30 ? "text-destructive" : "text-amber-500")}>
                        {claimData.ai_probability > 30 ? "Suspicious" : "Inconclusive"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      AI forensic engine analyzed the evidence for metadata tampering and GAN-based generation. 
                      AI Probability: <span className="font-bold">{claimData.ai_probability}%</span>. 
                      {claimData.ai_probability > 30 ? " High likelihood of digital manipulation detected." : " Evidence is inconclusive for automated verification."}
                      <br /><br />
                      <span className="text-foreground font-medium">Technical Reasons:</span>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 opacity-80">
                        <li>Image metadata shows a capture time inconsistent with reported incident.</li>
                        <li>Visual analysis suggests the weather conditions in the photo do not match historical satellite data.</li>
                        <li>Confidence score ({claimData.confidence}%) is below the 85% threshold for autonomous approval.</li>
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
                    <p className="text-sm font-medium text-destructive">{claimData.confidence}%</p>
                  </div>
                </div>
              </div>

              {imageUrl && (
                <div className="mb-4 rounded-xl overflow-hidden border border-border/50">
                  <img src={imageUrl} alt="Submitted Evidence" className="w-full h-auto object-cover max-h-48" />
                </div>
              )}
            </div>
          )}

          <h2 className="text-2xl font-bold tracking-tight mb-2">Upload New Evidence</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Upload clearer photos of the disruption, such as flooded streets, closed roads, or relevant official alerts to escalate to a human adjuster.
          </p>

          {!evidence ? (
            <button
              onClick={handleUpload}
              className="w-full h-48 border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
            >
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <FileText className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm text-primary">Upload Evidence</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase font-bold tracking-widest">Select from Gallery</p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-3xl overflow-hidden border border-border/50 shadow-sm group">
              <img src={evidence} alt="Evidence" className="w-full h-48 object-cover" />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEvidence(null)}
                  className="bg-background/80 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-semibold hover:bg-background transition-colors"
                >
                  Reselect File
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                Additional Details (Optional)
              </label>
              <textarea
                placeholder="Describe the disruption and how it impacted your earnings..."
                className="w-full bg-card border border-border/50 rounded-xl p-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-h-[100px] resize-none"
              />
            </div>
          </div>
        </motion.div>

        <div className="mt-auto pt-6">
          <button
            onClick={handleSubmit}
            disabled={!evidence || submitted}
            className={cn(
              "w-full font-semibold py-4 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2",
              submitted
                ? "bg-emerald-500 text-white shadow-emerald-500/25"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25 disabled:opacity-50 disabled:shadow-none"
            )}
          >
            {submitted ? (
              <>
                <CheckCircle2 size={20} />
                Submitted to Adjuster
              </>
            ) : (
              <>
                <Scale size={20} />
                Escalate to Tier 3
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-muted-foreground mt-4 uppercase tracking-wider font-bold">
            IRDAI Grievance Redressal Compliant
          </p>
        </div>
      </main>
    </div>
  );
}
