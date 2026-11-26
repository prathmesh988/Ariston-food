import { useState, useRef, useEffect, useMemo } from "react";
import { Info, Phone, Upload, X, Loader2, Store, UtensilsCrossed, Layers, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { setCachedSettings, getCachedSettings, updateFavicon, updateTitle } from "@food/utils/businessSettings";
import { EMAIL_REGEX } from "@/shared/utils/emailValidation";
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const emptyForm = {
  companyName: "",
  email: "",
  phoneCountryCode: "+91",
  phoneNumber: "",
  address: "",
  state: "",
  pincode: "",
  region: "",
};

const settingsToForm = (settings) => ({
  companyName: settings?.companyName || "",
  email: settings?.email || "",
  phoneCountryCode: settings?.phone?.countryCode || "+91",
  phoneNumber: settings?.phone?.number || "",
  address: settings?.address || "",
  state: settings?.state || "",
  pincode: settings?.pincode || "",
  region: settings?.region || "India",
});

export default function BusinessSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [faviconPreview, setFaviconPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeFavicon, setRemoveFavicon] = useState(false);
  const [savedForm, setSavedForm] = useState(emptyForm);
  const [savedLogoUrl, setSavedLogoUrl] = useState(null);
  const [savedFaviconUrl, setSavedFaviconUrl] = useState(null);
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);

  const [formData, setFormData] = useState(emptyForm);
  const [platformMode, setPlatformMode] = useState("marketplace");
  const [switchingMode, setSwitchingMode] = useState(false);

  const hasChanges = useMemo(() => {
    const formDirty = Object.keys(emptyForm).some(
      (key) => String(formData[key] ?? "") !== String(savedForm[key] ?? ""),
    );
    const logoDirty = Boolean(logoFile) || (removeLogo && Boolean(savedLogoUrl));
    const faviconDirty =
      Boolean(faviconFile) || (removeFavicon && Boolean(savedFaviconUrl));
    return formDirty || logoDirty || faviconDirty;
  }, [
    formData,
    savedForm,
    logoFile,
    faviconFile,
    removeLogo,
    removeFavicon,
    savedLogoUrl,
    savedFaviconUrl,
  ]);

  // Fetch business settings on mount
  useEffect(() => {
    fetchBusinessSettings();
  }, []);

  const applySettingsToState = (settings) => {
    const nextForm = settingsToForm(settings);
    const nextLogo = settings?.logo?.url || null;
    const nextFavicon = settings?.favicon?.url || null;
    setFormData(nextForm);
    setSavedForm(nextForm);
    setLogoPreview(nextLogo);
    setFaviconPreview(nextFavicon);
    setSavedLogoUrl(nextLogo);
    setSavedFaviconUrl(nextFavicon);
    setRemoveLogo(false);
    setRemoveFavicon(false);
    setLogoFile(null);
    setFaviconFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (faviconInputRef.current) faviconInputRef.current.value = "";
    if (settings?.platformMode) {
      setPlatformMode(settings.platformMode);
    }
  };

  const handleTogglePlatformMode = async (targetMode) => {
    if (switchingMode || targetMode === platformMode) return;
    try {
      setSwitchingMode(true);
      const res = await adminAPI.updatePlatformMode(targetMode);
      const newMode = res?.data?.data?.platformMode || targetMode;
      setPlatformMode(newMode);
      const currentCached = getCachedSettings() || {};
      setCachedSettings({
        ...currentCached,
        platformMode: newMode,
        defaultRestaurantId: res?.data?.data?.defaultRestaurantId || currentCached.defaultRestaurantId,
      });
      toast.success(
        newMode === "single_vendor"
          ? "Platform switched to Single-Vendor Mode (Ariston Cafe)"
          : "Platform switched to Multi-Vendor Marketplace Mode"
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to switch platform mode");
    } finally {
      setSwitchingMode(false);
    }
  };

  const fetchBusinessSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;

      if (settings) {
        applySettingsToState(settings);
      }
    } catch (error) {
      debugError("Error fetching business settings:", error);
      toast.error(error?.response?.data?.message || "Failed to load business settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!formData.companyName.trim()) {
        toast.error("Company name is required");
        return;
      }
      if (formData.companyName.trim().length < 2) {
        toast.error("Company name must be at least 2 characters long");
        return;
      }

      if (!formData.email.trim()) {
        toast.error("Email is required");
        return;
      }
      if (!EMAIL_REGEX.test(formData.email.trim())) {
        toast.error("Please enter a valid email address");
        return;
      }

      if (!formData.phoneNumber.trim()) {
        toast.error("Phone number is required");
        return;
      }
      const phoneRegex = /^\d{7,15}$/;
      if (!phoneRegex.test(formData.phoneNumber.trim())) {
        toast.error("Please enter a valid phone number (7-15 digits)");
        return;
      }

      if (formData.pincode.trim() && !/^\d{4,10}$/.test(formData.pincode.trim())) {
        toast.error("Please enter a valid pincode (4-10 digits)");
        return;
      }

      setSaving(true);

      // Prepare form data
      const dataToSend = {
        companyName: formData.companyName.trim(),
        email: formData.email.trim(),
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        region: formData.region,
        removeLogo: removeLogo && !logoFile,
        removeFavicon: removeFavicon && !faviconFile,
      };

      // Prepare files
      const files = {};
      if (logoFile) {
        files.logo = logoFile;
      }
      if (faviconFile) {
        files.favicon = faviconFile;
      }

      const response = await adminAPI.updateBusinessSettings(dataToSend, files);
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        // Update global cache immediately
        setCachedSettings(updatedSettings);
        applySettingsToState(updatedSettings);

        // Restore default site favicon when admin favicon was removed
        if (!updatedSettings.favicon?.url) {
          updateFavicon(null);
        }
      }

      toast.success("Business settings saved successfully");

      // Dispatch custom event to notify other components (like Sidebar)
      window.dispatchEvent(new CustomEvent('businessSettingsUpdated'));
    } catch (error) {
      debugError("Error saving business settings:", error);
      toast.error(error?.response?.data?.message || "Failed to save business settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!hasChanges) return;
    setFormData(savedForm);
    setLogoPreview(savedLogoUrl);
    setFaviconPreview(savedFaviconUrl);
    setLogoFile(null);
    setFaviconFile(null);
    setRemoveLogo(false);
    setRemoveFavicon(false);
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
    if (faviconInputRef.current) {
      faviconInputRef.current.value = "";
    }
    toast.info("Form reset to saved values");
  };


  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Business setup</h1>
          </div>
          <p className="text-xs lg:text-sm text-slate-500 mt-1">
            Manage your company information, general configuration and business rules.
          </p>
        </div>

        {/* Note card (top-right) */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3 max-w-md">
          <div className="mt-0.5">
            <Info className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xs lg:text-sm text-slate-700">
            <p className="font-semibold text-amber-700 mb-0.5">Note</p>
            <p>Don&apos;t forget to click the &quot;Save Information&quot; button below to save changes.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Platform Operating Mode Toggle Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">Platform Operating Mode</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    platformMode === "single_vendor"
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                      : "bg-emerald-400/20 text-emerald-300 border border-emerald-400/40"
                  }`}>
                    {platformMode === "single_vendor" ? "Single Vendor" : "Multi-Vendor"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Control whether the platform operates across multiple restaurants or solely as Ariston Cafe.
                </p>
              </div>
            </div>

            {/* Live Toggle Pill */}
            <div className="flex items-center gap-2 bg-slate-800/90 p-1 rounded-lg border border-slate-700/60 self-start sm:self-auto">
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleTogglePlatformMode("marketplace")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  platformMode === "marketplace"
                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white"
                } disabled:opacity-50`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Multi-Vendor</span>
              </button>
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleTogglePlatformMode("single_vendor")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  platformMode === "single_vendor"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                } disabled:opacity-50`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Single-Vendor</span>
              </button>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50">
            {/* Multi-vendor card option */}
            <div
              onClick={() => handleTogglePlatformMode("marketplace")}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                platformMode === "marketplace"
                  ? "bg-white border-blue-500 ring-2 ring-blue-500/10 shadow-sm"
                  : "bg-white/60 border-slate-200 hover:border-slate-300 opacity-75 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    platformMode === "marketplace" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Multi-Vendor Marketplace</h4>
                    <p className="text-[11px] text-slate-500">Standard operating model</p>
                  </div>
                </div>
                {platformMode === "marketplace" ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Click to activate</span>
                )}
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>Restaurants can register, onboard & receive independent orders</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>Vendor commission rules, restaurant approval queue & vendor payouts active</span>
                </li>
                <li className="flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50/60 px-2 py-1 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Rider (Delivery Partner) approval & registration required from admin</span>
                </li>
              </ul>
            </div>

            {/* Single-vendor card option */}
            <div
              onClick={() => handleTogglePlatformMode("single_vendor")}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                platformMode === "single_vendor"
                  ? "bg-white border-amber-500 ring-2 ring-amber-500/10 shadow-sm"
                  : "bg-white/60 border-slate-200 hover:border-slate-300 opacity-75 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    platformMode === "single_vendor" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    <UtensilsCrossed className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Single-Vendor (Ariston Cafe)</h4>
                    <p className="text-[11px] text-slate-500">Dedicated brand model</p>
                  </div>
                </div>
                {platformMode === "single_vendor" ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Click to activate</span>
                )}
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>Ariston Cafe is the sole restaurant (skips restaurant onboarding & approval)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>0% restaurant commission, vendor payouts disabled, orders route to Ariston Cafe</span>
                </li>
                <li className="flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50/60 px-2 py-1 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Rider (Delivery Partner) approval & registration remains UNCHANGED & REQUIRED</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Company info */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {/* Company information */}
          <div className="px-4 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>Company Information</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Company name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter Your Company Name"
                  value={formData.companyName}
                  maxLength={50}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="Enter Your Email"
                  value={formData.email}
                  maxLength={100}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Region <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.region}
                  onChange={(e) => handleInputChange("region", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="India">India</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Phone <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative w-32">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={(e) => handleInputChange("phoneCountryCode", e.target.value)}
                      className="w-full pl-8 pr-6 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                    >
                      <option value="+91">+91 (IN)</option>
                    </select>
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                      ?
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter Your Phone Number"
                    value={formData.phoneNumber}
                    maxLength={15}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      handleInputChange("phoneNumber", val);
                    }}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter Your Addresss"
                  value={formData.address}
                  maxLength={250}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  State
                </label>
                <input
                  type="text"
                  placeholder="Enter Your State"
                  value={formData.state}
                  maxLength={50}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pincode
                </label>
                <input
                  type="text"
                  placeholder="Enter Your Pincode"
                  value={formData.pincode}
                  maxLength={10}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    handleInputChange("pincode", val);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Logo & favicon upload */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Logo</label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    // Validate file type
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
                      return;
                    }

                    // Validate file size (max 5MB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }

                    setLogoFile(file);
                    setRemoveLogo(false);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setLogoPreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {logoPreview ? (
                    <>
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLogoPreview(null);
                          setLogoFile(null);
                          setRemoveLogo(true);
                          if (logoInputRef.current) {
                            logoInputRef.current.value = "";
                          }
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload logo</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Favicon</label>
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    // Validate file type
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, WEBP, or ICO.");
                      return;
                    }

                    // Validate file size (max 5MB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }

                    setFaviconFile(file);
                    setRemoveFavicon(false);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFaviconPreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => faviconInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {faviconPreview ? (
                    <>
                      <img
                        src={faviconPreview}
                        alt="Favicon preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFaviconPreview(null);
                          setFaviconFile(null);
                          setRemoveFavicon(true);
                          if (faviconInputRef.current) {
                            faviconInputRef.current.value = "";
                          }
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload favicon</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button Section */}
          <div className="px-4 py-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Changes will only be applied after clicking the <span className="font-semibold">Save Information</span> button.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving || !hasChanges}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Information"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ initial = false }) {
  const [enabled, setEnabled] = useState(initial);

  return (
    <button
      type="button"
      onClick={() => setEnabled((prev) => !prev)}
      className={`inline-flex items-center w-10 h-5 rounded-full border transition-all ${enabled ? "bg-blue-600 border-blue-600 justify-end" : "bg-slate-200 border-slate-300 justify-start"
        }`}
    >
      <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
    </button>
  );
}

