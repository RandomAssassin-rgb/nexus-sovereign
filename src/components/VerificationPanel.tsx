import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, ShieldCheck, AlertCircle, CloudRain, Zap, MapPin, Fingerprint, Search, ShieldAlert } from 'lucide-react';
import { cn } from "../lib/utils";

export default function VerificationPanel({ progress, currentLayer, customLayers }: { progress: number, currentLayer?: number, customLayers?: any[] }) {
  const defaultLayers = [
    { id: 'L1', name: 'Environmental Trigger', icon: CloudRain, desc: "Cross-referencing parametric weather sensors..." },
    { id: 'L2', name: 'Mobility Veto', icon: Zap, desc: "Analyzing worker velocity & activity data..." },
    { id: 'L3', name: 'Order Fingerprint', icon: Fingerprint, desc: "Confirming active order pings via platform APIs..." },
    { id: 'L4', name: 'Location Proof', icon: MapPin, desc: "Establishing geo-fence & H3 cell validation..." },
    { id: 'L5', name: 'AI Forensic Analysis', icon: Search, desc: "Scanning evidence for forensic authenticity..." },
    { id: 'L6', name: 'Payout Guard', icon: ShieldAlert, desc: "Final check for reserve liquidity & SLA compliance..." },
  ];

  const layers = customLayers || defaultLayers;
  
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-card border border-primary/20 rounded-3xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 animate-pulse" />
      
      <h3 className="text-xl font-extrabold mb-6 flex items-center gap-2 text-primary">
        <ShieldCheck className="w-6 h-6" />
        Verification Engine <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">Live Scan</span>
      </h3>
      
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {layers.map((layer, index) => {
            const isPassed = progress > (index + 1) * 16.6;
            const isProcessing = currentLayer === index || (!currentLayer && progress > index * 16.6 && progress <= (index + 1) * 16.6);
            const isPending = !isPassed && !isProcessing;
            
            return (
              <motion.div 
                key={layer.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "flex items-center p-3.5 rounded-2xl border transition-all duration-500",
                  isPassed ? "bg-emerald-500/5 border-emerald-500/20" : 
                  isProcessing ? "bg-primary/5 border-primary/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]" : "bg-muted/10 border-border/10 opacity-50"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mr-4 transition-colors duration-500",
                  isPassed ? "bg-emerald-500/20 text-emerald-500" : 
                  isProcessing ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {isPassed ? (
                    <CheckCircle2 className="w-5 h-5 shadow-sm" />
                  ) : isProcessing ? (
                    <layer.icon className="w-5 h-5 animate-pulse" />
                  ) : (
                    <span className="font-bold text-xs">{layer.id}</span>
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className={cn(
                      "font-bold text-sm",
                      isPassed ? "text-emerald-500" : isProcessing ? "text-primary" : "text-muted-foreground/60"
                    )}>
                      {layer.name}
                    </span>
                    {isProcessing && (
                      <div className="flex gap-1">
                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-primary rounded-full" />
                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-primary rounded-full" />
                        <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-primary rounded-full" />
                      </div>
                    )}
                  </div>
                  {isProcessing && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-[10px] text-muted-foreground mt-1 font-medium italic"
                    >
                      {layer.desc}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      <div className="mt-6 pt-4 border-t border-border/10 flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Global Status</span>
        <span className="text-xs font-mono font-bold text-primary">{Math.min(100, Math.round(progress))}%</span>
      </div>
    </div>
  );
}