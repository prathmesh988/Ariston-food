import React, { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Star,
  Heart,
  Plus,
  Check,
  Clock,
  RotateCcw,
  ChevronRight,
  ArrowRight,
  Loader2,
  ShoppingBag,
  Sparkles,
} from "lucide-react"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { usePlatformMode } from "@food/hooks/usePlatformMode"
import { orderAPI, restaurantAPI } from "@food/api"
import { toast } from "sonner"
import dishFallbackImage from "@food/assets/placeholders/dish_fallback.webp"

/**
 * Parse preparation time or delivery time range into { min, max, isRange }.
 * Handles:
 * - "10-15 mins", "10-15", "10 - 15 min", "12 to 15" -> { min: 10, max: 15, isRange: true }
 * - "15 mins", "15 min", "15", 15 -> { min: 15, max: 15, isRange: false }
 * - "25-35 mins" -> { min: 25, max: 35, isRange: true }
 */
export const parseTimeRange = (rawTime) => {
  if (rawTime === null || rawTime === undefined) return null
  const str = String(rawTime).trim()
  if (!str) return null

  // 1. Try range format e.g. "10-15 mins", "10 - 15", "10 to 15"
  const rangeMatch = str.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/i)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10)
    const max = parseInt(rangeMatch[2], 10)
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
        isRange: true,
      }
    }
  }

  // 2. Try single number e.g. "15 mins", "15", 15
  const singleMatch = str.match(/(\d+)/)
  if (singleMatch) {
    const val = parseInt(singleMatch[1], 10)
    if (Number.isFinite(val)) {
      return { min: val, max: val, isRange: false }
    }
  }

  return null
}

/**
 * Checks if a dish strictly qualifies for "Food in 15 Minutes":
 * - Must have a valid time range
 * - The upper bound (max time) must be <= 15 minutes (e.g. 10-15 mins, 5-10 mins, <= 15 mins)
 * - Items with time ranges exceeding 15 (e.g. 15-20 mins, 25-35 mins, 30 mins) or missing time are strictly excluded
 */
export const isFoodIn15Minutes = (rawTime) => {
  const parsed = parseTimeRange(rawTime)
  if (!parsed) return false
  return parsed.max <= 15
}

/**
 * Check if the user is currently authenticated with a valid token
 */
const isUserAuthenticated = () => {
  if (typeof window === "undefined") return false
  try {
    const authCustomer = localStorage.getItem("auth_customer")
    if (authCustomer) return true
    return Boolean(
      localStorage.getItem("user_accessToken") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("user_authenticated") === "true"
    )
  } catch {
    return false
  }
}

/**
 * QuickDeliveryTabsSection
 * Two tabs: "REORDER" and "FOOD IN 15 MINS" matching the Swiggy/reference screenshot layout.
 *
 * Strict constraint:
 * - NO fake / mock data in cards (no hardcoded dishes or fake promotional discounts).
 * - "REORDER" logic and item overall detail logic matches http://localhost:5173/user/orders (Orders.jsx).
 * - "FOOD IN 15 MINS" strictly surfaces real menu items with fast preparation time or quick categories.
 */
export default function QuickDeliveryTabsSection({
  restaurant = null,
  restaurants = [],
  onItemClick = null,
  className = "",
}) {
  const navigate = useNavigate()
  const { addToCart, replaceCart } = useCart()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()
  const { isSingleVendor, defaultRestaurantId } = usePlatformMode()

  const [activeTab, setActiveTab] = useState("reorder") // "reorder" | "food15"
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [fetchedMenuItems, setFetchedMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [addedItems, setAddedItems] = useState({})
  const scrollContainerRef = useRef(null)

  const isAuth = isUserAuthenticated()

  // 1. Fetch real orders from orderAPI (exact logic from Orders.jsx)
  useEffect(() => {
    let isMounted = true
    if (!isAuth) {
      setOrders([])
      setLoadingOrders(false)
      return
    }

    const FETCH_LIMIT = 100

    const fetchAllOrders = async () => {
      try {
        setLoadingOrders(true)
        const firstResponse = await orderAPI.getOrders({
          limit: FETCH_LIMIT,
          page: 1,
        })

        let firstPageOrders = []
        let totalPages = 1

        if (firstResponse?.data?.success && firstResponse?.data?.data?.orders) {
          firstPageOrders = firstResponse.data.data.orders || []
          totalPages = firstResponse.data.data?.pagination?.pages || 1
        } else if (firstResponse?.data?.orders) {
          firstPageOrders = firstResponse.data.orders || []
          totalPages = firstResponse.data?.pagination?.pages || 1
        } else if (firstResponse?.data?.data && Array.isArray(firstResponse.data.data)) {
          firstPageOrders = firstResponse.data.data || []
        }

        let allOrders = [...firstPageOrders]

        if (totalPages > 1) {
          const pagePromises = []
          for (let p = 2; p <= Math.min(totalPages, 3); p += 1) {
            pagePromises.push(orderAPI.getOrders({ limit: FETCH_LIMIT, page: p }))
          }
          const pageResponses = await Promise.all(pagePromises)
          pageResponses.forEach((resp) => {
            const list = resp?.data?.data?.orders || resp?.data?.orders || (Array.isArray(resp?.data?.data) ? resp.data.data : [])
            if (Array.isArray(list)) allOrders.push(...list)
          })
        }

        if (!isMounted) return

        // Transform API orders to match UI structure identically to Orders.jsx
        const transformedOrders = allOrders.map((order) => {
          const createdAt = order.createdAt ? new Date(order.createdAt) : new Date()
          const backendStatus = order.orderStatus || order.status
          const isCancelled =
            backendStatus === "cancelled" ||
            backendStatus === "cancelled_by_user" ||
            backendStatus === "cancelled_by_restaurant" ||
            backendStatus === "cancelled_by_admin"

          const restaurantRating = order.ratings?.restaurant?.rating || null

          return {
            id: order._id?.toString() || order.orderId || `ORD-${order._id}`,
            mongoId: order._id,
            orderId: order.orderId || order._id?.toString(),
            status: backendStatus,
            isCancelled,
            createdAt: createdAt.toISOString(),
            address: order.address || order.deliveryAddress || {},
            items: (order.items || []).map((item) => ({
              itemId: item.itemId || item._id || item.id,
              name: item.name || item.foodName || "Item",
              variantName: item.variantName || "",
              quantity: item.quantity || 1,
              price: Number(item.price) || 0,
              image: item.image || null,
              description: item.description || null,
              isVeg:
                item.isVeg === true ||
                item.foodType === "Veg" ||
                item.category === "veg" ||
                item.type === "veg",
              _id: item._id || item.id,
              id: item.id || item._id,
              isBogoFree: item.isBogoFree || false,
            })),
            total: order.pricing?.total || order.total || 0,
            subtotal: order.pricing?.subtotal || 0,
            pricing: order.pricing || {},
            restaurant:
              order.restaurantId?.restaurantName ||
              order.restaurantId?.name ||
              order.restaurantName ||
              (isSingleVendor ? "Ariston Cafe" : "Restaurant"),
            restaurantId: order.restaurantId?._id || order.restaurantId || (isSingleVendor ? defaultRestaurantId : null),
            restaurantSlug: order.restaurantId?.slug || null,
            restaurantImage:
              order.restaurantId?.profileImage?.url ||
              order.restaurantId?.profileImage ||
              null,
            restaurantRating,
            rating: restaurantRating || null,
            estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
            preparationTime: order.preparationTime || 0,
            orderType: order.orderType || "delivery",
          }
        })

        // Sort newest first
        transformedOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        setOrders(transformedOrders)
      } catch {
        if (isMounted) setOrders([])
      } finally {
        if (isMounted) setLoadingOrders(false)
      }
    }

    fetchAllOrders()

    return () => {
      isMounted = false
    }
  }, [isAuth, isSingleVendor, defaultRestaurantId])

  // 2. Fetch real menu items if not already passed in props (for FOOD IN 15 MINS)
  useEffect(() => {
    let isMounted = false
    const existingSections = restaurant?.menuSections
    if (Array.isArray(existingSections) && existingSections.length > 0) return

    const targetRestaurantId =
      restaurant?._id ||
      restaurant?.id ||
      (isSingleVendor ? defaultRestaurantId : restaurants[0]?._id || restaurants[0]?.id)

    if (!targetRestaurantId) return

    isMounted = true
    const fetchMenu = async () => {
      try {
        setLoadingMenu(true)
        const res = await restaurantAPI.getMenuByRestaurantId(targetRestaurantId)
        const menuData = res?.data?.data?.menu || res?.data?.menu || res?.data?.data
        const sections = menuData?.sections || menuData?.menuSections || []

        if (Array.isArray(sections) && sections.length > 0 && isMounted) {
          const extracted = []
          sections.forEach((sec) => {
            const secName = sec.name || sec.title || "Menu"
            ;(sec.items || []).forEach((item) => {
              extracted.push({
                ...item,
                category: secName,
                restaurantId: targetRestaurantId,
                restaurant: restaurant?.name || "Ariston Cafe",
              })
            })
            ;(sec.subsections || []).forEach((sub) => {
              const subName = sub.name || secName
              ;(sub.items || []).forEach((item) => {
                extracted.push({
                  ...item,
                  category: subName,
                  restaurantId: targetRestaurantId,
                  restaurant: restaurant?.name || "Ariston Cafe",
                })
              })
            })
          })
          setFetchedMenuItems(extracted)
        }
      } catch {
        if (isMounted) setFetchedMenuItems([])
      } finally {
        if (isMounted) setLoadingMenu(false)
      }
    }

    fetchMenu()
    return () => {
      isMounted = false
    }
  }, [restaurant, restaurants, isSingleVendor, defaultRestaurantId])

  // 3. Extract items from restaurant prop if passed
  const propMenuItems = useMemo(() => {
    if (!restaurant?.menuSections || !Array.isArray(restaurant.menuSections)) return []
    const list = []
    restaurant.menuSections.forEach((section) => {
      const secName = section.title || section.name || "Special"
      ;(section.items || []).forEach((item) => {
        list.push({
          ...item,
          category: secName,
          restaurantId: restaurant._id || restaurant.id,
          restaurant: restaurant.name || "Ariston Cafe",
        })
      })
      ;(section.subsections || []).forEach((sub) => {
        const subName = sub.name || secName
        ;(sub.items || []).forEach((item) => {
          list.push({
            ...item,
            category: subName,
            restaurantId: restaurant._id || restaurant.id,
            restaurant: restaurant.name || "Ariston Cafe",
          })
        })
      })
    })
    return list
  }, [restaurant])

  const allAvailableMenuItems = useMemo(() => {
    return propMenuItems.length > 0 ? propMenuItems : fetchedMenuItems
  }, [propMenuItems, fetchedMenuItems])

  // 4. Extract real reorder items from user's past orders (Orders.jsx logic)
  const reorderItemsList = useMemo(() => {
    if (!orders || orders.length === 0) return []

    const itemsList = []
    const seenNames = new Set()

    orders.forEach((order) => {
      // Exclude cancelled orders for reordering past successful dishes
      if (order.isCancelled) return

      ;(order.items || []).forEach((item, index) => {
        const itemId = item.itemId || item._id || item.id
        if (!itemId || item.isBogoFree) return

        const nameKey = String(item.name || "").trim().toLowerCase()
        if (!nameKey || seenNames.has(nameKey)) return
        seenNames.add(nameKey)

        // Real discount if any applied on order
        const discountPercentage = order.pricing?.discountPercentage || null
        const discountAmount = order.pricing?.discount || 0
        const offerBadge =
          discountPercentage && discountPercentage > 0
            ? `${discountPercentage}% OFF`
            : discountAmount > 0
            ? `₹${Math.round(discountAmount)} OFF`
            : null

        itemsList.push({
          id: itemId,
          itemId: itemId,
          name: item.name || "Item",
          variantName: item.variantName || "",
          price: Number(item.price) || 0,
          image: item.image || order.restaurantImage || dishFallbackImage,
          isVeg: item.isVeg !== false,
          description: item.description || "",
          restaurant: order.restaurant || (isSingleVendor ? "Ariston Cafe" : "Restaurant"),
          restaurantId: order.restaurantId || (isSingleVendor ? defaultRestaurantId : null),
          restaurantSlug: order.restaurantSlug,
          category: item.variantName || order.restaurant || "Past Order",
          rating: order.restaurantRating || order.rating || null,
          deliveryTime: order.estimatedDeliveryTime ? `${order.estimatedDeliveryTime} mins` : "15-20 mins",
          offer: offerBadge,
          orderRef: order,
          reorderIndex: index,
        })
      })
    })

    return itemsList
  }, [orders, isSingleVendor, defaultRestaurantId])

  // 5. Extract FOOD IN 15 MINS items (Strict real menu items matching the 15-minute time range)
  const foodIn15ItemsList = useMemo(() => {
    if (!allAvailableMenuItems || allAvailableMenuItems.length === 0) return []

    const qualifyingItems = []

    allAvailableMenuItems.forEach((item) => {
      // Must be available
      if (item.isAvailable === false) return

      // Check the time range from preparationTime or deliveryTime
      const rawTime = item.preparationTime || item.prepTime || item.deliveryTime
      const timeRange = parseTimeRange(rawTime)

      // STRICT TIME RANGE CHECK: Must have time range AND upper bound must be <= 15 minutes!
      if (!timeRange || timeRange.max > 15) {
        return
      }

      const itemId = String(item.id || item._id)
      const prepText = item.preparationTime
        ? `${item.preparationTime}${typeof item.preparationTime === "number" ? " mins" : ""}`
        : timeRange.isRange
        ? `${timeRange.min}-${timeRange.max} mins`
        : `${timeRange.max} mins`

      const discountPercentage = item.discountPercentage || item.discount || 0
      const offerBadge = discountPercentage > 0 ? `${discountPercentage}% OFF` : null

      qualifyingItems.push({
        id: itemId,
        itemId: itemId,
        name: item.name,
        category: item.categoryName || item.category || "Quick Bites",
        price: Number(item.price || item.basePrice || 0),
        rating: item.rating ? Number(item.rating).toFixed(1) : null,
        deliveryTime: prepText,
        preparationTime: timeRange.max,
        timeRange,
        offer: offerBadge,
        image: item.image || item.imageUrl || dishFallbackImage,
        isVeg: item.foodType === "Veg" || item.isVeg === true,
        restaurantId: item.restaurantId || (isSingleVendor ? defaultRestaurantId : restaurant?._id),
        restaurant: item.restaurant || (isSingleVendor ? "Ariston Cafe" : "Restaurant"),
      })
    })

    return qualifyingItems
  }, [allAvailableMenuItems, isSingleVendor, defaultRestaurantId, restaurant])

  // 6. Handle single item add/reorder to cart
  const handleAddToCart = (e, item) => {
    e.stopPropagation()
    const targetItem = {
      id: item.itemId || item.id,
      name: item.name,
      price: Number(item.price) || 0,
      image: item.image || "",
      restaurant: item.restaurant || (isSingleVendor ? "Ariston Cafe" : "Restaurant"),
      restaurantId: item.restaurantId || (isSingleVendor ? defaultRestaurantId : undefined),
      description: item.description || "",
      isVeg: item.isVeg !== false,
      quantity: 1,
    }
    addToCart(targetItem)
    setAddedItems((prev) => ({ ...prev, [item.id]: true }))
    toast.success(`Added ${item.name} to cart!`)
    setTimeout(() => {
      setAddedItems((prev) => ({ ...prev, [item.id]: false }))
    }, 1800)
  }

  // 7. Handle full order reorder (exact logic from Orders.jsx)
  const handleFullOrderReorder = (e, order) => {
    e.stopPropagation()
    const restaurantTarget = order.restaurantSlug || order.restaurantId || defaultRestaurantId

    if (!order.items?.length) {
      toast.info("Order items not available")
      return
    }

    const reorderItems = order.items
      .map((item, index) => {
        const itemId = item.id || item.itemId || item._id
        if (!itemId || item.isBogoFree) return null

        return {
          id: itemId,
          name: item.name || item.foodName || "Item",
          price: Number(item.price) || 0,
          image: item.image || "",
          restaurant: order.restaurant || (isSingleVendor ? "Ariston Cafe" : "Restaurant"),
          restaurantId: order.restaurantId || (isSingleVendor ? defaultRestaurantId : undefined),
          description: item.description || "",
          isVeg: item.isVeg !== false,
          quantity: Math.max(1, Number(item.quantity) || 1),
          reorderIndex: index,
        }
      })
      .filter(Boolean)

    if (!reorderItems.length) {
      toast.error("No reorderable items found in this order")
      return
    }

    replaceCart(reorderItems)
    toast.success("Items added to cart")
    if (restaurantTarget) {
      navigate(`/food/user/restaurants/${restaurantTarget}`)
    }
  }

  // 8. Toggle favorite
  const handleToggleFavorite = (e, item) => {
    e.stopPropagation()
    const favId = item.id || item.itemId || item.name
    if (isFavorite(favId)) {
      removeFavorite(favId)
    } else {
      addFavorite({ id: favId, name: item.name, image: item.image })
    }
  }

  // Current display items based on active tab
  const displayItems = activeTab === "reorder" ? reorderItemsList : foodIn15ItemsList
  const isLoading = activeTab === "reorder" ? loadingOrders : loadingMenu

  return (
    <section className={`w-full my-3 sm:my-4 ${className}`}>
      {/* Dual Tab Capsule Header (Matching Reference Screenshot) */}
      <div className="flex items-center justify-center mb-3.5 sm:mb-4 px-2">
        <div className="inline-flex items-center p-1 rounded-full bg-gray-100/90 dark:bg-zinc-800/90 border border-gray-200/80 dark:border-zinc-700/80 shadow-sm max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab("reorder")}
            className={`relative px-5 sm:px-7 py-2 rounded-full text-[11px] sm:text-xs font-black tracking-wider uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
              activeTab === "reorder"
                ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:white"
            }`}
          >
            REORDER
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("food15")}
            className={`relative px-4 sm:px-6 py-2 rounded-full text-[11px] sm:text-xs font-black tracking-wider uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
              activeTab === "food15"
                ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            FOOD IN 15 MINS
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-xs font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Loading {activeTab === "reorder" ? "past orders" : "quick food items"}...</span>
        </div>
      ) : activeTab === "reorder" && !isAuth ? (
        /* Unauthenticated Zero State for REORDER */
        <div className="mx-4 p-5 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mb-2">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Sign in to view past orders
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
            Log in to see your recently ordered dishes and reorder your favorites in a single tap.
          </p>
          <button
            type="button"
            onClick={() => navigate("/food/user/login")}
            className="mt-3 px-5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            Sign In
          </button>
        </div>
      ) : activeTab === "reorder" && displayItems.length === 0 ? (
        /* Authenticated but No Past Orders */
        <div className="mx-4 p-5 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mb-2">
            <RotateCcw className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            No past orders yet
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
            Once you order your favorite dishes, they will appear here so you can reorder them with one tap!
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("food15")}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <span>Explore Food in 15 Mins</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : activeTab === "food15" && displayItems.length === 0 ? (
        /* Empty State for FOOD IN 15 MINS */
        <div className="mx-4 p-5 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800 text-center flex flex-col items-center justify-center">
          <Clock className="w-8 h-8 text-gray-400 mb-2" />
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            No dishes under 15 minutes currently available
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
            All our current dishes are freshly prepared to order. Please browse the full menu below!
          </p>
        </div>
      ) : (
        /* Horizontal Carousel (Strictly Real Data, Zero Fake Cards) */
        <div
          ref={scrollContainerRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 pb-2 pt-1 -mx-4 sm:mx-0 scroll-smooth"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {displayItems.map((item, idx) => {
              const isFav = isFavorite(item.id || item.itemId || item.name)
              const isAdded = addedItems[item.id]

              return (
                <motion.div
                  key={`${activeTab}-${item.id || idx}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.22, delay: idx * 0.02 }}
                  onClick={() => {
                    if (onItemClick) {
                      onItemClick(item)
                    } else if (item.orderRef) {
                      navigate(`/user/orders/${item.orderRef.id}/details`)
                    } else if (item.restaurantId) {
                      navigate(`/food/user/restaurants/${item.restaurantSlug || item.restaurantId}`)
                    }
                  }}
                  className="flex-shrink-0 w-[142px] sm:w-[162px] md:w-[178px] group cursor-pointer"
                >
                  {/* Square Image Frame */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900">
                    <img
                      src={item.image || dishFallbackImage}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 select-none"
                      loading="lazy"
                      onError={(e) => {
                        if (e.currentTarget.src !== dishFallbackImage) {
                          e.currentTarget.src = dishFallbackImage
                        }
                      }}
                    />

                    {/* Top-Left: Real Veg/Non-Veg Icon */}
                    <div className="absolute top-2 left-2 z-10">
                      <div
                        className={`w-4 h-4 rounded bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border ${
                          item.isVeg ? "border-green-600" : "border-red-600"
                        } flex items-center justify-center p-[2px] shadow-sm`}
                      >
                        <div
                          className={`w-full h-full rounded-full ${
                            item.isVeg ? "bg-green-600" : "bg-red-600"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Top-Right: Favorite Heart */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, item)}
                      className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white hover:text-rose-500 active:scale-90 transition-all shadow-sm"
                      aria-label="Save dish"
                    >
                      <Heart
                        className={`h-3.5 w-3.5 transition-colors ${
                          isFav ? "fill-rose-500 text-rose-500" : "text-white"
                        }`}
                      />
                    </button>

                    {/* Bottom Image Overlay: Only rendered when REAL offer exists */}
                    {item.offer ? (
                      <div className="absolute inset-x-0 bottom-0 pt-6 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end text-white z-10 pointer-events-none">
                        <p className="text-[11px] sm:text-[12px] font-black uppercase tracking-tight leading-tight text-white drop-shadow-md">
                          {item.offer}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Info Section Below Image */}
                  <div className="pt-2 px-0.5 flex flex-col">
                    {/* Dish / Restaurant Title */}
                    <h4 className="text-[12px] sm:text-[13px] font-bold text-gray-900 dark:text-white truncate leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {item.name}
                    </h4>

                    {/* Rating & Delivery Time */}
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-1 font-medium">
                      {item.rating ? (
                        <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px] sm:text-[10px] leading-none shrink-0 shadow-xs">
                          <Star className="h-2.5 w-2.5 fill-white text-white" />
                          <span>{item.rating}</span>
                        </div>
                      ) : null}
                      {item.rating && item.deliveryTime ? <span>•</span> : null}
                      {item.deliveryTime ? (
                        <span className="truncate">{item.deliveryTime}</span>
                      ) : null}
                    </div>

                    {/* Category and Price Row with 1-Tap ADD / REORDER Button */}
                    <div className="flex items-center justify-between mt-1.5 pt-0.5">
                      <div className="flex flex-col min-w-0 pr-1">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-none">
                          {item.category || (isSingleVendor ? "Ariston Cafe" : "Delicious Dish")}
                        </span>
                        <span className="text-xs font-black text-gray-900 dark:text-white mt-1">
                          ₹{item.price}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleAddToCart(e, item)}
                        className={`h-7 px-2.5 sm:px-3 rounded-lg border font-black text-[10px] sm:text-[11px] uppercase tracking-wider transition-all duration-200 active:scale-90 flex items-center justify-center shrink-0 shadow-xs cursor-pointer ${
                          isAdded
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-600 hover:text-white"
                        }`}
                      >
                        {isAdded ? (
                          <span className="flex items-center gap-1">
                            <Check className="h-3 w-3" /> ADDED
                          </span>
                        ) : activeTab === "reorder" ? (
                          "REORDER"
                        ) : (
                          "ADD"
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
