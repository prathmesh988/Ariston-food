import { useState, useEffect } from 'react';
import { loadBusinessSettings, getCachedSettings } from '@food/utils/businessSettings';

const DEFAULT_RESTAURANT_ID = '650000000000000000a15701';

/**
 * Shared hook to determine the current platform operating mode for mobile-user.
 * Reads platformMode from backend business settings with startup fallback to EXPO_PUBLIC_PLATFORM_MODE.
 *
 * @returns {{ platformMode: 'marketplace' | 'single_vendor', isSingleVendor: boolean, defaultRestaurantId: string }}
 */
export const usePlatformMode = () => {
  const [platformMode, setPlatformMode] = useState(() => {
    const cached = getCachedSettings();
    return (
      cached?.platformMode ||
      process.env.EXPO_PUBLIC_PLATFORM_MODE ||
      'marketplace'
    );
  });

  const [defaultRestaurantId, setDefaultRestaurantId] = useState(() => {
    const cached = getCachedSettings();
    return (
      cached?.defaultRestaurantId ||
      DEFAULT_RESTAURANT_ID
    );
  });

  useEffect(() => {
    let mounted = true;

    const fetchSettings = async () => {
      try {
        const settings = await loadBusinessSettings();
        if (mounted && settings?.platformMode) {
          setPlatformMode(settings.platformMode);
          if (settings.defaultRestaurantId) {
            setDefaultRestaurantId(settings.defaultRestaurantId);
          }
        }
      } catch {
        // Keep fallback values
      }
    };

    fetchSettings();

    const handleUpdate = () => {
      const updated = getCachedSettings();
      if (updated?.platformMode) {
        setPlatformMode(updated.platformMode);
        if (updated.defaultRestaurantId) {
          setDefaultRestaurantId(updated.defaultRestaurantId);
        }
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('businessSettingsUpdated', handleUpdate);
      return () => {
        mounted = false;
        window.removeEventListener('businessSettingsUpdated', handleUpdate);
      };
    }
    return () => {
      mounted = false;
    };
  }, []);

  const isSingleVendor = platformMode === 'single_vendor';

  return {
    platformMode,
    isSingleVendor,
    defaultRestaurantId,
  };
};

export default usePlatformMode;
