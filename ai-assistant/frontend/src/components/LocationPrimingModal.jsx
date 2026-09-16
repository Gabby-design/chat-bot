import React, { useState } from 'react';
import { MapPin, X, Navigation, AlertCircle, RefreshCw, Check, ArrowRight } from 'lucide-react';

export default function LocationPrimingModal({
  isOpen,
  onClose,
  onEnableLocation,
  onManualCitySubmit,
  onSkip,
  initialError = null,
  isLoading = false
}) {
  const [cityInput, setCityInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(Boolean(initialError?.isDenied || initialError?.isUnavailable));
  const [isSubmittingCity, setIsSubmittingCity] = useState(false);

  if (!isOpen) return null;

  const handleCityFormSubmit = async (e) => {
    e?.preventDefault();
    if (!cityInput.trim()) return;
    setIsSubmittingCity(true);
    try {
      await onManualCitySubmit(cityInput.trim());
      onClose();
    } finally {
      setIsSubmittingCity(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 text-white relative animate-scale-in"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 tap-target rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer touch-manipulation"
          title="Close"
        >
          <X className="icon-md" />
        </button>

        {/* Header with Icon */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#4E80EE] to-[#70CFFF] flex items-center justify-center text-white shrink-0 shadow-md">
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-100">
              {initialError?.isDenied
                ? 'Location Access Blocked'
                : initialError?.isUnavailable
                ? 'Location Unavailable'
                : initialError?.isTimeout
                ? 'Location Timed Out'
                : 'Local Info & Weather'}
            </h3>
            <p className="text-xs text-gray-400">
              Powered by Open-Meteo & reverse geocoding
            </p>
          </div>
        </div>

        {/* Explainer / Status Body */}
        <div className="my-4 text-xs sm:text-sm text-gray-300 leading-relaxed space-y-2">
          {initialError?.isDenied ? (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                Location access is blocked in your browser settings. You can enter your city manually to get accurate local weather and info.
              </span>
            </div>
          ) : initialError?.isUnavailable ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                Couldn't detect your position right now. Enter your city below to get local results.
              </span>
            </div>
          ) : initialError?.isTimeout ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                Location detection timed out. You can retry or type your city below.
              </span>
            </div>
          ) : (
            <p>
              Gabby uses your location for accurate weather and local recommendations near you.
            </p>
          )}
        </div>

        {/* Manual City Input Form (Always available or toggled) */}
        {showManualInput || initialError ? (
          <form onSubmit={handleCityFormSubmit} className="space-y-3 mt-4">
            <div className="relative">
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder="Enter city or area (e.g. Abuja, London, Tokyo)"
                autoFocus
                className="w-full px-3.5 py-2.5 bg-[#131314] border border-white/15 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#70CFFF] transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!cityInput.trim() || isSubmittingCity}
                className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-[#4E80EE] to-[#70CFFF] hover:opacity-90 disabled:opacity-50 text-white text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmittingCity ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Looking up...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save City & Continue</span>
                  </>
                )}
              </button>
              {initialError?.isTimeout && (
                <button
                  type="button"
                  onClick={onEnableLocation}
                  disabled={isLoading}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  title="Retry GPS Detection"
                >
                  <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          </form>
        ) : (
          /* Priming Buttons */
          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={onEnableLocation}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#4E80EE] to-[#70CFFF] hover:opacity-90 disabled:opacity-50 text-white text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Detecting Location...</span>
                </>
              ) : (
                <>
                  <Navigation size={15} />
                  <span>Enable Location</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowManualInput(true)}
              className="w-full py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Enter City Manually</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* Skip action */}
        <div className="mt-3 text-center">
          <button
            onClick={onSkip}
            className="text-[11px] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer underline underline-offset-2"
          >
            Ask without location
          </button>
        </div>
      </div>
    </div>
  );
}
