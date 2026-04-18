import type { BuiltinRule, CustomRule } from "./contracts.js";

// Verbatim from migration-artifacts/budget-tracker/budget-categoriser.jsx
// These are compiled heuristics for common Australian merchants.
// Custom rules always take precedence over built-in rules.
export const BUILTIN_RULES: BuiltinRule[] = [
  { match: /payment thank/i,          category: "Financial & Insurance", subcategory: "Transfer" },
  { match: /credit card payment|cc payment|visa payment|anz credit|mastercard payment/i, category: "Financial & Insurance", subcategory: "Transfer" },
  { match: /^(from|to) .*(internal transfer|linked account)/i, category: "Financial & Insurance", subcategory: "Transfer" },
  { match: /woolworths|coles|aldi|ww metro|mega fresh/i, category: "Groceries", subcategory: "Supermarket" },
  { match: /bakers delight|wellington bakery|rainbow beach bakery|brumby|sg bakery|delifish/i, category: "Groceries", subcategory: "Deli & bakery" },
  { match: /mcdonald|kfc|subway|nandos|guzman|domino|uber.*eats|doordash/i, category: "Eating-out & Entertainment", subcategory: "Take-away & snacks" },
  { match: /coffee|cafe|espresso|backstreet cafe|jamoke|micasa|holliday coffee|rock hop|black fox|somewhere over coffee|the pocket espresso|wishlist coffee|gun cotton|sushi hub|container by|boost|banjos/i, category: "Eating-out & Entertainment", subcategory: "Coffee & tea" },
  { match: /bws|liquorland|dan murphy|vintage cellars|first choice liquor|aldi liquor/i, category: "Eating-out & Entertainment", subcategory: "Drinks & alcohol" },
  { match: /pomona distilling|noosa chocolate/i, category: "Eating-out & Entertainment", subcategory: "Drinks & alcohol" },
  { match: /brunswick hotel|alh venues|maroochy rsl|rose.*crown|boatshed|little parliament|deck sea salt|dock mooloolaba|beach bar|chancellor tavern|mammoth|green at tanawha/i, category: "Eating-out & Entertainment", subcategory: "Bars & clubs" },
  { match: /restaurant|thai|vietnamese|an nam|bombay bliss|walter.*diner|spaghetti|riba kai|playa|mebami|forest blend|somewhere on bud|sunshine krua|springbok/i, category: "Eating-out & Entertainment", subcategory: "Restaurants" },
  { match: /spotify|netflix|disney plus|hbomax|kayo|hubbl|audible|amazon prime|amznprime|apple.*bill|microsoft.*365|microsoft.*trial/i, category: "Eating-out & Entertainment", subcategory: "Movies, shows & music" },
  { match: /event cinema|event kawana|qtix|ticketing|aussie world|bli bli water|surf life|rainbow beach surf|burleigh.*rugby|pickleb/i, category: "Eating-out & Entertainment", subcategory: "Celebrations & gifts" },
  { match: /booking\.com|hotel at booking|gorge view|thekinkinwood/i, category: "Eating-out & Entertainment", subcategory: "Holidays" },
  { match: /kings beach hotel/i, category: "Eating-out & Entertainment", subcategory: "Holidays" },
  { match: /ampol|liberty tanawha|united bethania|caltex/i, category: "Car & Transport", subcategory: "Petrol" },
  { match: /linkt|parking|southbank carpark|secure parking|point parking|pointparking|transportmainrds|sper qld/i, category: "Car & Transport", subcategory: "Road tolls & parking" },
  { match: /uber.*trip|taxi/i, category: "Car & Transport", subcategory: "Uber & taxi" },
  { match: /qantas|jetstar/i, category: "Car & Transport", subcategory: "Airfares" },
  { match: /cars on booking|garry cricks/i, category: "Car & Transport", subcategory: "Repairs & maintenance" },
  { match: /maroochydore state hig/i, category: "Car & Transport", subcategory: "Rego & licence" },
  { match: /agl sales|agl energy/i, category: "Home & utilities", subcategory: "Electricity" },
  { match: /telstra|vodafone|spintel/i, category: "Home & utilities", subcategory: "Mobile" },
  { match: /sunshine coast regiona/i, category: "Home & utilities", subcategory: "Council rates" },
  { match: /bunnings|spotlight|harris scarfe|pomona true value/i, category: "Home & utilities", subcategory: "Home improvements & Maintenance" },
  { match: /youi|suncorp insurance/i, category: "Financial & Insurance", subcategory: "Car insurance" },
  { match: /mcafee|godaddy|adobe|bandify/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
  { match: /fitstop|goodlife|gym/i, category: "Medical, personal & education", subcategory: "Sports & gym" },
  { match: /amino z/i, category: "Medical, personal & education", subcategory: "Sports & gym" },
  { match: /glow up|galaxy nail|orchid massage|coastal aesthetic|the body shop|mecca brands/i, category: "Medical, personal & education", subcategory: "Hair & beauty" },
  { match: /bwlngnrec|bwling|bowlsclub|bowling rec|bowling club/i, category: "Eating-out & Entertainment", subcategory: "Bars & clubs" },
  { match: /rugby|football club|soccer club|netball club|cricket club/i, category: "Eating-out & Entertainment", subcategory: "Bars & clubs" },
  { match: /lskd|cotton on body|decjuba|bonds sunshine|forever new|sp lskd/i, category: "Medical, personal & education", subcategory: "Clothing & shoes" },
  { match: /myer|david jones|target|kmart/i, category: "Medical, personal & education", subcategory: "Shopping" },
  { match: /terry white|chemist|pharmacy|livelife pharmacy|mtn creek chem|chance park chm/i, category: "Medical, personal & education", subcategory: "Medicines & pharmacy" },
  { match: /specsavers/i, category: "Medical, personal & education", subcategory: "Glasses & eye care" },
  { match: /suncoast health|dietitian|ezi.*dietitian|hayley mary/i, category: "Medical, personal & education", subcategory: "Doctors & medical" },
  { match: /sfs scuh|sfs the container|sfs scuh alice/i, category: "Medical, personal & education", subcategory: "Doctors & medical" },
  { match: /cobbco nine mile/i, category: "Medical, personal & education", subcategory: "Education" },
  { match: /sunny sloths/i, category: "Children", subcategory: "Toys" },
  { match: /robinson.*vending/i, category: "Eating-out & Entertainment", subcategory: "Take-away & snacks" },
  { match: /interest charge/i, category: "Financial & Insurance", subcategory: "Credit card interest" },
  { match: /architect|draftsman|building designer|town planner|interior design/i, category: "Renovations", subcategory: "Planning & design" },
  { match: /claude\.ai|anthropic/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
  { match: /officeworks/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
  { match: /unitywater|unity water/i, category: "Home & utilities", subcategory: "Water" },
  { match: /ticketek|ticketmaster|moshtix|humanitix/i, category: "Eating-out & Entertainment", subcategory: "Celebrations & gifts" },
  { match: /bowls club|bowling club|rsl|leagues club|surf club|golf club|tennis club/i, category: "Eating-out & Entertainment", subcategory: "Bars & clubs" },
  { match: /harvey norman|jb hi.fi|apple store|samsung/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
  { match: /ikea|fantastic furniture|nick scali|freedom furniture|king living/i, category: "Home & utilities", subcategory: "Furniture & appliances" },
  { match: /supercheap|repco|autobarn|sparesbox/i, category: "Car & Transport", subcategory: "Repairs & maintenance" },
  { match: /chemist warehouse/i, category: "Medical, personal & education", subcategory: "Medicines & pharmacy" },
  { match: /rebel sport|city beach|surf stitch|surfstitch|the iconic/i, category: "Medical, personal & education", subcategory: "Clothing & shoes" },
  { match: /donut king|grill.d|guzman|nandos|zambrero|oporto|red rooster|hungry jacks|pizza hut|dominos/i, category: "Eating-out & Entertainment", subcategory: "Take-away & snacks" },
  { match: /amazon|amzn/i, category: "Medical, personal & education", subcategory: "Shopping" },
  { match: /paypal/i, category: "Medical, personal & education", subcategory: "Shopping" },
  { match: /commonwealth bank|commbank|nab |westpac|anz bank/i, category: "Financial & Insurance", subcategory: "Transfer" },
  { match: /google.*play|apple.*itunes|itunes/i, category: "Eating-out & Entertainment", subcategory: "Movies, shows & music" },
  { match: /canva/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
  { match: /racq|nrma|aami/i, category: "Financial & Insurance", subcategory: "Car insurance" },
  { match: /medibank|bupa|hcf|hbf|ahm health/i, category: "Financial & Insurance", subcategory: "Health insurance" },
  { match: /hawkins/i, category: "Financial & Insurance", subcategory: "Transfer" },
  { match: /salary|payroll|employer/i, category: "Income", subcategory: "Your take-home pay" },
];

type AnyRule = BuiltinRule | CustomRule;

function matchesRule(description: string, rule: AnyRule): boolean {
  const normalised = description.replace(/\s+/g, " ").trim();
  if ("match" in rule && rule.match instanceof RegExp) {
    return rule.match.test(normalised);
  }
  const pattern = (rule as CustomRule).match.replace(/\s+/g, " ").trim();
  try {
    return new RegExp(pattern, "i").test(normalised);
  } catch {
    return normalised.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Apply rules in order (custom rules first, most-recent-wins; then built-in rules).
 * Returns first match or null if none match.
 *
 * The caller is responsible for ordering: pass [...customRules].reverse() to get
 * most-recent-first, followed by BUILTIN_RULES.
 */
export function applyRules(
  description: string,
  rules: AnyRule[]
): { category: string; subcategory: string } | null {
  for (const rule of rules) {
    if (matchesRule(description, rule)) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }
  return null;
}
