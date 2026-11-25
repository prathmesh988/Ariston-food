import { useState, useEffect } from "react"
import apiClient from "@food/api/axios"

const CACHE_KEY = "foodie_customization_settings"

export const getCachedCustomizationSettings = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Synchronous check for whether Diamond Membership is enabled.
 * Reads instantly from localStorage cache. Returns true only if not explicitly false.
 */
export const isDiamondMembershipEnabledSync = () => {
  const cached = getCachedCustomizationSettings()
  if (cached && typeof cached.diamond_membership_enabled === "boolean") {
    return cached.diamond_membership_enabled
  }
  return true
}

let inFlightPromise = null

export const fetchCustomizationSettings = async () => {
  if (inFlightPromise) return inFlightPromise
  inFlightPromise = apiClient
    .get("/food/public/customization-settings")
    .then((res) => {
      const data = res?.data?.data || res?.data || {}
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
      } catch {}
      window.dispatchEvent(
        new CustomEvent("customizationSettingsLoaded", { detail: data })
      )
      return data
    })
    .catch(() => {
      return getCachedCustomizationSettings() || {}
    })
    .finally(() => {
      inFlightPromise = null
    })
  return inFlightPromise
}

// Warm the settings in background immediately on script load
fetchCustomizationSettings()

export function useCustomizationSettings() {
  const [settings, setSettings] = useState(() => getCachedCustomizationSettings() || {})
  const [loading, setLoading] = useState(() => !getCachedCustomizationSettings())

  useEffect(() => {
    let mounted = true
    fetchCustomizationSettings().then((data) => {
      if (mounted && data) {
        setSettings(data)
        setLoading(false)
      }
    })

    const handleUpdate = () => {
      const updated = getCachedCustomizationSettings()
      if (mounted && updated) {
        setSettings(updated)
      }
    }

    window.addEventListener("customizationSettingsLoaded", handleUpdate)
    window.addEventListener("customizationSettingsChanged", handleUpdate)
    window.addEventListener("storage", handleUpdate)

    return () => {
      mounted = false
      window.removeEventListener("customizationSettingsLoaded", handleUpdate)
      window.removeEventListener("customizationSettingsChanged", handleUpdate)
      window.removeEventListener("storage", handleUpdate)
    }
  }, [])

  const isDiamondEnabled = settings?.diamond_membership_enabled !== false

  return { settings, loading, isDiamondEnabled }
}

export function useDiamondEnabled() {
  const { isDiamondEnabled } = useCustomizationSettings()
  return isDiamondEnabled
}

export default useCustomizationSettings
