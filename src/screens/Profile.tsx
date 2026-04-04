import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Share2, ShieldCheck, Award, Star, Settings, LogOut, ChevronRight, Moon, Sun, Camera } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../components/theme-provider";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import NotificationBell from "../components/NotificationBell";
import { clearUserSession } from "../lib/payoutStore";

export default function Profile() {
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [faceImageState, setFaceImageState] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const pid = localStorage.getItem("partner_id") || "BLK-98234";
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('partnerId', pid)
        .single();
      
      if (data) {
        setUserProfile(data);
        setFaceImageState(data.avatar_url || localStorage.getItem("face_image"));
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Failed to load face-api models:", error);
      }
    };
    loadModels();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isModelLoaded) {
      alert("Face recognition models are still loading. Please try again in a moment.");
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageSrc = event.target?.result as string;
        
        // Process image with face-api
        const img = await faceapi.fetchImage(imageSrc);
        const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections) {
          alert("No face detected in the uploaded image. Please try another one.");
          setIsUploading(false);
          return;
        }

        // 1. Upload to Supabase Storage
        const partnerId = localStorage.getItem("partner_id") || "BLK-98234";
        const fileName = `${partnerId}_${Date.now()}.jpg`;
        
        // Convert base64 to Blob for storage upload
        const base64Response = await fetch(imageSrc);
        const blob = await base64Response.blob();

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

        // 3. Update User Profile in Database
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: publicUrl })
          .eq('partnerId', partnerId);
        
        if (updateError) throw updateError;

        // 4. Update Local State & Cache
        localStorage.setItem("face_descriptor", JSON.stringify(Array.from(detections.descriptor)));
        localStorage.setItem("face_image", publicUrl);
        setFaceImageState(publicUrl);
        
        const sessionStr = localStorage.getItem("dummy_session");
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          session.user = { ...session.user, photoURL: publicUrl };
          localStorage.setItem("dummy_session", JSON.stringify(session));
          window.dispatchEvent(new Event("auth-change"));
        }

        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error("Error processing/uploading image:", error);
      alert(`Failed to update profile picture: ${error.message}`);
      setIsUploading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("nexus.sovereign/ref/BLK982");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    // Clear the specific user session while preserving system settings if any
    clearUserSession();
    
    // Dispatch events to instantly update global React state in App.tsx
    window.dispatchEvent(new Event("auth-change"));
    window.dispatchEvent(new Event("admin-auth-change"));
    
    // Navigate home
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <h1 className="font-bold tracking-tight text-xl">Worker Profile</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 bg-secondary/50 hover:bg-secondary rounded-xl transition-all active:scale-95"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-6"
        >
          <div 
            className="relative w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/30 shrink-0 overflow-hidden group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {faceImageState ? (
              <img src={faceImageState} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
            
            {/* Loading State */}
            {isUploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageUpload} 
          />

          <div>
            <h2 className="text-2xl font-bold tracking-tight">{userProfile?.full_name || "Nexus Rider"}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-500" />
              Verified Partner ({localStorage.getItem("partner_id") || "BLK-98234"})
            </p>
          </div>
        </motion.div>

        {/* Trust Score */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Award size={18} className="text-amber-500" />
                Trust Score
              </h3>
              <p className="text-xs text-muted-foreground">Top 5% of earners</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-amber-500">{userProfile?.trust_score || 842}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">+12 this month</p>
            </div>
          </div>

          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden relative z-10">
            <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 w-[84%]" />
          </div>
        </motion.div>

        {/* Viral Loop / Referral */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-primary/5 border border-primary/20 rounded-3xl p-5 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Star className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Invite & Boost</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Invite fellow riders. They get <strong className="text-foreground">1 month free</strong>, you get a <strong className="text-primary">+50 Trust Score</strong> boost (lower premiums!).
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 bg-background border border-border/50 rounded-xl py-3 text-sm font-mono font-medium hover:border-primary transition-colors relative"
            >
              {copied ? (
                <span className="text-emerald-500">Copied!</span>
              ) : (
                "nexus.sovereign/ref/BLK982"
              )}
            </button>
            <button className="bg-primary text-primary-foreground px-4 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center shadow-lg shadow-primary/25">
              <Share2 size={18} />
            </button>
          </div>
        </motion.div>

        {/* Settings Links */}
        <div className="space-y-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-full flex items-center justify-between p-4 bg-card border border-border/50 rounded-2xl hover:border-primary/50 transition-colors"
          >
            <span className="font-medium text-sm flex items-center gap-2">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              Theme
            </span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs capitalize">{theme}</span>
              <ChevronRight size={16} />
            </div>
          </button>

          {[
            { label: "Payout Account (UPI)", value: "9876543210@ybl" },
            { label: "Language Preferences", value: "English" },
            { label: "Help & Support", value: "" },
          ].map((item, i) => (
            <button key={i} className="w-full flex items-center justify-between p-4 bg-card border border-border/50 rounded-2xl hover:border-primary/50 transition-colors">
              <span className="font-medium text-sm">{item.label}</span>
              <div className="flex items-center gap-2 text-muted-foreground">
                {item.value && <span className="text-xs">{item.value}</span>}
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>

        <button 
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 p-4 text-destructive font-semibold hover:bg-destructive/5 rounded-2xl transition-colors mt-8"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </main>
    </div>
  );
}
