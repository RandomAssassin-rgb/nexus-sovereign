import { motion } from "framer-motion";
import { ArrowLeft, Bell, Phone, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function SignInPhone() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");

  const validatePhone = (num: string) => /^[6-9]\d{9}$/.test(num);
  const isValid = validatePhone(phoneNumber);

  const handleSendOTP = () => {
    if (isValid) {
      // Mock OTP Send for demo
      localStorage.setItem("signin_phone", phoneNumber);
      navigate("/otp");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center">
              <span className="text-primary text-xs font-bold">N</span>
            </div>
            <span className="font-bold tracking-tight">Identity Verification</span>
          </div>
        <button className="p-2 hover:bg-secondary rounded-full relative">
          <Bell size={20} />
        </button>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        <div className="flex justify-center gap-2 mb-8">
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-8 bg-primary rounded-full" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Phone className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">Linked Mobile</h1>
          <p className="text-muted-foreground">Enter the number shared with your partner platform for 2FA.</p>
        </motion.div>

        <div className="space-y-6 flex-1">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-lg font-bold text-muted-foreground">+91</span>
              <div className="w-px h-6 bg-border/50" />
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              className="w-full bg-card border border-border/50 rounded-xl p-4 pl-20 text-lg font-bold tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            {phoneNumber.length > 0 && !isValid && (
              <p className="text-xs text-red-500 mt-2 ml-4 font-mono">
                Must be a valid 10-digit Indian mobile number.
              </p>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 flex gap-3">
            <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={18} />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              We'll send a 6-digit OTP to verify your identity. standard rates apply.
            </p>
          </div>
        </div>

        <button
          onClick={handleSendOTP}
          disabled={!isValid}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl mt-8 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send OTP
        </button>
      </main>
    </div>
  );
}
