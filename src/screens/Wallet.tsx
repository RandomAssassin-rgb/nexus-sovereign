import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, 
  CreditCard, ShieldCheck, Zap, Plus, X, Check, Info, 
  Smartphone, Building2, Landmark, History
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { 
  getTransactions, 
  saveTransactions, 
  getBalance, 
  setBalance as storeSetBalance, 
  getPaymentMethods,
  savePaymentMethods,
  type WalletTransaction,
  type PaymentMethod
} from "../lib/payoutStore";
import NotificationBell from "../components/NotificationBell";

export default function Wallet() {
  const navigate = useNavigate();
  const [balance, setBalanceState] = useState(getBalance());
  const [transactions, setTransactions] = useState<WalletTransaction[]>(getTransactions());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(getPaymentMethods());
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  const [amount, setAmount] = useState("500");
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.id || "");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setBalanceState(getBalance());
      setTransactions(getTransactions());
      setPaymentMethods(getPaymentMethods());
    };

    window.addEventListener("nexus-payout-update", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const pollInterval = setInterval(refresh, 2000);

    return () => {
      window.removeEventListener("nexus-payout-update", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(pollInterval);
    };
  }, []);

  // Helper to update balance in both local state and store
  const updateBalance = (newBal: number) => {
    setBalanceState(newBal);
    storeSetBalance(newBal);
  };


  const handleAddFunds = async () => {
    setIsProcessing(true);
    try {
      const amt = parseFloat(amount);
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt })
      });
      const order = await res.json();

      const options = {
        key: "rzp_test_SWnCTuOpDtQAgw",
        amount: order.amount,
        currency: order.currency,
        name: "Nexus Sovereign",
        description: "Wallet Top-up",
        order_id: order.id,
        handler: function (response: any) {
          const newTxn: WalletTransaction = {
            id: "TXN-" + Math.floor(Math.random() * 10000),
            title: "Wallet Top-up",
            desc: `Added via ${paymentMethods.find(m => m.id === selectedMethod)?.label || "Payment Gateway"}`,
            amount: amt,
            type: "credit",
            date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            via: "Razorpay Gateway",
          };
          updateBalance(balance + amt);
          const updated = [newTxn, ...transactions];
          setTransactions(updated);
          saveTransactions(updated);
          window.dispatchEvent(new Event("nexus-payout-update"));
          setIsAddModalOpen(false);
        },
        prefill: {
          name: "Elite User",
          email: "user@eliteprotection.com",
          contact: "9999999999"
        },
        theme: {
          color: "#000000"
        }
      };
      
      const rzp1 = new (window as any).Razorpay(options);
      rzp1.open();
    } catch (error) {
      console.error("Payment failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdrawFunds = async () => {
    setIsProcessing(true);
    try {
      const amt = parseFloat(amount);
      if (amt > balance) {
        alert("Insufficient balance");
        setIsProcessing(false);
        return;
      }

      // Create a Razorpay order for withdrawal verification
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt })
      });
      const order = await res.json();

      const options = {
        key: "rzp_test_SWnCTuOpDtQAgw",
        amount: order.amount,
        currency: order.currency,
        name: "Nexus Sovereign",
        description: "Wallet Withdrawal Verification",
        order_id: order.id,
        handler: function (response: any) {
          // Withdrawal verified — process it
          const newTxn: WalletTransaction = {
            id: "TXN-" + Math.floor(Math.random() * 10000),
            title: "Funds Withdrawn",
            desc: `Transferred to ${paymentMethods.find(m => m.id === selectedMethod)?.label || "linked Bank Account"}`,
            amount: amt,
            type: "debit",
            date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            via: "RazorpayX Payouts",
          };
          updateBalance(balance - amt);
          const updated = [newTxn, ...transactions];
          setTransactions(updated);
          saveTransactions(updated);
          window.dispatchEvent(new Event("nexus-payout-update"));
          setIsWithdrawModalOpen(false);
        },
        prefill: {
          name: "Elite User",
          email: "user@eliteprotection.com",
          contact: "9999999999"
        },
        theme: {
          color: "#000000"
        },
        modal: {
          ondismiss: function() {
            setIsProcessing(false);
          }
        }
      };

      const rzp1 = new (window as any).Razorpay(options);
      rzp1.open();
    } catch (error) {
      console.error("Withdrawal failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const [linkStep, setLinkStep] = useState<"select" | "input" | "verifying" | "success">("select");
  const [linkType, setLinkType] = useState<"upi" | "card">("upi");
  const [linkInput, setLinkInput] = useState("");

  const handleLinkMethod = () => {
    setLinkStep("verifying");
    
    // Simulate verification
    setTimeout(() => {
      const newMethod: PaymentMethod = {
        id: linkType + "-" + Math.random().toString(36).substring(7),
        type: linkType,
        label: linkType === "upi" ? `UPI: ${linkInput}` : `Card •••• ${linkInput.slice(-4)}`,
        verified: true
      };
      const updated = [...paymentMethods, newMethod];
      setPaymentMethods(updated);
      savePaymentMethods(updated);
      setLinkStep("success");
      
      setTimeout(() => {
        setIsLinkModalOpen(false);
        setLinkStep("select");
        setLinkInput("");
      }, 2000);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold tracking-tight text-xl">Wallet & Payments</h1>
        </div>
        <NotificationBell />
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
              <h2 className="text-4xl font-bold tracking-tight flex items-baseline gap-1">
                <span className="text-primary">₹</span>{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <WalletIcon className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 relative z-10">
            <button 
              onClick={() => { setAmount("500"); setIsAddModalOpen(true); }}
              className="bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <ArrowDownRight size={16} /> Add Funds
            </button>
            <button 
              onClick={() => { setAmount("500"); setIsWithdrawModalOpen(true); }}
              className="bg-secondary text-foreground font-semibold py-3 rounded-xl hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <ArrowUpRight size={16} /> Withdraw
            </button>
          </div>
        </motion.div>

        {/* Payment Methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <CreditCard size={18} className="text-primary" />
              Payment Methods
            </h3>
            <button 
              onClick={() => setIsLinkModalOpen(true)}
              className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-3">
            {paymentMethods.map(method => (
              <div key={method.id} className="flex items-center gap-4 p-3 rounded-2xl bg-secondary/30 border border-border/50">
                <div className="w-10 h-10 bg-background rounded-xl flex items-center justify-center shrink-0 border border-border/50">
                  {method.type === 'upi' ? <Smartphone size={18} /> : <CreditCard size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{method.label}</h4>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Verified</span>
                  </div>
                </div>
                {method.id === selectedMethod && (
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                    <Check size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <p className="text-[10px] text-muted-foreground mt-4 flex items-start gap-2 bg-secondary/50 p-2 rounded-lg">
            <Zap size={12} className="text-amber-500 shrink-0 mt-0.5" />
            Tier 1 claims are automatically routed through RazorpayX for instant settlement within 47 seconds.
          </p>
        </motion.div>

        {/* Transaction History */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <History size={18} className="text-primary" />
              Transaction History
            </h3>
            <button className="text-xs font-bold text-primary uppercase tracking-wider">View All</button>
          </div>
          
          <div className="space-y-3">
            {transactions.map((txn, i) => (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + (i * 0.05) }}
                className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      txn.type === "credit" ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                    )}>
                      {txn.type === "credit" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{txn.title}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{txn.desc}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold text-sm",
                      txn.type === "credit" ? "text-emerald-500" : "text-foreground"
                    )}>
                      {txn.type === "credit" ? "+" : "-"}₹{Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground font-medium">{txn.date}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                    {txn.via}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {(isAddModalOpen || isWithdrawModalOpen) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsAddModalOpen(false); setIsWithdrawModalOpen(false); }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-md bg-card border border-border/50 rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">
                  {isAddModalOpen ? "Add Funds" : "Withdraw Funds"}
                </h3>
                <button 
                  onClick={() => { setIsAddModalOpen(false); setIsWithdrawModalOpen(false); }}
                  className="p-2 hover:bg-secondary rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Enter Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-primary">₹</span>
                    <input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-secondary/50 border border-border/50 rounded-2xl py-4 pl-10 pr-4 text-2xl font-bold focus:outline-none focus:border-primary transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    {["100", "500", "1000", "5000"].map(val => (
                      <button 
                        key={val}
                        onClick={() => setAmount(val)}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold border transition-all",
                          amount === val ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-border/50 text-muted-foreground"
                        )}
                      >
                        ₹{val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Select Payment Method
                  </label>
                  <div className="space-y-2">
                    {paymentMethods.map(method => (
                      <button
                        key={method.id}
                        onClick={() => setSelectedMethod(method.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                          selectedMethod === method.id ? "bg-primary/5 border-primary" : "bg-secondary/30 border-border/50"
                        )}
                      >
                        <div className="w-8 h-8 bg-background rounded-lg flex items-center justify-center border border-border/50">
                          {method.type === 'upi' ? <Smartphone size={14} /> : <CreditCard size={14} />}
                        </div>
                        <span className="flex-1 text-left text-sm font-medium">{method.label}</span>
                        {selectedMethod === method.id && <Check size={16} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={isAddModalOpen ? handleAddFunds : handleWithdrawFunds}
                  disabled={isProcessing || !amount || parseFloat(amount) <= 0}
                  className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span className="animate-spin rounded-full h-5 w-5 border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    isAddModalOpen ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />
                  )}
                  {isAddModalOpen ? "Confirm Deposit" : "Confirm Withdrawal"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isLinkModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isProcessing && setLinkStep("select") && setIsLinkModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-sm bg-card border border-border/50 rounded-[32px] p-6 shadow-2xl overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {linkStep === "select" && (
                  <motion.div
                    key="select"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold">Link New Method</h3>
                      <p className="text-sm text-muted-foreground mt-1">Add a card or UPI ID for faster payments</p>
                    </div>

                    <div className="space-y-4">
                      <button 
                        onClick={() => { setLinkType("upi"); setLinkStep("input"); }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/50 border border-border/50 hover:border-primary transition-all"
                      >
                        <Smartphone className="text-primary" />
                        <div className="text-left">
                          <p className="font-bold text-sm">Link UPI ID</p>
                          <p className="text-[10px] text-muted-foreground">GPay, PhonePe, Paytm</p>
                        </div>
                      </button>
                      <button 
                        onClick={() => { setLinkType("card"); setLinkStep("input"); }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/50 border border-border/50 hover:border-primary transition-all"
                      >
                        <CreditCard className="text-primary" />
                        <div className="text-left">
                          <p className="font-bold text-sm">Credit/Debit Card</p>
                          <p className="text-[10px] text-muted-foreground">Visa, Mastercard, RuPay</p>
                        </div>
                      </button>
                    </div>
                    <button 
                      onClick={() => setIsLinkModalOpen(false)}
                      className="w-full mt-6 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}

                {linkStep === "input" && (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <button onClick={() => setLinkStep("select")} className="p-2 -ml-2 hover:bg-secondary rounded-full">
                        <ArrowLeft size={18} />
                      </button>
                      <h3 className="text-xl font-bold">Enter Details</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                          {linkType === "upi" ? "UPI ID" : "Card Number"}
                        </label>
                        <input 
                          type="text"
                          value={linkInput}
                          onChange={(e) => setLinkInput(e.target.value)}
                          placeholder={linkType === "upi" ? "username@bank" : "0000 0000 0000 0000"}
                          className="w-full bg-secondary/50 border border-border/50 rounded-xl p-4 text-sm focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      {linkType === "card" && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Expiry</label>
                            <input type="text" placeholder="MM/YY" className="w-full bg-secondary/50 border border-border/50 rounded-xl p-4 text-sm focus:outline-none focus:border-primary transition-all" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">CVV</label>
                            <input type="password" placeholder="•••" className="w-full bg-secondary/50 border border-border/50 rounded-xl p-4 text-sm focus:outline-none focus:border-primary transition-all" />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleLinkMethod}
                      disabled={!linkInput}
                      className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl mt-8 shadow-lg shadow-primary/25 disabled:opacity-50"
                    >
                      Verify & Link
                    </button>
                  </motion.div>
                )}

                {linkStep === "verifying" && (
                  <motion.div
                    key="verifying"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 text-center"
                  >
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                      <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold mb-2">Verifying Method</h3>
                    <p className="text-sm text-muted-foreground">Securely connecting with your bank...</p>
                  </motion.div>
                )}

                {linkStep === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 text-center"
                  >
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-emerald-500/30">
                      <Check className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Method Linked!</h3>
                    <p className="text-sm text-muted-foreground">Your {linkType.toUpperCase()} has been successfully verified.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

