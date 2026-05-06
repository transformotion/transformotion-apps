/**
 * Built-in Categorization Rules
 * 
 * These rules are stored in localStorage and can be modified by the user.
 * On first load, they're initialized from DEFAULT_BUILTIN_RULES.
 * Pattern is stored as a string and converted to RegExp at runtime.
 */

export interface BuiltinRule {
  id: string
  name: string
  pattern: string       // stored as string, converted to RegExp at runtime
  category: string
  subcategory: string
  isBusiness?: boolean
  enabled: boolean      // can be disabled by user
}

/**
 * Default built-in rules - used to initialize localStorage on first load
 * All 63 rules in priority order (lower index = higher priority)
 */
export const DEFAULT_BUILTIN_RULES: BuiltinRule[] = [
  // ============================================
  // TRANSFER RULES (Highest Priority - Must be first)
  // ============================================
  { id: "transfer-1", name: "Payment Thank", pattern: "payment thank", category: "Financial & Insurance", subcategory: "Transfer", enabled: true },
  { id: "transfer-2", name: "Credit Card Payment", pattern: "credit card payment|cc payment|visa payment|anz credit|mastercard payment", category: "Financial & Insurance", subcategory: "Transfer", enabled: true },
  { id: "transfer-3", name: "Internal Transfer", pattern: "^(from|to) .*(internal transfer|linked account)", category: "Financial & Insurance", subcategory: "Transfer", enabled: true },
  { id: "transfer-4", name: "Hawkins Transfer", pattern: "hawkins", category: "Financial & Insurance", subcategory: "Transfer", enabled: true },
  { id: "transfer-5", name: "Bank Transfer", pattern: "commonwealth bank|commbank|nab |westpac|anz bank", category: "Financial & Insurance", subcategory: "Transfer", enabled: true },

  // ============================================
  // GROCERIES
  // ============================================
  { id: "grocery-1", name: "Supermarket", pattern: "woolworths|coles|aldi|ww metro|mega fresh", category: "Groceries", subcategory: "Supermarket", enabled: true },
  { id: "grocery-2", name: "Deli & Bakery", pattern: "bakers delight|wellington bakery|rainbow beach bakery|brumby|sg bakery|delifish", category: "Groceries", subcategory: "Deli & bakery", enabled: true },

  // ============================================
  // EATING-OUT & ENTERTAINMENT
  // ============================================
  // Take-away
  { id: "takeaway-1", name: "Fast Food Chains", pattern: "mcdonald|kfc|subway|nandos|guzman|domino|uber.*eats|doordash", category: "Eating-out & Entertainment", subcategory: "Take-away & snacks", enabled: true },
  { id: "takeaway-2", name: "Fast Food Extended", pattern: "donut king|grill.d|zambrero|oporto|red rooster|hungry jacks|pizza hut|dominos", category: "Eating-out & Entertainment", subcategory: "Take-away & snacks", enabled: true },
  { id: "takeaway-3", name: "Vending", pattern: "robinson.*vending", category: "Eating-out & Entertainment", subcategory: "Take-away & snacks", enabled: true },

  // Coffee
  { id: "coffee-1", name: "Coffee & Cafes", pattern: "coffee|cafe|espresso|backstreet cafe|jamoke|micasa|holliday coffee|rock hop|black fox|somewhere over coffee|the pocket espresso|wishlist coffee|gun cotton|sushi hub|container by|boost|banjos", category: "Eating-out & Entertainment", subcategory: "Coffee & tea", enabled: true },

  // Drinks - Bottleshops only
  { id: "drinks-1", name: "Bottleshops", pattern: "bws|liquorland|dan murphy|vintage cellars|first choice liquor|aldi liquor", category: "Eating-out & Entertainment", subcategory: "Drinks & alcohol", enabled: true },
  { id: "drinks-2", name: "Specialty Drinks", pattern: "pomona distilling|noosa chocolate", category: "Eating-out & Entertainment", subcategory: "Drinks & alcohol", enabled: true },

  // Bars & clubs - Venues
  { id: "bars-1", name: "Hotels & Venues", pattern: "brunswick hotel|alh venues|maroochy rsl|rose.*crown|boatshed|little parliament|deck sea salt|dock mooloolaba|beach bar|chancellor tavern|mammoth|green at tanawha", category: "Eating-out & Entertainment", subcategory: "Bars & clubs", enabled: true },
  { id: "bars-2", name: "Bowling", pattern: "bwlngnrec|bwling|bowlsclub|bowling rec|bowling club", category: "Eating-out & Entertainment", subcategory: "Bars & clubs", enabled: true },
  { id: "bars-3", name: "Clubs Extended", pattern: "bowls club|bowling club|rsl|leagues club|surf club|golf club|tennis club", category: "Eating-out & Entertainment", subcategory: "Bars & clubs", enabled: true },
  { id: "bars-4", name: "Sports Clubs", pattern: "rugby|football club|soccer club|netball club|cricket club", category: "Eating-out & Entertainment", subcategory: "Bars & clubs", enabled: true },

  // Restaurants
  { id: "restaurant-1", name: "Restaurants", pattern: "restaurant|thai|vietnamese|an nam|bombay bliss|walter.*diner|spaghetti|riba kai|playa|mebami|forest blend|somewhere on bud|sunshine krua|springbok", category: "Eating-out & Entertainment", subcategory: "Restaurants", enabled: true },

  // Entertainment
  { id: "entertainment-1", name: "Streaming Services", pattern: "spotify|netflix|disney plus|hbomax|kayo|hubbl|audible|amazon prime|amznprime|apple.*bill|microsoft.*365|microsoft.*trial", category: "Eating-out & Entertainment", subcategory: "Movies shows & music", enabled: true },
  { id: "entertainment-2", name: "Digital Stores", pattern: "google.*play|apple.*itunes|itunes", category: "Eating-out & Entertainment", subcategory: "Movies shows & music", enabled: true },
  { id: "entertainment-3", name: "Events & Attractions", pattern: "event cinema|event kawana|qtix|ticketing|aussie world|bli bli water|surf life|rainbow beach surf|burleigh.*rugby|pickleb", category: "Eating-out & Entertainment", subcategory: "Celebrations & gifts", enabled: true },
  { id: "entertainment-4", name: "Ticket Platforms", pattern: "ticketek|ticketmaster|moshtix|humanitix", category: "Eating-out & Entertainment", subcategory: "Celebrations & gifts", enabled: true },
  { id: "entertainment-5", name: "Travel Booking", pattern: "booking\\.com|hotel at booking|gorge view|thekinkinwood", category: "Eating-out & Entertainment", subcategory: "Holidays", enabled: true },
  { id: "entertainment-6", name: "Local Hotels", pattern: "kings beach hotel", category: "Eating-out & Entertainment", subcategory: "Holidays", enabled: true },

  // ============================================
  // CAR & TRANSPORT
  // ============================================
  { id: "transport-1", name: "Petrol Stations", pattern: "ampol|liberty tanawha|united bethania|caltex", category: "Car & Transport", subcategory: "Petrol", enabled: true },
  { id: "transport-2", name: "Tolls & Parking", pattern: "linkt|parking|southbank carpark|secure parking|point parking|pointparking|transportmainrds|sper qld", category: "Car & Transport", subcategory: "Road tolls & parking", enabled: true },
  { id: "transport-3", name: "Uber & Taxi", pattern: "uber.*trip|taxi", category: "Car & Transport", subcategory: "Uber & taxi", enabled: true },
  { id: "transport-4", name: "Airlines", pattern: "qantas|jetstar", category: "Car & Transport", subcategory: "Airfares", enabled: true },
  { id: "transport-5", name: "Car Services", pattern: "cars on booking|garry cricks", category: "Car & Transport", subcategory: "Repairs & maintenance", enabled: true },
  { id: "transport-6", name: "Rego", pattern: "maroochydore state hig", category: "Car & Transport", subcategory: "Rego & licence", enabled: true },
  { id: "transport-7", name: "Auto Parts", pattern: "supercheap|repco|autobarn|sparesbox", category: "Car & Transport", subcategory: "Repairs & maintenance", enabled: true },

  // ============================================
  // HOME & UTILITIES
  // ============================================
  { id: "home-1", name: "Electricity", pattern: "agl sales|agl energy", category: "Home & utilities", subcategory: "Electricity", enabled: true },
  { id: "home-2", name: "Mobile Phone", pattern: "telstra|vodafone|spintel", category: "Home & utilities", subcategory: "Mobile", enabled: true },
  { id: "home-3", name: "Council Rates", pattern: "sunshine coast regiona", category: "Home & utilities", subcategory: "Council rates", enabled: true },
  { id: "home-4", name: "Water", pattern: "unitywater|unity water", category: "Home & utilities", subcategory: "Water", enabled: true },
  { id: "home-5", name: "Home Improvement Stores", pattern: "bunnings|spotlight|harris scarfe|pomona true value", category: "Home & utilities", subcategory: "Home improvements & Maintenance", enabled: true },
  { id: "home-6", name: "Furniture Stores", pattern: "ikea|fantastic furniture|nick scali|freedom furniture|king living", category: "Home & utilities", subcategory: "Furniture & appliances", enabled: true },

  // ============================================
  // FINANCIAL & INSURANCE
  // ============================================
  { id: "finance-1", name: "Car Insurance Providers", pattern: "youi|suncorp insurance", category: "Financial & Insurance", subcategory: "Car insurance", enabled: true },
  { id: "finance-2", name: "Motoring Clubs", pattern: "racq|nrma|aami", category: "Financial & Insurance", subcategory: "Car insurance", enabled: true },
  { id: "finance-3", name: "Health Insurance", pattern: "medibank|bupa|hcf|hbf|ahm health", category: "Financial & Insurance", subcategory: "Health insurance", enabled: true },
  { id: "finance-4", name: "Interest Charges", pattern: "interest charge", category: "Financial & Insurance", subcategory: "Credit card interest", enabled: true },

  // ============================================
  // MEDICAL, PERSONAL & EDUCATION
  // ============================================
  // Computers & gadgets
  { id: "personal-1", name: "Software Services", pattern: "mcafee|godaddy|adobe|bandify", category: "Medical, personal & education", subcategory: "Computers & gadgets", enabled: true },
  { id: "personal-2", name: "AI Services", pattern: "claude\\.ai|anthropic", category: "Medical, personal & education", subcategory: "Computers & gadgets", enabled: true },
  { id: "personal-3", name: "Office Supplies", pattern: "officeworks", category: "Medical, personal & education", subcategory: "Computers & gadgets", enabled: true },
  { id: "personal-4", name: "Electronics Stores", pattern: "harvey norman|jb hi.fi|apple store|samsung", category: "Medical, personal & education", subcategory: "Computers & gadgets", enabled: true },
  { id: "personal-5", name: "Design Tools", pattern: "canva", category: "Medical, personal & education", subcategory: "Computers & gadgets", enabled: true },
  
  // Shopping
  { id: "personal-6", name: "Amazon", pattern: "amazon|amzn", category: "Medical, personal & education", subcategory: "Shopping", enabled: true },
  { id: "personal-7", name: "PayPal", pattern: "paypal", category: "Medical, personal & education", subcategory: "Shopping", enabled: true },
  { id: "personal-8", name: "Department Stores", pattern: "myer|david jones|target|kmart", category: "Medical, personal & education", subcategory: "Shopping", enabled: true },

  // Sports & gym
  { id: "personal-9", name: "Gyms", pattern: "fitstop|goodlife|gym", category: "Medical, personal & education", subcategory: "Sports & gym", enabled: true },
  { id: "personal-10", name: "Supplements", pattern: "amino z", category: "Medical, personal & education", subcategory: "Sports & gym", enabled: true },

  // Hair & beauty
  { id: "personal-11", name: "Beauty Services", pattern: "glow up|galaxy nail|orchid massage|coastal aesthetic|the body shop|mecca brands", category: "Medical, personal & education", subcategory: "Hair & beauty", enabled: true },

  // Clothing & shoes
  { id: "personal-12", name: "Clothing Brands", pattern: "lskd|cotton on body|decjuba|bonds sunshine|forever new|sp lskd", category: "Medical, personal & education", subcategory: "Clothing & shoes", enabled: true },
  { id: "personal-13", name: "Sports Clothing", pattern: "rebel sport|city beach|surf stitch|surfstitch|the iconic", category: "Medical, personal & education", subcategory: "Clothing & shoes", enabled: true },

  // Pharmacy & medical
  { id: "personal-14", name: "Pharmacies", pattern: "terry white|chemist|pharmacy|livelife pharmacy|mtn creek chem|chance park chm", category: "Medical, personal & education", subcategory: "Medicines & pharmacy", enabled: true },
  { id: "personal-15", name: "Chemist Warehouse", pattern: "chemist warehouse", category: "Medical, personal & education", subcategory: "Medicines & pharmacy", enabled: true },
  { id: "personal-16", name: "Optometry", pattern: "specsavers", category: "Medical, personal & education", subcategory: "Glasses & eye care", enabled: true },
  { id: "personal-17", name: "Medical Services", pattern: "suncoast health|dietitian|ezi.*dietitian|hayley mary", category: "Medical, personal & education", subcategory: "Doctors & medical", enabled: true },
  { id: "personal-18", name: "Hospital", pattern: "sfs scuh|sfs the container|sfs scuh alice", category: "Medical, personal & education", subcategory: "Doctors & medical", enabled: true },

  // Education
  { id: "personal-19", name: "Education", pattern: "cobbco nine mile", category: "Medical, personal & education", subcategory: "Education", enabled: true },

  // ============================================
  // CHILDREN
  // ============================================
  { id: "children-1", name: "Toys", pattern: "sunny sloths", category: "Children", subcategory: "Toys", enabled: true },

  // ============================================
  // INCOME (Lowest Priority - broad patterns)
  // ============================================
  { id: "income-1", name: "Salary", pattern: "salary|payroll|employer", category: "Income", subcategory: "Your take-home pay", enabled: true },

  // ============================================
  // RENOVATIONS (Project Category)
  // ============================================
  { id: "reno-1", name: "Planning & Design", pattern: "architect|draftsman|building designer|town planner|interior design", category: "Renovations", subcategory: "Planning & design", enabled: true },
]

/**
 * Apply rules to a transaction description
 * Takes the current rules array (from context/localStorage)
 * Returns the first matching rule or null
 */
export function applyRules(
  description: string,
  builtinRules: BuiltinRule[],
  customRules?: Array<{ match: string; matchType: string; category: string; subcategory: string; enabled: boolean; isIgnore?: boolean; isBusiness?: boolean; overridesBuiltinId?: string }>
): { category: string; subcategory: string; ruleId: string; isIgnore?: boolean; isBusiness?: boolean } | null {
  // Build set of disabled builtin rule IDs from custom rule overrides
  const disabledBuiltinIds = new Set<string>()
  const overrideMap = new Map<string, { category: string; subcategory: string; isIgnore?: boolean }>()
  
  if (customRules) {
    for (const rule of customRules) {
      if (rule.overridesBuiltinId) {
        if (!rule.enabled) {
          disabledBuiltinIds.add(rule.overridesBuiltinId)
        } else {
          overrideMap.set(rule.overridesBuiltinId, {
            category: rule.category,
            subcategory: rule.subcategory,
            isIgnore: rule.isIgnore
          })
        }
      }
    }
    
    // Check custom rules first (they have higher priority)
    for (const rule of customRules) {
      if (!rule.enabled || rule.overridesBuiltinId) continue
      
      try {
        let regex: RegExp
        if (rule.matchType === "regex") {
          regex = new RegExp(rule.match, "i")
        } else if (rule.matchType === "startsWith") {
          regex = new RegExp(`^${rule.match}`, "i")
        } else {
          // contains
          regex = new RegExp(rule.match, "i")
        }
        
        if (regex.test(description)) {
          return {
            category: rule.isIgnore ? "Ignore" : rule.category,
            subcategory: rule.isIgnore ? "Ignored" : rule.subcategory,
            ruleId: `custom`,
            isIgnore: rule.isIgnore,
            isBusiness: rule.isBusiness,
          }
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }
  
  // Then check built-in rules
  for (const rule of builtinRules) {
    if (!rule.enabled) continue
    if (disabledBuiltinIds.has(rule.id)) continue
    
    try {
      const regex = new RegExp(rule.pattern, "i")
      if (regex.test(description)) {
        // Check if there's an override for this rule
        const override = overrideMap.get(rule.id)
        if (override) {
          return {
            category: override.isIgnore ? "Ignore" : override.category,
            subcategory: override.isIgnore ? "Ignored" : override.subcategory,
            ruleId: rule.id,
            isIgnore: override.isIgnore
          }
        }
        
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          ruleId: rule.id
        }
      }
    } catch {
      // Invalid regex pattern, skip this rule
    }
  }
  
  return null
}

/**
 * Legacy function for backwards compatibility
 * Uses DEFAULT_BUILTIN_RULES directly (before localStorage is loaded)
 */
export function applyBuiltinRules(description: string): { category: string; subcategory: string; ruleId: string } | null {
  return applyRules(description, DEFAULT_BUILTIN_RULES)
}

/**
 * Find all matching rules for a description (for debugging)
 */
export function findAllMatchingRules(description: string, builtinRules: BuiltinRule[]): BuiltinRule[] {
  return builtinRules.filter(rule => {
    if (!rule.enabled) return false
    try {
      const regex = new RegExp(rule.pattern, "i")
      return regex.test(description)
    } catch {
      return false
    }
  })
}

/**
 * Get a rule by ID
 */
export function getRuleById(id: string, builtinRules: BuiltinRule[]): BuiltinRule | undefined {
  return builtinRules.find(rule => rule.id === id)
}
