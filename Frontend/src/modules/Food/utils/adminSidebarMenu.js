export const adminSidebarMenu = [
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/food",
    icon: "LayoutDashboard",
  },
  {
    type: "link",
    label: "Point of Sale",
    path: "/admin/food/point-of-sale",
    icon: "CreditCard",
  },
  {
    type: "section",
    label: "MY RESTAURANT",
    modes: ["single_vendor"],
    items: [
      {
        type: "link",
        label: "Restaurant Profile & Timings",
        path: "/admin/food/my-restaurant/profile",
        icon: "Building2",
        modes: ["single_vendor"],
      },
      {
        type: "link",
        label: "Menu & Pricing",
        path: "/admin/food/foods",
        icon: "Utensils",
        modes: ["single_vendor"],
      },
      {
        type: "link",
        label: "Add-ons",
        path: "/admin/food/addons",
        icon: "Plus",
        modes: ["single_vendor"],
      },
      {
        type: "link",
        label: "Table Reservations",
        path: "/admin/food/dining-list",
        icon: "Calendar",
        modes: ["single_vendor"],
      },
    ],
  },
  {
    type: "section",
    label: "FOOD MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Food Approval",
        path: "/admin/food/food-approval",
        icon: "CheckCircle2",
        modes: ["marketplace"],
      },
      {
        type: "expandable",
        label: "Foods",
        icon: "Utensils",
        subItems: [
          { label: "Restaurant Foods List", path: "/admin/food/foods" },
          { label: "Restaurant Addons List", path: "/admin/food/addons" },
          { label: "Pricing Management", path: "/admin/food/pricing" },
        ],
      },
      {
        type: "expandable",
        label: "Categories",
        icon: "FolderTree",
        subItems: [{ label: "Category", path: "/admin/food/categories" }],
      },
    ],
  },
  {
    type: "section",
    label: "RESTAURANT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/food/zone-setup",
        icon: "MapPin",
      },
      {
        type: "expandable",
        label: "Restaurants",
        icon: "UtensilsCrossed",
        modes: ["marketplace"],
        subItems: [
          { label: "Restaurants List", path: "/admin/food/restaurants" },
          { label: "New Joining Request", path: "/admin/food/restaurants/joining-request" },
          { label: "Top Restaurants", path: "/admin/food/restaurants/top-restaurants" },
          { label: "Restaurant Commission", path: "/admin/food/restaurants/commission" },
          { label: "Restaurant Reviews", path: "/admin/food/restaurants/reviews" },
          { label: "Restaurant Complaints", path: "/admin/food/restaurants/complaints" },
          { label: "Restaurant Settings", path: "/admin/food/restaurants/settings" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All", path: "/admin/food/orders/all" },
          // { label: "Scheduled", path: "/admin/food/orders/scheduled" },
          { label: "Pending", path: "/admin/food/orders/pending" },
          { label: "Processing", path: "/admin/food/orders/processing" },
          { label: "Food On The Way", path: "/admin/food/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/food/orders/delivered" },
          { label: "Cancelled", path: "/admin/food/orders/canceled" },
          { label: "Restaurant cancelled", path: "/admin/food/orders/restaurant-cancelled" },
          { label: "Payment Failed", path: "/admin/food/orders/payment-failed" },
          { label: "Refunded", path: "/admin/food/orders/refunded" },
          { label: "Offline Payments", path: "/admin/food/orders/offline-payments" },
          { label: "Payment Recovery", path: "/admin/food/orders/payment-recovery" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/food/order-detect-delivery",
        icon: "Truck",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Coupons & Offers",
        path: "/admin/food/coupons",
        icon: "Gift",
      },
      {
        type: "link",
        label: "Combo Offers",
        path: "/admin/food/combo-offers",
        icon: "Package",
      },
      {
        type: "link",
        label: "Buy One Get One Offers",
        path: "/admin/food/bogo-offers",
        icon: "Award",
      },
    ],
  },
  // TODO: Referral feature temporarily disabled. Uncomment to re-enable in future.
  // {
  //   type: "section",
  //   label: "REFERRAL & REWARDS",
  //   items: [
  //     { type: "link", label: "Referral Settings", path: "/admin/food/referral-settings", icon: "Gift" },
  //   ],
  // },
  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/food/customers",
        icon: "Users",
      },
      {
        type: "link",
        label: "Ariston Cafe Diamond Member",
        path: "/admin/food/diamond",
        icon: "Gem",
      },
      {
        type: "link",
        label: "Support Tickets (User & Restaurant)",
        path: "/admin/food/support-tickets",
        icon: "MessageSquare",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERYMAN MANAGEMENT",
    items: [
      { type: "link", label: "Delivery Cash Limit", path: "/admin/food/delivery-cash-limit", icon: "IndianRupee" },
      { type: "link", label: "Multiorder Setting", path: "/admin/food/multiorder-setting", icon: "Package" },
      { type: "link", label: "Delivery & Platform Fee", path: "/admin/food/fee-settings", icon: "DollarSign" },
      { type: "link", label: "Cash Confirmations", path: "/admin/food/cash-confirmations", icon: "CheckCircle2" },
      { type: "link", label: "Cash limit settlement", path: "/admin/food/cash-limit-settlement", icon: "Receipt" },
      { type: "link", label: "Delivery Withdrawal", path: "/admin/food/delivery-withdrawal", icon: "Wallet" },
      { type: "link", label: "Delivery boy Wallet", path: "/admin/food/delivery-boy-wallet", icon: "PiggyBank" },
      { type: "link", label: "Delivery Boy Payout", path: "/admin/food/delivery-boy-commission", icon: "DollarSign" },
      { type: "link", label: "Delivery Emergency Help", path: "/admin/food/delivery-emergency-help", icon: "Phone" },
      { type: "link", label: "Delivery Support Tickets", path: "/admin/food/delivery-support-tickets", icon: "MessageSquare" },
      { type: "link", label: "Delivery Boy Refer & Earn", path: "/admin/food/delivery-referral", icon: "Gift" },
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "New Join Request", path: "/admin/food/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/food/delivery-partners" },
          { label: "Deliveryman Reviews", path: "/admin/food/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/food/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/food/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/food/delivery-partners/earning-addon-history" },
          { label: "Delivery Earning", path: "/admin/food/delivery-partners/earnings" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      { type: "link", label: "User Feedback", path: "/admin/food/contact-messages", icon: "Mail" },
      { type: "link", label: "Safety Emergency Reports", path: "/admin/food/safety-emergency-reports", icon: "AlertTriangle" },
    ],
  },
  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      { type: "link", label: "Transaction Report", path: "/admin/food/transaction-report", icon: "FileText" },
      { type: "link", label: "Order Report", path: "/admin/food/order-report/regular", icon: "FileText" },
      { type: "link", label: "Tax Report", path: "/admin/food/tax-report", icon: "Receipt" },
      {
        type: "expandable",
        label: "Restaurant Report",
        icon: "FileText",
        subItems: [{ label: "Restaurant Report", path: "/admin/food/restaurant-report" }],
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [{ label: "Feedback Experience", path: "/admin/food/customer-report/feedback-experience" }],
      },
    ],
  },
  {
    type: "section",
    label: "TRANSACTION MANAGEMENT",
    items: [
      { type: "link", label: "Restaurant Withdraws", path: "/admin/food/restaurant-withdraws", icon: "CreditCard", modes: ["marketplace"] },
    ],
  },
  {
    type: "section",
    label: "BANNER SETTINGS",
    items: [
      { type: "link", label: "Landing Page Management", path: "/admin/food/hero-banner-management", icon: "Image" },
      { type: "link", label: "All Login Pages", path: "/admin/food/login-pages", icon: "Image" },
    ],
  },
  {
    type: "section",
    label: "DINING MANAGEMENT",
    items: [
      { type: "link", label: "Dining Banners", path: "/admin/food/dining-management", icon: "UtensilsCrossed" },
      { type: "link", label: "Dining List", path: "/admin/food/dining-list", icon: "FileText" },
      { type: "link", label: "Dining Category Request", path: "/admin/food/dining-requests", icon: "CheckCircle", modes: ["marketplace"] },
    ],
  },
  {
    type: "section",
    label: "SYSTEM SETTINGS",
    items: [
      { type: "link", label: "Broadcast Notification", path: "/admin/food/broadcast-notification", icon: "Bell" },
      { type: "link", label: "Business Setup", path: "/admin/food/business-setup", icon: "Settings" },
      { type: "link", label: "Customization Settings", path: "/admin/food/customization-settings", icon: "Zap" },
      { type: "link", label: "Archived Accounts", path: "/admin/food/archived-accounts", icon: "UserX" },
    ],
  },
  {
    type: "section",
    label: "ADMIN ACCESS",
    items: [
      {
        type: "link",
        label: "Sub Admin List",
        path: "/admin/food/sub-admins",
        icon: "UserCog",
      },
    ],
  },
  {
    type: "section",
    label: "PAGES & SOCIAL MEDIA",
    items: [
      { type: "link", label: "About Us", path: "/admin/food/pages-social-media/about", icon: "Globe" },
      { type: "link", label: "Terms & Conditions", path: "/admin/food/pages-social-media/terms", icon: "FileText" },
      { type: "link", label: "Privacy Policy", path: "/admin/food/pages-social-media/privacy", icon: "Lock" },
      { type: "link", label: "Support", path: "/admin/food/pages-social-media/support", icon: "Headset" },
      { type: "link", label: "Refund Policy", path: "/admin/food/pages-social-media/refund", icon: "Receipt" },
      { type: "link", label: "Shipping Policy", path: "/admin/food/pages-social-media/shipping", icon: "Truck" },
      { type: "link", label: "Cancellation Policy", path: "/admin/food/pages-social-media/cancellation", icon: "FileX" },
    ],
  },
];

/**
 * Filter admin sidebar menu by deployment mode: 'marketplace' | 'single_vendor'.
 * Items without an explicit modes array default to ['marketplace', 'single_vendor'].
 */
export function filterSidebarMenuByMode(menu = adminSidebarMenu, mode = 'marketplace') {
  const currentMode = mode || 'marketplace';

  return menu.reduce((acc, item) => {
    if (item.modes && !item.modes.includes(currentMode)) {
      return acc;
    }

    if (item.type === "section") {
      const filteredItems = (item.items || []).reduce((subAcc, subItem) => {
        if (subItem.modes && !subItem.modes.includes(currentMode)) {
          return subAcc;
        }

        if (subItem.type === "expandable" && Array.isArray(subItem.subItems)) {
          const filteredSubItems = subItem.subItems.filter((si) => {
            if (!si.modes) return true;
            return si.modes.includes(currentMode);
          });
          if (filteredSubItems.length > 0) {
            subAcc.push({ ...subItem, subItems: filteredSubItems });
          }
        } else {
          subAcc.push(subItem);
        }
        return subAcc;
      }, []);

      if (filteredItems.length > 0) {
        acc.push({ ...item, items: filteredItems });
      }
    } else {
      acc.push(item);
    }
    return acc;
  }, []);
}

