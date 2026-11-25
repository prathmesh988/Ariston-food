import { userAPI } from "@food/api"
import { isDiamondMembershipEnabledSync } from "@food/hooks/useCustomizationSettings"

// Last Diamond data per user, so the profile strip and Diamond page draw instantly
// (also after an app restart) while a fresh copy loads in the background.
const KEY = "foodie_diamond_v1"
let memory = null
let inFlight = null

const DISABLED_DIAMOND_DATA = {
  featureEnabled: false,
  plan: { enabled: false, price: 0, benefits: [] },
  membership: { isMember: false, since: null, endAt: null, daysLeft: 0 },
  savings: null,
}

const currentUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user_user") || "null")
    return String(user?._id || user?.id || "")
  } catch {
    return ""
  }
}

export function getCachedDiamond() {
  if (!isDiamondMembershipEnabledSync()) {
    return DISABLED_DIAMOND_DATA
  }
  const uid = currentUserId()
  if (memory && memory.uid === uid) {
    if (memory.data?.featureEnabled === false) return DISABLED_DIAMOND_DATA
    return memory.data
  }
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null")
    if (stored && stored.uid === uid && stored.data) {
      if (stored.data.featureEnabled === false) return DISABLED_DIAMOND_DATA
      memory = stored
      return stored.data
    }
  } catch {
    // ignore broken cache
  }
  return null
}

export function setCachedDiamond(data) {
  if (!data) return
  const safeData = data.featureEnabled === false ? DISABLED_DIAMOND_DATA : data
  memory = { uid: currentUserId(), data: safeData }
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // storage full: memory copy still helps this session
  }
}

/** One request at a time; resolves to fresh data (and updates the cache). */
export function fetchDiamond() {
  if (!isDiamondMembershipEnabledSync()) {
    setCachedDiamond(DISABLED_DIAMOND_DATA)
    return Promise.resolve(DISABLED_DIAMOND_DATA)
  }
  if (!inFlight) {
    inFlight = userAPI
      .getDiamond()
      .then((res) => {
        const data = res?.data?.data || null
        if (data?.featureEnabled === false) {
          setCachedDiamond(DISABLED_DIAMOND_DATA)
          return DISABLED_DIAMOND_DATA
        }
        setCachedDiamond(data)
        return data
      })
      .catch((err) => {
        // If unauthenticated or feature disabled on backend
        if (err?.response?.status === 403 || err?.response?.status === 404) {
          setCachedDiamond(DISABLED_DIAMOND_DATA)
          return DISABLED_DIAMOND_DATA
        }
        return getCachedDiamond()
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export function clearDiamondCache() {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

/** Warm the Diamond page code so the first tap opens without waiting for the chunk. */
export const preloadDiamondPage = () => import("@food/pages/user/diamond/DiamondPage")

