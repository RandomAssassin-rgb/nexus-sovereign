import { motion } from "framer-motion";
import { ArrowLeft, Bell, Phone, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AuthShell from "../components/AuthShell";
import { persistSessionBridge } from "../lib/sessionBridge";

export default function SignInPhone() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");

  const validatePhone = (num: string) => /^[6-9]\d{9}$/.test(num);
  const isValid = validatePhone(phoneNumber);

  const handleSendOTP = async () => {
    if (isValid) {
      // Mock OTP Send for demo
      localStorage.setItem("signin_phone", phoneNumber);
      await persistSessionBridge({ signin_phone: phoneNumber }).catch(() => undefined);
      navigate("/otp");
    }
  };

  return (
    <AuthShell
      title="Linked mobile"
      subtitle="Enter the number shared with your partner platform for 2FA."
      onBack={() => navigate(-1)}
      step="Identity verification"
      progress={1}
      brandLabel="Identity Verification"
      rightSlot={<div className="nexus-icon-button text-muted-foreground"><Bell size={18} /></div>}
    >
      <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 text-center"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-primary/10">
              <Phone className="h-8 w-8 text-primary" />
            </div>
          </motion.div>

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
              className="nexus-input pl-20 text-lg font-bold tracking-widest"
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
          className="nexus-button-primary mt-8 w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send OTP
      </button>
    </AuthShell>
  );
}
