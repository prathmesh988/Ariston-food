import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { adminAPI } from "@food/api"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { Label } from "@food/components/ui/label"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { createPlacesAutocomplete } from "@food/utils/googlePlaces"
import { ArrowLeft, Loader2, Plus, Trash2, Users, Shield, LocateFixed } from "lucide-react"
import { usePlatformMode } from "@food/hooks/usePlatformMode"
import { getFreshGpsCoordinates, reverseGeocodeWithGoogle } from "@food/utils/googleGeocoding"
import { findZoneForPoint } from "@food/utils/zoneGeometry"

const debugError = (..._args) => {}

const toNumberOrEmpty = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : ""
}

const isNearZero = (n) => Math.abs(Number(n) || 0) < 0.000001

const normalizeRestaurantId = (r) => r?._id || r?.id || r?.restaurantId || ""

const normalizeZoneId = (zoneId) => {
  if (!zoneId) return ""
  if (typeof zoneId === "string") return zoneId
  return zoneId?._id || zoneId?.id || ""
}

const normalizeLocationFormFromRestaurant = (restaurant) => {
  const loc =
    restaurant?.location ||
    restaurant?.onboarding?.step1?.location ||
    {}

  const lat =
    toNumberOrEmpty(loc?.latitude ?? restaurant?.latitude)
  const lng =
    toNumberOrEmpty(loc?.longitude ?? restaurant?.longitude)

  const hasValidCoords =
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    !isNearZero(lat) &&
    !isNearZero(lng)

  const formattedAddress =
    loc?.formattedAddress ||
    loc?.addressLine1 ||
    restaurant?.formattedAddress ||
    restaurant?.addressLine1 ||
    restaurant?.address ||
    ""

  return {
    zoneId: normalizeZoneId(restaurant?.zoneId),
    formattedAddress,
    addressLine1: loc?.addressLine1 || restaurant?.addressLine1 || formattedAddress,
    addressLine2: loc?.addressLine2 || restaurant?.addressLine2 || "",
    area: loc?.area || restaurant?.area || "",
    city: loc?.city || restaurant?.city || "",
    state: loc?.state || restaurant?.state || "",
    pincode: loc?.pincode || restaurant?.pincode || "",
    landmark: loc?.landmark || restaurant?.landmark || "",
    latitude: hasValidCoords ? lat : "",
    longitude: hasValidCoords ? lng : "",
  }
}

const normalizeDetailsFormFromRestaurant = (restaurant) => {
  return {
    name: restaurant?.name || restaurant?.restaurantName || "",
    pureVegRestaurant:
      typeof restaurant?.pureVegRestaurant === "boolean"
        ? restaurant.pureVegRestaurant
        : false,
    ownerName: restaurant?.ownerName || "",
    ownerEmail: restaurant?.ownerEmail || "",
    ownerPhone: restaurant?.ownerPhone || "",
    primaryContactNumber: restaurant?.primaryContactNumber || "",
    email: restaurant?.email || restaurant?.primaryEmail || "",
    cuisinesText: Array.isArray(restaurant?.cuisines) ? restaurant.cuisines.join(", ") : "",
    estimatedDeliveryTimeMinutes:
      restaurant?.estimatedDeliveryTimeMinutes ??
      restaurant?.estimatedDeliveryTime ??
      "",
    offer: restaurant?.offer || "",
    openingTime: restaurant?.openingTime || restaurant?.deliveryTimings?.openingTime || "",
    closingTime: restaurant?.closingTime || restaurant?.deliveryTimings?.closingTime || "",
    isActive: restaurant?.isActive !== false,
    takeawayEnabled: restaurant?.takeawaySettings?.isEnabled ?? false,
    authorizedLogins: Array.isArray(restaurant?.authorizedLogins)
      ? restaurant.authorizedLogins.map((l) => ({
          name: l?.name || "",
          phone: l?.phone || "",
          role: l?.role || "staff",
        }))
      : [],
  }
}

async function loadGooglePlaces() {
  if (window.google?.maps?.places?.Autocomplete) return true
  const apiKey = await getGoogleMapsApiKey()
  if (!apiKey) return false

  window.gm_authFailure = () => {}

  const existing = document.getElementById("admin-google-maps-script")
  if (existing) {
    await new Promise((resolve, reject) => {
      if (window.google?.maps?.places?.Autocomplete) {
        resolve()
        return
      }
      existing.addEventListener("load", resolve, { once: true })
      existing.addEventListener("error", reject, { once: true })
    })
    return !!window.google?.maps?.places?.Autocomplete
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.id = "admin-google-maps-script"
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })

  return !!window.google?.maps?.places?.Autocomplete
}

export default function EditRestaurant() {
  const { id: paramId } = useParams()
  const { isSingleVendor, defaultRestaurantId } = usePlatformMode()
  const id = paramId || (isSingleVendor ? defaultRestaurantId : '')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [savingDetails, setSavingDetails] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)
  const [error, setError] = useState("")

  const [restaurant, setRestaurant] = useState(null)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)

  const [detailsForm, setDetailsForm] = useState(() => normalizeDetailsFormFromRestaurant(null))
  const [newStaffName, setNewStaffName] = useState("")
  const [newStaffPhone, setNewStaffPhone] = useState("")
  const [newStaffRole, setNewStaffRole] = useState("manager")

  const handleAddStaffAccount = () => {
    const trimmedPhone = String(newStaffPhone || "").trim()
    if (!trimmedPhone) {
      alert("Please enter a phone number for the staff account")
      return
    }
    const digits = trimmedPhone.replace(/\D/g, "")
    if (digits.length < 7) {
      alert("Please enter a valid phone number (at least 7 digits)")
      return
    }
    setDetailsForm((p) => ({
      ...p,
      authorizedLogins: [
        ...(p.authorizedLogins || []),
        {
          name: newStaffName.trim() || "Staff Member",
          phone: trimmedPhone,
          role: newStaffRole || "staff",
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    setNewStaffName("")
    setNewStaffPhone("")
    setNewStaffRole("manager")
  }
  const [locationForm, setLocationForm] = useState(() => normalizeLocationFormFromRestaurant(null))
  const [locationError, setLocationError] = useState("")
  const [detectingLocation, setDetectingLocation] = useState(false)

  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const zonesRef = useRef(zones)

  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  const restaurantId = useMemo(() => {
    if (id) return id
    return normalizeRestaurantId(restaurant)
  }, [id, restaurant])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!restaurantId) return
      try {
        setLoading(true)
        setError("")

        const res = await adminAPI.getRestaurantById(restaurantId)
        const data = res?.data?.data || null
        if (!mounted) return
        if (!res?.data?.success || !data) {
          setError(res?.data?.message || "Failed to load restaurant")
          setRestaurant(null)
          return
        }

        const normLoc = normalizeLocationFormFromRestaurant(data)
        setRestaurant(data)
        setDetailsForm(normalizeDetailsFormFromRestaurant(data))
        setLocationForm(normLoc)
        if (locationSearchInputRef.current && normLoc.formattedAddress) {
          locationSearchInputRef.current.value = normLoc.formattedAddress
        }
      } catch (e) {
        debugError(e)
        if (!mounted) return
        setError(e?.response?.data?.message || "Failed to load restaurant")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [restaurantId])

  useEffect(() => {
    let mounted = true
    setZonesLoading(true)
    adminAPI
      .getZones({ limit: 1000 })
      .then((res) => {
        const list =
          res?.data?.data?.zones ||
          res?.data?.data?.data?.zones ||
          res?.data?.data ||
          []
        if (!mounted) return
        const finalZones = Array.isArray(list) ? list : []
        setZones(finalZones)
        setLocationForm((prev) => {
          if (!prev.zoneId && finalZones.length === 1) {
            return { ...prev, zoneId: normalizeZoneId(finalZones[0]._id || finalZones[0].id) }
          }
          return prev
        })
      })
      .catch(() => {
        if (!mounted) return
        setZones([])
      })
      .finally(() => {
        if (!mounted) return
        setZonesLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!locationSearchInputRef.current) return
    if (placesAutocompleteRef.current) return

    let cancelled = false
    const init = async () => {
      setLocationError("")
      const loaded = await loadGooglePlaces()
      if (cancelled) return
      if (!loaded || !window.google?.maps?.places?.Autocomplete) {
        setLocationError("Unable to load Google Places Autocomplete.")
        return
      }

      placesAutocompleteRef.current = createPlacesAutocomplete(
        locationSearchInputRef.current,
        {
          fields: ["formatted_address", "address_components", "geometry"],
          // Omit `types: ["geocode"]` — that biases Autocomplete toward Geocoding API (geocode/json) traffic.
          componentRestrictions: { country: "in" },
        },
      )

      const parsePlace = (place) => {
        const formattedAddress = place?.formatted_address || ""
        const comps = Array.isArray(place?.address_components) ? place.address_components : []
        const get = (types) =>
          comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
        const area =
          get(["sublocality_level_1", "sublocality", "neighborhood"]) ||
          get(["locality"])
        const city =
          get(["locality"]) ||
          get(["administrative_area_level_2"])
        const state = get(["administrative_area_level_1"])
        const pincode = get(["postal_code"])
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()

        return {
          formattedAddress,
          area,
          city,
          state,
          pincode,
          latitude: Number.isFinite(lat) ? Number(lat.toFixed(6)) : "",
          longitude: Number.isFinite(lng) ? Number(lng.toFixed(6)) : "",
        }
      }

      placesAutocompleteRef.current.addListener("place_changed", () => {
        const place = placesAutocompleteRef.current.getPlace()
        const parsed = parsePlace(place)
        setLocationForm((prev) => {
          let nextZoneId = prev.zoneId
          if (parsed.latitude && parsed.longitude) {
            const matchingZone = findZoneForPoint(zonesRef.current, parsed.latitude, parsed.longitude)
            if (matchingZone) {
              nextZoneId = normalizeZoneId(matchingZone._id || matchingZone.id)
            } else if (!nextZoneId && zonesRef.current.length === 1) {
              nextZoneId = normalizeZoneId(zonesRef.current[0]._id || zonesRef.current[0].id)
            }
          }
          return {
            ...prev,
            zoneId: nextZoneId,
            formattedAddress: parsed.formattedAddress || prev.formattedAddress,
            addressLine1: parsed.formattedAddress || prev.addressLine1,
            area: parsed.area || prev.area,
            city: parsed.city || prev.city,
            state: parsed.state || prev.state,
            pincode: parsed.pincode || prev.pincode,
            latitude: parsed.latitude !== "" ? parsed.latitude : prev.latitude,
            longitude: parsed.longitude !== "" ? parsed.longitude : prev.longitude,
          }
        })
      })
    }

    requestAnimationFrame(init)
    return () => {
      cancelled = true
      placesAutocompleteRef.current?.dispose?.()
      placesAutocompleteRef.current = null
    }
  }, [])

  const [creatingZone, setCreatingZone] = useState(false)

  const handleQuickCreateZone = async () => {
    const lat = Number(locationForm.latitude)
    const lng = Number(locationForm.longitude)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Please enter or detect coordinates first (e.g. click 'Use Current Location')")
      return
    }

    try {
      setCreatingZone(true)
      const defaultName = `${locationForm.city || locationForm.area || "Ariston"} Delivery Zone`
      const zoneName = window.prompt("Enter name for the new Delivery Zone:", defaultName)
      if (!zoneName || !zoneName.trim()) {
        setCreatingZone(false)
        return
      }

      // Generate ~20km radius circle polygon (12 points) around coordinates
      const coords = []
      const radiusKm = 20
      const earthRadiusKm = 6371
      const rad = radiusKm / earthRadiusKm
      const latRad = (lat * Math.PI) / 180
      const lngRad = (lng * Math.PI) / 180
      const numPoints = 12

      for (let i = 0; i < numPoints; i++) {
        const bearing = (2 * Math.PI * i) / numPoints
        const pointLatRad = Math.asin(
          Math.sin(latRad) * Math.cos(rad) +
          Math.cos(latRad) * Math.sin(rad) * Math.cos(bearing)
        )
        const pointLngRad = lngRad + Math.atan2(
          Math.sin(bearing) * Math.sin(rad) * Math.cos(latRad),
          Math.cos(rad) - Math.sin(latRad) * Math.sin(pointLatRad)
        )
        coords.push({
          latitude: Number(((pointLatRad * 180) / Math.PI).toFixed(6)),
          longitude: Number(((pointLngRad * 180) / Math.PI).toFixed(6)),
        })
      }

      const payload = {
        name: zoneName.trim(),
        zoneName: zoneName.trim(),
        serviceLocation: locationForm.city || locationForm.area || "City",
        country: "India",
        unit: "kilometer",
        coordinates: coords,
        isActive: true,
      }

      const res = await adminAPI.createZone(payload)
      const created = res?.data?.data?.zone || res?.data?.data || null
      if (created) {
        const newZoneId = normalizeZoneId(created._id || created.id)
        setZones((prev) => [...prev, created])
        setLocationForm((prev) => ({ ...prev, zoneId: newZoneId }))
        alert(`Zone "${zoneName.trim()}" created and selected!`)
      }
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || "Failed to create zone")
    } finally {
      setCreatingZone(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    try {
      setDetectingLocation(true)
      setLocationError("")
      const coords = await getFreshGpsCoordinates()
      const lat = Number(coords.latitude)
      const lng = Number(coords.longitude)

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Unable to read valid GPS coordinates from device.")
      }

      const geo = await reverseGeocodeWithGoogle(lat, lng)

      const formattedAddress = geo.formattedAddress || geo.address || geo.mainTitle || ""
      const area = geo.area || ""
      const city = geo.city || ""
      const state = geo.state || ""
      const pincode = geo.pincode || ""

      let matchedZoneId = locationForm.zoneId
      const matchedZone = findZoneForPoint(zonesRef.current, lat, lng)
      if (matchedZone) {
        matchedZoneId = normalizeZoneId(matchedZone._id || matchedZone.id)
      } else if (!matchedZoneId && zonesRef.current.length === 1) {
        matchedZoneId = normalizeZoneId(zonesRef.current[0]._id || zonesRef.current[0].id)
      }

      setLocationForm((prev) => ({
        ...prev,
        zoneId: matchedZoneId || prev.zoneId,
        formattedAddress: formattedAddress || prev.formattedAddress,
        addressLine1: formattedAddress || prev.addressLine1,
        area: area || prev.area,
        city: city || prev.city,
        state: state || prev.state,
        pincode: pincode || prev.pincode,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      }))

      if (locationSearchInputRef.current) {
        locationSearchInputRef.current.value = formattedAddress
      }
    } catch (err) {
      debugError("Current location detection failed:", err)
      setLocationError(
        err?.message ||
          "Failed to detect current location. Please allow browser location access or search the address manually."
      )
    } finally {
      setDetectingLocation(false)
    }
  }

  const currentZoneLabel = useMemo(() => {
    const zid = normalizeZoneId(locationForm.zoneId)
    if (!zid) return ""
    const z = zones.find((x) => normalizeZoneId(x?._id || x?.id) === zid)
    return z?.name || z?.zoneName || ""
  }, [locationForm.zoneId, zones])

  const handleSaveDetails = async () => {
    if (!restaurantId) return
    try {
      setSavingDetails(true)

      const cuisines = String(detailsForm.cuisinesText || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)

      const payload = {
        name: detailsForm.name,
        pureVegRestaurant: detailsForm.pureVegRestaurant === true,
        ownerName: detailsForm.ownerName,
        ownerEmail: detailsForm.ownerEmail,
        ownerPhone: detailsForm.ownerPhone,
        primaryContactNumber: detailsForm.primaryContactNumber,
        email: detailsForm.email,
        primaryEmail: detailsForm.email,
        cuisines,
        estimatedDeliveryTimeMinutes:
          detailsForm.estimatedDeliveryTimeMinutes === ""
            ? undefined
            : Number(detailsForm.estimatedDeliveryTimeMinutes),
        offer: detailsForm.offer,
        openingTime: detailsForm.openingTime,
        closingTime: detailsForm.closingTime,
        isActive: detailsForm.isActive !== false,
        takeawaySettings: {
          isEnabled: detailsForm.takeawayEnabled === true,
        },
        authorizedLogins: detailsForm.authorizedLogins || [],
      }

      const res = await adminAPI.updateRestaurant(restaurantId, payload)
      const updated = res?.data?.data?.restaurant || res?.data?.data || null
      if (updated) {
        setRestaurant((prev) => ({ ...(prev || {}), ...updated }))
        setDetailsForm(normalizeDetailsFormFromRestaurant({ ...restaurant, ...updated }))
      }
      alert("Restaurant details updated successfully")
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to update restaurant details")
    } finally {
      setSavingDetails(false)
    }
  }

  const handleSaveLocation = async () => {
    if (!restaurantId) return

    const latitude = Number(locationForm.latitude)
    const longitude = Number(locationForm.longitude)

    if (!locationForm.zoneId) {
      alert("Please select a zone")
      return
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !locationForm.formattedAddress) {
      alert("Please select a location from dropdown")
      return
    }

    try {
      setSavingLocation(true)
      const payload = {
        zoneId: locationForm.zoneId,
        latitude,
        longitude,
        coordinates: [longitude, latitude],
        formattedAddress: locationForm.formattedAddress || "",
        address: locationForm.formattedAddress || "",
        addressLine1: locationForm.addressLine1 || locationForm.formattedAddress || "",
        addressLine2: locationForm.addressLine2 || "",
        area: locationForm.area || "",
        city: locationForm.city || "",
        state: locationForm.state || "",
        landmark: locationForm.landmark || "",
        pincode: locationForm.pincode || "",
        zipCode: locationForm.pincode || "",
        postalCode: locationForm.pincode || "",
      }

      const res = await adminAPI.updateRestaurantLocation(restaurantId, payload)
      const updatedRestaurant = res?.data?.data?.restaurant || null
      if (updatedRestaurant) {
        setRestaurant((prev) => ({ ...(prev || {}), ...updatedRestaurant }))
      }
      alert("Restaurant location updated successfully")
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to update restaurant location")
    } finally {
      setSavingLocation(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/food/restaurants")}
              className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Edit Restaurant</h1>
              <p className="text-sm text-slate-500">
                {restaurant?.name || restaurant?.restaurantName || restaurantId}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Basic Details</h2>
                <Button onClick={handleSaveDetails} disabled={savingDetails}>
                  {savingDetails ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Details"
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Restaurant Name</Label>
                  <Input value={detailsForm.name} onChange={(e) => setDetailsForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Pure Veg</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailsForm((p) => ({ ...p, pureVegRestaurant: true }))}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        detailsForm.pureVegRestaurant === true
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsForm((p) => ({ ...p, pureVegRestaurant: false }))}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        detailsForm.pureVegRestaurant === false
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Primary Email</Label>
                  <Input value={detailsForm.email} onChange={(e) => setDetailsForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Owner Name</Label>
                  <Input value={detailsForm.ownerName} onChange={(e) => setDetailsForm((p) => ({ ...p, ownerName: e.target.value }))} />
                </div>
                <div>
                  <Label>Owner Email</Label>
                  <Input value={detailsForm.ownerEmail} onChange={(e) => setDetailsForm((p) => ({ ...p, ownerEmail: e.target.value }))} />
                </div>
                <div>
                  <Label>Owner Phone</Label>
                  <Input value={detailsForm.ownerPhone} onChange={(e) => setDetailsForm((p) => ({ ...p, ownerPhone: e.target.value }))} />
                </div>
                <div>
                  <Label>Primary Contact Number</Label>
                  <Input value={detailsForm.primaryContactNumber} onChange={(e) => setDetailsForm((p) => ({ ...p, primaryContactNumber: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Cuisines (comma separated)</Label>
                  <Input value={detailsForm.cuisinesText} onChange={(e) => setDetailsForm((p) => ({ ...p, cuisinesText: e.target.value }))} />
                </div>
                <div>
                  <Label>Estimated Delivery Time (minutes)</Label>
                  <Input
                    type="number"
                    value={detailsForm.estimatedDeliveryTimeMinutes}
                    onChange={(e) => setDetailsForm((p) => ({ ...p, estimatedDeliveryTimeMinutes: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Offer</Label>
                  <Input value={detailsForm.offer} onChange={(e) => setDetailsForm((p) => ({ ...p, offer: e.target.value }))} />
                </div>
                <div>
                  <Label>Takeaway (Pickup) Enabled</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailsForm((p) => ({ ...p, takeawayEnabled: true }))}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        detailsForm.takeawayEnabled === true
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      Enabled
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsForm((p) => ({ ...p, takeawayEnabled: false }))}
                      className={`px-3 py-1.5 text-xs rounded-full border ${
                        detailsForm.takeawayEnabled === false
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      Disabled
                    </button>
                  </div>
                </div>

                {/* Authorized Logins / Staff Accounts Section */}
                <div className="md:col-span-2 pt-6 border-t border-slate-200 mt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>Authorized Restaurant Accounts (Staff & Managers)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        In Single-Vendor mode, public signup is disabled. Only the Owner and accounts created below can log in to the Restaurant App.
                      </p>
                    </div>
                  </div>

                  {/* Existing staff accounts list */}
                  <div className="space-y-2 mb-4">
                    {/* Primary Owner Account (from ownerPhone) */}
                    <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                          OWN
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{detailsForm.ownerName || "Owner"} (Primary Account)</p>
                          <p className="text-slate-600">{detailsForm.ownerPhone || "Configure owner phone above"}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full uppercase">
                        Primary Owner
                      </span>
                    </div>

                    {/* Additional staff accounts */}
                    {(detailsForm.authorizedLogins || []).map((staff, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 text-xs shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                            {staff.role?.[0]?.toUpperCase() || "S"}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{staff.name || "Staff Member"}</p>
                            <p className="text-slate-500 font-mono">{staff.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                            {staff.role || "staff"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDetailsForm((p) => ({
                                ...p,
                                authorizedLogins: (p.authorizedLogins || []).filter((_, i) => i !== idx),
                              }))
                            }}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            title="Remove account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline Add Staff Account Form */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <p className="text-xs font-semibold text-slate-800 mb-2">Create / Authorize New Staff Account</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        placeholder="Staff Name (e.g. Kitchen Head)"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        className="text-xs bg-white"
                      />
                      <Input
                        placeholder="Mobile (e.g. +91 9876543210)"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        className="text-xs bg-white"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newStaffRole}
                          onChange={(e) => setNewStaffRole(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="manager">Manager</option>
                          <option value="kitchen">Kitchen / Orders</option>
                          <option value="cashier">Cashier</option>
                          <option value="staff">Staff</option>
                        </select>
                        <Button
                          type="button"
                          onClick={handleAddStaffAccount}
                          className="text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Account
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Location</h2>
                  {currentZoneLabel ? (
                    <p className="text-xs text-slate-500 mt-1">Current Zone: {currentZoneLabel}</p>
                  ) : null}
                </div>
                <Button onClick={handleSaveLocation} disabled={savingLocation}>
                  {savingLocation ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Location"
                  )}
                </Button>
              </div>

              {locationError ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {locationError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Label className="mb-0">Service Zone</Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleQuickCreateZone}
                        disabled={creatingZone}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                        title="Generate a delivery polygon around current coordinates"
                      >
                        {creatingZone ? (
                          <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                        ) : (
                          <Plus className="w-3 h-3 text-blue-600" />
                        )}
                        <span>Quick-create zone from location</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/admin/food/zone-setup")}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        Zone Setup
                      </button>
                    </div>
                  </div>
                  <select
                    value={locationForm.zoneId || ""}
                    onChange={(e) => setLocationForm((p) => ({ ...p, zoneId: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={zonesLoading}
                  >
                    <option value="">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
                    {zones.map((z) => {
                      const zid = normalizeZoneId(z?._id || z?.id)
                      const label = z?.name || z?.zoneName || zid
                      return (
                        <option key={zid} value={zid}>
                          {label}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Label className="text-sm font-medium text-slate-700 mb-0">Search location</Label>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={detectingLocation}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
                      title="Fetch current location via device GPS"
                    >
                      {detectingLocation ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <LocateFixed className="w-3.5 h-3.5 text-blue-600" />
                      )}
                      <span>{detectingLocation ? "Detecting GPS..." : "Use Current Location"}</span>
                    </button>
                  </div>
                  <Input
                    ref={locationSearchInputRef}
                    placeholder="Start typing your restaurant address or click 'Use Current Location'..."
                    className="bg-white text-sm text-black! dark:text-white! placeholder:text-gray-500 dark:placeholder:text-gray-400 caret-black dark:caret-white"
                    style={{ color: "#000", WebkitTextFillColor: "#000" }}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Select a suggestion from the dropdown, or click &quot;Use Current Location&quot; to auto-detect coordinates and address.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <Label>Formatted Address</Label>
                  <Input
                    value={locationForm.formattedAddress}
                    onChange={(e) => setLocationForm((p) => ({ ...p, formattedAddress: e.target.value, addressLine1: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="Full street address..."
                  />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input
                    value={locationForm.area}
                    onChange={(e) => setLocationForm((p) => ({ ...p, area: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="Area / Locality"
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={locationForm.city}
                    onChange={(e) => setLocationForm((p) => ({ ...p, city: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={locationForm.state}
                    onChange={(e) => setLocationForm((p) => ({ ...p, state: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="State"
                  />
                </div>
                <div>
                  <Label>Pincode</Label>
                  <Input
                    value={locationForm.pincode}
                    onChange={(e) => setLocationForm((p) => ({ ...p, pincode: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="Pincode"
                  />
                </div>
                <div>
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={locationForm.latitude}
                    onChange={(e) => {
                      const lat = e.target.value === "" ? "" : Number(e.target.value)
                      setLocationForm((p) => {
                        let zid = p.zoneId
                        if (Number.isFinite(lat) && Number.isFinite(Number(p.longitude))) {
                          const m = findZoneForPoint(zonesRef.current, lat, Number(p.longitude))
                          if (m) zid = normalizeZoneId(m._id || m.id)
                        }
                        return { ...p, latitude: lat, zoneId: zid }
                      })
                    }}
                    className="mt-1 bg-white font-mono text-xs"
                    placeholder="e.g. 22.7196"
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={locationForm.longitude}
                    onChange={(e) => {
                      const lng = e.target.value === "" ? "" : Number(e.target.value)
                      setLocationForm((p) => {
                        let zid = p.zoneId
                        if (Number.isFinite(Number(p.latitude)) && Number.isFinite(lng)) {
                          const m = findZoneForPoint(zonesRef.current, Number(p.latitude), lng)
                          if (m) zid = normalizeZoneId(m._id || m.id)
                        }
                        return { ...p, longitude: lng, zoneId: zid }
                      })
                    }}
                    className="mt-1 bg-white font-mono text-xs"
                    placeholder="e.g. 75.8577"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Landmark</Label>
                  <Input
                    value={locationForm.landmark}
                    onChange={(e) => setLocationForm((p) => ({ ...p, landmark: e.target.value }))}
                    className="mt-1 bg-white"
                    placeholder="Nearby landmark or building"
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

