import React, { useState, useRef, useEffect } from 'react';
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, X, RefreshCw, MapPin, Wind, Droplets, Thermometer, ChevronDown } from 'lucide-react';

const ICON_MAP = {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle
};

export default function WeatherChip({
  locationWeather,
  onRefresh,
  onChangeCity,
  onDismiss
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  if (!locationWeather || !locationWeather.weather) return null;

  const { location, weather } = locationWeather;
  const IconComponent = ICON_MAP[weather.iconName] || CloudSun;
  const displayCity = location?.city || location?.formatted?.split(',')[0] || 'Local';
  const temp = weather.temperature;

  const handleRefreshClick = async (e) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDismissClick = (e) => {
    e.stopPropagation();
    if (onDismiss) onDismiss();
  };

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      {/* Main Pill Chip */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white border border-white/10 hover:border-white/20 transition-all text-xs font-medium cursor-pointer touch-manipulation max-w-[160px] sm:max-w-[220px] truncate"
        title="Click for weather details"
      >
        <IconComponent size={14} className="text-[#70CFFF] shrink-0" />
        <span className="truncate">{displayCity}</span>
        <span className="text-gray-100 font-semibold shrink-0">{temp}°C</span>
        <ChevronDown size={11} className={`transition-transform duration-200 shrink-0 text-gray-400 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dismiss 'x' button right beside chip */}
      <button
        type="button"
        onClick={handleDismissClick}
        className="ml-1 p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer touch-manipulation"
        title="Dismiss weather chip"
      >
        <X size={13} />
      </button>

      {/* Details Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 z-50 w-64 bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl p-4 text-white animate-scale-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-2.5 mb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#70CFFF] font-medium">
                <MapPin size={12} />
                <span className="truncate">{location.formatted || displayCity}</span>
              </div>
              <div className="text-xl font-bold text-gray-100 mt-1 flex items-baseline gap-2">
                <span>{temp}°C</span>
                <span className="text-xs font-normal text-gray-400">{weather.condition}</span>
              </div>
            </div>
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh weather"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300 mb-3">
            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
              <Thermometer size={14} className="text-rose-400 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[10px]">Feels like</span>
                <span className="font-medium text-white">{weather.apparentTemperature}°C</span>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
              <Droplets size={14} className="text-sky-400 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[10px]">Humidity</span>
                <span className="font-medium text-white">{weather.humidity != null ? `${weather.humidity}%` : 'N/A'}</span>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2 col-span-2">
              <Wind size={14} className="text-emerald-400 shrink-0" />
              <div>
                <span className="text-gray-400 block text-[10px]">Wind speed</span>
                <span className="font-medium text-white">{weather.windSpeed != null ? `${weather.windSpeed} km/h` : 'Light breeze'}</span>
              </div>
            </div>
          </div>

          {/* Action links */}
          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onChangeCity) onChangeCity();
              }}
              className="text-[#70CFFF] hover:underline cursor-pointer font-medium"
            >
              Change city
            </button>
            <span className="text-[10px] text-gray-500">Updated recently</span>
          </div>
        </div>
      )}
    </div>
  );
}
