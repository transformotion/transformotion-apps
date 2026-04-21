import { useState, useCallback, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ReferenceLine, Cell } from "recharts";

const BUDGET_CATEGORIES = {
  "Income": ["Your take-home pay","Your partner's take-home pay","Bonuses / overtime","Income from savings and investments","Child support received","School fees reimbursement","Rent (investment property)","Other income"],
  "Home & utilities": ["Mortgage / rent","Water","Gas","Electricity","Mobile","Internet","Streaming Services","Home improvements & Maintenance","Furniture & appliances","Council rates","Body corporate fees","Kierans Mobile","Ellas Mobile"],
  "Financial & Insurance": ["Savings","Investments & super contributions","Charity donations","Paying off debt","Credit card interest","Other loans","Car loan","Home & contents insurance","Health insurance","Car insurance","Personal & life insurance","Transfer","Capital purchases"],
  "Groceries": ["Supermarket","Deli & bakery","Fruit & veg market","Cleaning products","Toiletries","Pet food"],
  "Medical, personal & education": ["Doctors & medical","Medicines & pharmacy","Glasses & eye care","Dental","Education","Computers & gadgets","Sports & gym","Clothing & shoes","Cosmetics","Hair & beauty","Shopping","Hobbies","Pet care / vet / pet insurance"],
  "Eating-out & Entertainment": ["Coffee & tea","Lunches bought","Take-away & snacks","Drinks & alcohol","Restaurants","Bars & clubs","Movies, shows & music","Books, newspapers & magazines","Celebrations & gifts","Holidays"],
  "Car & Transport": ["Petrol","Road tolls & parking","Repairs & maintenance","Rego & licence","Uber & taxi","Public Transport","Airfares"],
  "Children": ["Children Clothing","Childcare","Babysitting","School fees","School uniforms","Excursions","Other school needs","Children Sports & activities","Toys","Child support payment"],
  "Renovations": ["Planning & design","Building & labour","Materials & supplies","Fixtures & fittings","Appliances","Landscaping & outdoor","Other renovation costs"],
};

const CATEGORY_COLORS = {
  "Income":                        "bg-emerald-100 text-emerald-800",
  "Home & utilities":              "bg-blue-100 text-blue-800",
  "Financial & Insurance":         "bg-purple-100 text-purple-800",
  "Groceries":                     "bg-green-100 text-green-800",
  "Medical, personal & education": "bg-pink-100 text-pink-800",
  "Eating-out & Entertainment":    "bg-orange-100 text-orange-800",
  "Car & Transport":               "bg-yellow-100 text-yellow-800",
  "Children":                      "bg-rose-100 text-rose-800",
  "Renovations":                   "bg-amber-100 text-amber-800",
  "Uncategorised":                 "bg-gray-100 text-gray-600",
};

const BUDGET_SUBCATEGORY = {
  "Your take-home pay":                   { category: "Income",                        monthly: 8000 },
  "Your partner's take-home pay":         { category: "Income",                        monthly: 5000 },
  "Bonuses / overtime":                   { category: "Income",                        monthly: 0 },
  "Income from savings and investments":  { category: "Income",                        monthly: 0 },
  "Child support received":               { category: "Income",                        monthly: 0 },
  "School fees reimbursement":            { category: "Income",                        monthly: 0 },
  "Rent (investment property)":           { category: "Income",                        monthly: 0 },
  "Other income":                         { category: "Income",                        monthly: 0 },
  "Mortgage / rent":                      { category: "Home & utilities",              monthly: 3200 },
  "Water":                                { category: "Home & utilities",              monthly: 60 },
  "Gas":                                  { category: "Home & utilities",              monthly: 40 },
  "Electricity":                          { category: "Home & utilities",              monthly: 150 },
  "Mobile":                               { category: "Home & utilities",              monthly: 60 },
  "Internet":                             { category: "Home & utilities",              monthly: 80 },
  "Streaming Services":                   { category: "Home & utilities",              monthly: 60 },
  "Home improvements & Maintenance":      { category: "Home & utilities",              monthly: 200 },
  "Furniture & appliances":               { category: "Home & utilities",              monthly: 100 },
  "Council rates":                        { category: "Home & utilities",              monthly: 80 },
  "Body corporate fees":                  { category: "Home & utilities",              monthly: 0 },
  "Kierans Mobile":                       { category: "Home & utilities",              monthly: 30 },
  "Ellas Mobile":                         { category: "Home & utilities",              monthly: 30 },
  "Savings":                              { category: "Financial & Insurance",         monthly: 500 },
  "Investments & super contributions":    { category: "Financial & Insurance",         monthly: 200 },
  "Charity donations":                    { category: "Financial & Insurance",         monthly: 50 },
  "Paying off debt":                      { category: "Financial & Insurance",         monthly: 0 },
  "Credit card interest":                 { category: "Financial & Insurance",         monthly: 0 },
  "Other loans":                          { category: "Financial & Insurance",         monthly: 0 },
  "Car loan":                             { category: "Financial & Insurance",         monthly: 0 },
  "Home & contents insurance":            { category: "Financial & Insurance",         monthly: 150 },
  "Health insurance":                     { category: "Financial & Insurance",         monthly: 300 },
  "Car insurance":                        { category: "Financial & Insurance",         monthly: 120 },
  "Personal & life insurance":            { category: "Financial & Insurance",         monthly: 100 },
  "Transfer":                             { category: "Financial & Insurance",         monthly: 0 },
  "Capital purchases":                    { category: "Financial & Insurance",         monthly: 0 },
  "Supermarket":                          { category: "Groceries",                     monthly: 800 },
  "Deli & bakery":                        { category: "Groceries",                     monthly: 50 },
  "Fruit & veg market":                   { category: "Groceries",                     monthly: 80 },
  "Cleaning products":                    { category: "Groceries",                     monthly: 40 },
  "Toiletries":                           { category: "Groceries",                     monthly: 60 },
  "Pet food":                             { category: "Groceries",                     monthly: 80 },
  "Doctors & medical":                    { category: "Medical, personal & education", monthly: 100 },
  "Medicines & pharmacy":                 { category: "Medical, personal & education", monthly: 50 },
  "Glasses & eye care":                   { category: "Medical, personal & education", monthly: 20 },
  "Dental":                               { category: "Medical, personal & education", monthly: 50 },
  "Education":                            { category: "Medical, personal & education", monthly: 100 },
  "Computers & gadgets":                  { category: "Medical, personal & education", monthly: 50 },
  "Sports & gym":                         { category: "Medical, personal & education", monthly: 100 },
  "Clothing & shoes":                     { category: "Medical, personal & education", monthly: 150 },
  "Cosmetics":                            { category: "Medical, personal & education", monthly: 50 },
  "Hair & beauty":                        { category: "Medical, personal & education", monthly: 80 },
  "Shopping":                             { category: "Medical, personal & education", monthly: 100 },
  "Hobbies":                              { category: "Medical, personal & education", monthly: 100 },
  "Pet care / vet / pet insurance":       { category: "Medical, personal & education", monthly: 80 },
  "Coffee & tea":                         { category: "Eating-out & Entertainment",    monthly: 150 },
  "Lunches bought":                       { category: "Eating-out & Entertainment",    monthly: 100 },
  "Take-away & snacks":                   { category: "Eating-out & Entertainment",    monthly: 150 },
  "Drinks & alcohol":                     { category: "Eating-out & Entertainment",    monthly: 100 },
  "Restaurants":                          { category: "Eating-out & Entertainment",    monthly: 200 },
  "Bars & clubs":                         { category: "Eating-out & Entertainment",    monthly: 50 },
  "Movies, shows & music":                { category: "Eating-out & Entertainment",    monthly: 50 },
  "Books, newspapers & magazines":        { category: "Eating-out & Entertainment",    monthly: 30 },
  "Celebrations & gifts":                 { category: "Eating-out & Entertainment",    monthly: 100 },
  "Holidays":                             { category: "Eating-out & Entertainment",    monthly: 200 },
  "Petrol":                               { category: "Car & Transport",               monthly: 200 },
  "Road tolls & parking":                 { category: "Car & Transport",               monthly: 50 },
  "Repairs & maintenance":                { category: "Car & Transport",               monthly: 100 },
  "Rego & licence":                       { category: "Car & Transport",               monthly: 30 },
  "Uber & taxi":                          { category: "Car & Transport",               monthly: 50 },
  "Public Transport":                     { category: "Car & Transport",               monthly: 50 },
  "Airfares":                             { category: "Car & Transport",               monthly: 100 },
  "Children Clothing":                    { category: "Children",                      monthly: 50 },
  "Childcare":                            { category: "Children",                      monthly: 0 },
  "Babysitting":                          { category: "Children",                      monthly: 50 },
  "School fees":                          { category: "Children",                      monthly: 200 },
  "School uniforms":                      { category: "Children",                      monthly: 30 },
  "Excursions":                           { category: "Children",                      monthly: 30 },
  "Other school needs":                   { category: "Children",                      monthly: 30 },
  "Children Sports & activities":         { category: "Children",                      monthly: 100 },
  "Toys":                                 { category: "Children",                      monthly: 50 },
  "Child support payment":                { category: "Children",                      monthly: 0 },
  "Planning & design":                    { category: "Renovations",                   monthly: 0 },
  "Building & labour":                    { category: "Renovations",                   monthly: 0 },
  "Materials & supplies":                 { category: "Renovations",                   monthly: 0 },
  "Fixtures & fittings":                  { category: "Renovations",                   monthly: 0 },
  "Appliances":                           { category: "Renovations",                   monthly: 0 },
  "Landscaping & outdoor":                { category: "Renovations",                   monthly: 0 },
  "Other renovation costs":               { category: "Renovations",                   monthly: 0 },
};

// Categories treated as capital projects — excluded from monthly P&L, tracked as lump-sum budgets
const PROJECT_CATEGORIES = ["Renovations"];
const PROJECT_SUBCATEGORIES = ["Capital purchases"]; // individual subcats in non-project categories

const isProjectTx = (t) =>
  PROJECT_CATEGORIES.includes(t.category) ||
  PROJECT_SUBCATEGORIES.includes(t.subcategory);

const BUILTIN_RULES = [
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
  { match: /harvey norman|jb hi.fi|apple store|samsung|officeworks/i, category: "Medical, personal & education", subcategory: "Computers & gadgets" },
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

function parseCSVLine(line) {
  const cols = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuote = !inQuote; }
    else if (line[i] === ',' && !inQuote) { cols.push(cur.trim()); cur = ""; }
    else { cur += line[i]; }
  }
  cols.push(cur.trim());
  return cols;
}

function normaliseDate(raw) {
  // DD/MM/YYYY (ANZ)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  // DD-Mon-YY or DD-Mon-YYYY (Macquarie)
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const months = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const mo = months[m[2].toLowerCase()];
    const yr = m[3].length === 2 ? "20" + m[3] : m[3];
    if (mo) return `${m[1].padStart(2,"0")}/${mo}/${yr}`;
  }
  // YYYY-MM-DD
  const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
  return raw;
}

function parseCSV(text, filename) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) return [];

  // Detect if first line is a header or data
  // A header row contains recognisable column names; a data row starts with a date-like value
  const firstCols = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const firstIsDate = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(firstCols[0].replace(/^"+|"+$/g,""));
  const hasHeader = !firstIsDate;

  let dateIdx, descIdx, amtIdx, debitIdx, creditIdx, isSplitAmount, dataLines;

  if (hasHeader) {
    const header = firstCols;
    dateIdx  = header.findIndex(h => h.includes("date"));
    descIdx  = header.findIndex(h => h === "original description") !== -1
      ? header.findIndex(h => h === "original description")
      : header.findIndex(h => h.includes("description") || h.includes("narrative") || h.includes("detail") || h.includes("memo"));
    amtIdx   = header.findIndex(h => h === "amount");
    debitIdx = header.findIndex(h => h === "debit");
    creditIdx= header.findIndex(h => h === "credit");
    if (dateIdx === -1 || descIdx === -1 || (amtIdx === -1 && debitIdx === -1)) return [];
    isSplitAmount = amtIdx === -1 && debitIdx !== -1;
    dataLines = lines.slice(1);
  } else {
    // No header — assume ANZ format: date, amount, description, ...
    dateIdx = 0; amtIdx = 1; descIdx = 2; debitIdx = -1; creditIdx = -1;
    isSplitAmount = false;
    dataLines = lines;
  }

  return dataLines.flatMap(line => {
    const cols = parseCSVLine(line);
    const get = (i) => (cols[i] || "").trim().replace(/^"|"$/g, "");

    const rawDate = get(dateIdx);
    const date = normaliseDate(rawDate);
    const desc = get(descIdx) || get(header.findIndex(h => h.includes("detail") || h.includes("narrative"))) || "";

    let amount;
    if (isSplitAmount) {
      const debit  = parseFloat(get(debitIdx).replace(/,/g,""))  || 0;
      const credit = parseFloat(get(creditIdx).replace(/,/g,"")) || 0;
      if (debit === 0 && credit === 0) return [];
      // Expenses negative, income positive (consistent with ANZ convention)
      amount = credit > 0 ? credit : -debit;
    } else {
      amount = parseFloat(get(amtIdx).replace(/,/g,"")) || 0;
    }

    if (!date || !desc) return [];
    return [{ date, amount: amount.toString(), description: desc, file: filename, category: "", subcategory: "" }];
  });
}

function applyRules(description, rules) {
  const normalised = description.replace(/\s+/g, " ").trim();
  for (const rule of rules) {
    let matched = false;
    if (typeof rule.match === "string") {
      const normRule = rule.match.replace(/\s+/g, " ").trim();
      try { matched = new RegExp(normRule, "i").test(normalised); }
      catch (_) { matched = normalised.toLowerCase().includes(normRule.toLowerCase()); }
    } else {
      matched = rule.match.test(normalised);
    }
    if (matched) return { category: rule.category, subcategory: rule.subcategory };
  }
  return null;
}

async function aiCategorise(txList, categories) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Categorise these bank transactions. Available categories: ${JSON.stringify(categories)}
Transactions: ${JSON.stringify(txList.map((t, i) => ({ index: i, description: t.description, amount: t.amount })))}
Respond ONLY with a JSON array: [{"index":0,"category":"Groceries","subcategory":"Supermarket"}]
Only include transactions you can confidently categorise.`
      }]
    })
  });
  const data = await response.json();
  const text = (data.content || []).map(c => c.text || "").join("");
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean.slice(clean.indexOf("["), clean.lastIndexOf("]") + 1));
  } catch { return []; }
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [customRules, setCustomRules] = useState([]);
  const customRulesRef = useRef([]);
  const rulesLoadedRef = useRef(false);
  const [customCategories, setCustomCategories] = useState({});
  const [budgetOverrides, setBudgetOverrides] = useState({});
  const [budgetFreqs, setBudgetFreqs] = useState({});
  const [tab, setTab] = useState("transactions");
  const [summaryMonth, setSummaryMonth] = useState("all");
  const [aiStatus, setAiStatus] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterSub, setFilterSub] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all"); // "all"|"business"|"personal"
  const [filterMonth, setFilterMonth] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [selectedIdxs, setSelectedIdxs] = useState(new Set());
  const [bulkEdit, setBulkEdit] = useState({ category: "", subcategory: "" });
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [drilldown, setDrilldown] = useState(null);
  const [newRule, setNewRule] = useState({ match: "", category: "", subcategory: "" });
  const [editingRule, setEditingRule] = useState(null);
  const [showBuiltinRules, setShowBuiltinRules] = useState(false);
  const [editingBuiltin, setEditingBuiltin] = useState(null); // { idx, pat, category, subcategory }
  const [debugInput, setDebugInput] = useState("");
  const [showPatternHelp, setShowPatternHelp] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [addingToCat, setAddingToCat] = useState(null);
  const [deleteSubModal, setDeleteSubModal] = useState(null); // { cat, sub, transferTo }
  const [newSubName, setNewSubName] = useState("");
  const [projectBudgets, setProjectBudgets] = useState({});
  const [exportData, setExportData] = useState(null);
  const [aiReview, setAiReview] = useState([]); // [{tx, category, subcategory, reason, confirmed, override}]
  const [aiReviewStatus, setAiReviewStatus] = useState(""); // "idle"|"running"|"done"

  useEffect(function(){
    (async () => {
      try { const b = await window.storage.get("budget-overrides"); if (b) setBudgetOverrides(JSON.parse(b.value)); } catch (_) {}
      try { const pb = await window.storage.get("project-budgets"); if (pb) setProjectBudgets(JSON.parse(pb.value)); } catch (_) {}
      try { const f = await window.storage.get("budget-freqs"); if (f) setBudgetFreqs(JSON.parse(f.value)); } catch (_) {}
      try { const c = await window.storage.get("custom-categories"); if (c) setCustomCategories(JSON.parse(c.value)); } catch (_) {}
      // Load transactions first, then rules, then re-run rules over transactions
      let loadedTx = [];
      try { const t = await window.storage.get("transactions"); if (t) { loadedTx = JSON.parse(t.value); } } catch (_) {}
      let loadedRules = [];
      try { const s = await window.storage.get("custom-rules"); if (s) loadedRules = JSON.parse(s.value); } catch (_) {}
      if (loadedRules.length > 0) setCustomRules(loadedRules);
      customRulesRef.current = loadedRules;
      if (loadedTx.length > 0) {
        const allRules = [...loadedRules, ...BUILTIN_RULES];
        const reruled = loadedTx.map(t => {
          if (t._manual) return t;
          const r = applyRules(t.description, allRules);
          return r ? { ...t, ...r } : t;
        });
        setTransactions(reruled);
      }
    })();
  }, []);

  const saveTxTimer = useRef(null);
  const saveTransactions = (tx) => {
    if (saveTxTimer.current) clearTimeout(saveTxTimer.current);
    saveTxTimer.current = setTimeout(function(){
      const slim = tx.map(({ _id, date, amount, description, category, subcategory, file, _manual, _business }) =>
        ({ _id, date, amount, description, category, subcategory, file, _manual, _business }));
      window.storage.set("transactions", JSON.stringify(slim)).catch(e => console.log("[DEBUG] save failed:", e.message));
    }, 800);
  };

  const saveRules = (rules) => { try { window.storage.set("custom-rules", JSON.stringify(rules)); } catch (_) {} };
  const saveCustomCats = (next) => { try { window.storage.set("custom-categories", JSON.stringify(next)); } catch (_) {} };

  customRulesRef.current = customRules;

  // Track explicitly deleted subcategories (budgetOverride === 0 AND not in customCategories)
  const deletedSubs = new Set(
    Object.entries(budgetOverrides)
      .filter(([sub, val]) => val === -1 && BUDGET_SUBCATEGORY[sub])
      .map(([sub]) => sub)
  );

  const effectiveCategories = Object.fromEntries(
    Object.keys(BUDGET_CATEGORIES).map(cat => {
      const builtin = BUDGET_CATEGORIES[cat].filter(s => !deletedSubs.has(s));
      const custom = customCategories[cat] ? customCategories[cat].filter(s => !deletedSubs.has(s)) : null;
      if (!custom) return [cat, builtin];
      // Merge: keep custom order, but append any built-in entries not already present
      const merged = [...custom, ...builtin.filter(s => !custom.includes(s))];
      return [cat, merged];
    })
  );

  const runRulesOnTx = (tx, rules) => {
    const allRules = [...rules, ...BUILTIN_RULES];
    const base = { ...tx, _manual: tx._manual || false };
    if (base._manual) return base;
    const r = applyRules(tx.description, allRules);
    return r ? { ...base, ...r } : { ...base, category: "", subcategory: "" };
  };

  const applyNewRules = (rules) => {
    setTransactions(prev => {
      const next = prev.map(t => runRulesOnTx(t, rules));
      saveTransactions(next);
      return next;
    });
  };

  const reapplyAllRules = () => {
    const allRules = [...customRulesRef.current, ...BUILTIN_RULES];
    let changed = 0;
    setTransactions(prev => {
      const next = prev.map(t => {
        const r = applyRules(t.description, allRules);
        if (r) {
          if (r.category !== t.category || r.subcategory !== t.subcategory) changed++;
          return { ...t, ...r, _manual: false };
        }
        return { ...t, _manual: false };
      });
      saveTransactions(next);
      return next;
    });
    setTimeout(() => {
      setAiStatus(changed > 0
        ? `Re-applied rules — ${changed} transaction${changed !== 1 ? "s" : ""} updated`
        : "Re-applied rules — no changes needed");
      setTimeout(() => setAiStatus(""), 4000);
    }, 100);
  };

  const processFiles = useCallback(async (files) => {
    let parsedTx = [];
    for (const f of files) { const text = await f.text(); parsedTx = [...parsedTx, ...parseCSV(text, f.name)]; }
    const allRules = [...customRules, ...BUILTIN_RULES];
    let newRuled = [];
    setTransactions(prev => {
      const existingKeys = new Set(prev.map(t => `${t.date}|${t.amount}|${t.description}`));
      const genuinelyNew = parsedTx.filter(t => !existingKeys.has(`${t.date}|${t.amount}|${t.description}`));
      if (genuinelyNew.length === 0) {
        setAiStatus(`No new transactions found — ${parsedTx.length} row${parsedTx.length !== 1 ? "s" : ""} in file already exist or file could not be parsed`);
        setTimeout(() => setAiStatus(""), 5000);
        return prev;
      }
      const nextId = prev.length > 0 ? Math.max(...prev.map(t => t._id || 0)) + 1 : 0;
      newRuled = genuinelyNew.map((t, i) => {
        const base = { ...t, _id: nextId + i, _manual: false };
        const r = applyRules(t.description, allRules);
        return r ? { ...base, ...r } : { ...base, category: "", subcategory: "" };
      });
      const next = [...prev, ...newRuled]; saveTransactions(next); return next;
    });
    setTab("transactions");
    await new Promise(res => setTimeout(res, 50));
    const uncategorised = newRuled.filter(t => !t.category);
    if (uncategorised.length === 0) { setAiStatus(`Loaded ${newRuled.length} new transactions`); setTimeout(() => setAiStatus(""), 3000); return; }
    setAiStatus(`Categorising ${uncategorised.length} transactions with AI...`);
    try {
      const BATCH = 50; let results = [];
      for (let i = 0; i < uncategorised.length; i += BATCH) {
        const batchRes = await aiCategorise(uncategorised.slice(i, i + BATCH), Object.fromEntries(Object.keys(effectiveCategories).map(c => [c, effectiveCategories[c]])));
        results = [...results, ...batchRes];
        if (i + BATCH < uncategorised.length) setAiStatus(`Categorising... ${Math.min(i + BATCH, uncategorised.length)}/${uncategorised.length}`);
      }
      const aiMap = {};
      results.forEach((r, i) => { const tx = uncategorised[r.index !== undefined ? r.index : i]; if (tx) aiMap[tx._id] = { category: r.category, subcategory: r.subcategory }; });
      setTransactions(prev => prev.map(t => aiMap[t._id] ? { ...t, ...aiMap[t._id] } : t));
      setAiStatus(`Loaded ${newRuled.length} transactions, AI categorised ${Object.keys(aiMap).length}`);
      setTimeout(() => setAiStatus(""), 4000);
    } catch (_) {
      setAiStatus("AI categorisation failed — please categorise manually");
      setTimeout(() => setAiStatus(""), 5000);
    }
  }, [customRules, effectiveCategories]);

  const handleFiles = (e) => processFiles(Array.from(e.target.files));
  const handleDrop = (e) => { e.preventDefault(); processFiles(Array.from(e.dataTransfer.files)); };

  const updateTx = (id, changes) => { setTransactions(prev => { const next = prev.map(t => t._id === id ? { ...t, ...changes, _manual: true } : t); saveTransactions(next); return next; }); };

  const learnRule = (tx) => {
    const words = tx.description.trim().split(/\s+/).slice(0, 3).join(" ");
    setCustomRules(prev => {
      const next = [{ match: words, category: tx.category, subcategory: tx.subcategory, learned: true }, ...prev.filter(r => r.match !== words)];
      saveRules(next);
      return next;
    });
  };

  const saveEditedRule = (edited) => {
    if (!edited.match || !edited.category) return;
    setCustomRules(prev => {
      const next = prev.map(r => r.match === edited.original ? { match: edited.match, category: edited.category, subcategory: edited.subcategory, learned: r.learned } : r);
      saveRules(next);
      applyNewRules(next);
      return next;
    });
    setEditingRule(null);
  };

  const addManualRule = () => {
    if (!newRule.match || !newRule.category || !newRule.subcategory) return;
    setCustomRules(prev => {
      const next = [{ ...newRule, learned: false }, ...prev.filter(r => r.match !== newRule.match)];
      saveRules(next);
      applyNewRules(next);
      return next;
    });
    setNewRule({ match: "", category: "", subcategory: "" });
  };

  const deleteRule = (match) => {
    setCustomRules(prev => {
      const next = prev.filter(r => r.match !== match);
      saveRules(next);
      applyNewRules(next);
      return next;
    });
  };

  const renameSubcategory = (cat, oldSub, newSub) => {
    if (!newSub.trim() || newSub === oldSub) { setEditingSub(null); return; }
    setCustomCategories(prev => {
      const current = prev[cat] || BUDGET_CATEGORIES[cat] || [];
      const next = { ...prev, [cat]: current.map(s => s === oldSub ? newSub.trim() : s) };
      saveCustomCats(next);
      return next;
    });
    setBudgetOverrides(prev => {
      if (prev[oldSub] === undefined) return prev;
      const next = { ...prev, [newSub.trim()]: prev[oldSub] };
      delete next[oldSub];
      try { window.storage.set("budget-overrides", JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setBudgetFreqs(prev => {
      if (prev[oldSub] === undefined) return prev;
      const next = { ...prev, [newSub.trim()]: prev[oldSub] };
      delete next[oldSub];
      try { window.storage.set("budget-freqs", JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setTransactions(prev => prev.map(t => t.subcategory === oldSub && t.category === cat ? { ...t, subcategory: newSub.trim(), _manual: true } : t));
    setEditingSub(null);
  };


  const deleteSubcategory = (cat, sub, transferTo) => {
    // Transfer transactions if needed
    if (transferTo) {
      setTransactions(prev => {
        const next = prev.map(t => t.subcategory === sub ? { ...t, subcategory: transferTo, _manual: true } : t);
        saveTransactions(next);
        return next;
      });
    }
    // Remove from custom categories
    setCustomCategories(prev => {
      const current = prev[cat] || BUDGET_CATEGORIES[cat] || [];
      const next = { ...prev, [cat]: current.filter(s => s !== sub) };
      saveCustomCats(next);
      return next;
    });
    // Zero out budget override so built-in default can't reappear, remove freq
    setBudgetOverrides(prev => { const n = { ...prev, [sub]: -1 }; try { window.storage.set("budget-overrides", JSON.stringify(n)); } catch(_){} return n; });
    setBudgetFreqs(prev => { const n = { ...prev }; delete n[sub]; try { window.storage.set("budget-freqs", JSON.stringify(n)); } catch(_){} return n; });
    setDeleteSubModal(null);
  };

  const addSubcategory = (cat, sub) => {
    if (!sub.trim()) return;
    setCustomCategories(prev => {
      const current = prev[cat] || BUDGET_CATEGORIES[cat] || [];
      if (current.includes(sub.trim())) return prev;
      const next = { ...prev, [cat]: [...current, sub.trim()] };
      saveCustomCats(next);
      return next;
    });
  };

  const deleteTransactions = (ids) => {
    const idSet = new Set(ids);
    setTransactions(prev => {
      const next = prev.filter(t => !idSet.has(t._id));
      saveTransactions(next);
      return next;
    });
    setSelectedIdxs(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
  };

  const toggleBusiness = (id) => {
    setTransactions(prev => {
      const next = prev.map(t => t._id === id ? { ...t, _business: !t._business } : t);
      saveTransactions(next);
      return next;
    });
  };

  const toggleCatExpand = (cat) => setExpandedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const toggleSelect = (id) => setSelectedIdxs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = (ids) => setSelectedIdxs(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));

  const applyBulkUpdate = () => {
    if (!bulkEdit.category && !bulkEdit.subcategory) return;
    setTransactions(prev => {
      const next = prev.map(t => selectedIdxs.has(t._id)
        ? { ...t, ...(bulkEdit.category ? { category: bulkEdit.category } : {}), ...(bulkEdit.subcategory ? { subcategory: bulkEdit.subcategory } : {}), _manual: true }
        : t);
      saveTransactions(next);
      return next;
    });
    setSelectedIdxs(new Set());
    setBulkEdit({ category: "", subcategory: "" });
  };

  const downloadCSV = () => {
    const rows = [["Date","Amount","Description","Category","Subcategory","File"]];
    transactions.filter(t => t.category !== "_ignore").forEach(t => rows.push([t.date, t.amount, '"' + t.description + '"', t.category, t.subcategory, t.file || ""]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "categorised_transactions.csv"; a.click();
  };

  const visibleTx = transactions.filter(t => t.category !== "_ignore");
  const uncategorisedCount = visibleTx.filter(t => !t.category).length;
  const allCategories = ["All", ...Object.keys(BUDGET_CATEGORIES), "Uncategorised"];

  const availableSubcategories = filterCat && filterCat !== "All" && filterCat !== "Uncategorised"
    ? [...new Set(visibleTx.filter(t => t.category === filterCat && t.subcategory).map(t => t.subcategory))].sort()
    : [];

  const availableSources = [...new Set(visibleTx.map(t => t.file).filter(Boolean))].sort();
  const availableMonths = [...new Set(visibleTx.map(t => {
    const p = t.date.split("/");
    return p.length === 3 ? p[2] + "-" + p[1].padStart(2,"0") : null;
  }).filter(Boolean))].sort();

  const filtered = visibleTx.filter(t => {
    if (t._id === editingIdx) return true;
    if (filterCat === "Uncategorised" && t.category) return false;
    if (filterCat !== "All" && filterCat !== "Uncategorised" && t.category !== filterCat) return false;
    if (filterSub && t.subcategory !== filterSub) return false;
    if (filterSource && t.file !== filterSource) return false;
    if (filterMonth) {
      const p = t.date.split("/");
      const txMonth = p.length === 3 ? p[2] + "-" + p[1].padStart(2,"0") : null;
      if (txMonth !== filterMonth) return false;
    }
    if (filterBusiness === "business" && !t._business) return false;
    if (filterBusiness === "personal" && t._business) return false;
    return true;
  });

  const fmt = (n) => "$" + Math.round(n).toLocaleString("en-AU");


  // ── Pre-computed for Summary tab ──
  const summaryMonths = [...new Set(visibleTx.map(function(t){ const p = t.date.split("/"); return p.length === 3 ? p[2]+"-"+p[1].padStart(2,"0") : null; }).filter(Boolean))].sort();
  const summaryActiveTx = summaryMonth === "all" ? visibleTx : visibleTx.filter(function(t){ const p = t.date.split("/"); return p.length === 3 && p[2]+"-"+p[1].padStart(2,"0") === summaryMonth; });
  const summaryNumMonths = summaryMonth === "all" ? Math.max(summaryMonths.length, 1) : 1;
  const summaryGetSubBgt = function(sub){ return budgetOverrides[sub] !== undefined ? budgetOverrides[sub] : (BUDGET_SUBCATEGORY[sub] ? BUDGET_SUBCATEGORY[sub].monthly : 0); };
  const summaryCatData = Object.keys(BUDGET_CATEGORIES).filter(function(c){ return c !== "Income"; }).map(function(cat){
    const subs = effectiveCategories[cat] || [];
    const total = summaryActiveTx.filter(function(t){ return t.category === cat && t.subcategory!=="Transfer" && !isProjectTx(t) && !t._business; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0);
    const budget = subs.reduce(function(s,sub){ return s+summaryGetSubBgt(sub); },0)*summaryNumMonths;
    const count = summaryActiveTx.filter(function(t){ return t.category === cat && t.subcategory!=="Transfer" && !isProjectTx(t) && !t._business; }).length;
    const subs2 = {};
    summaryActiveTx.filter(function(t){ return t.category === cat && t.subcategory && t.subcategory!=="Transfer" && !isProjectTx(t) && !t._business; }).forEach(function(t){ if(!subs2[t.subcategory]) subs2[t.subcategory]={count:0,total:0,budget:summaryGetSubBgt(t.subcategory)*summaryNumMonths}; subs2[t.subcategory].count++; subs2[t.subcategory].total+=Math.abs(parseFloat(t.amount)||0); });
    return { cat, total, budget, count, subs: subs2 };
  });
  const summaryTotalIncome = summaryActiveTx.filter(function(t){ return t.category==="Income"; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0);
  const summaryIncomeData = (function(){
    const subs2 = {};
    summaryActiveTx.filter(function(t){ return t.category==="Income" && t.subcategory; }).forEach(function(t){
      if(!subs2[t.subcategory]) subs2[t.subcategory]={count:0,total:0,budget:summaryGetSubBgt(t.subcategory)*summaryNumMonths};
      subs2[t.subcategory].count++;
      subs2[t.subcategory].total+=Math.abs(parseFloat(t.amount)||0);
    });
    return subs2;
  }());
  const summaryTotalExpenses = summaryActiveTx.filter(function(t){ return t.category && t.category!=="Income" && t.category!=="_ignore" && t.subcategory!=="Transfer" && !isProjectTx(t) && !t._business; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0);
  const summaryTotalBgtIncome = (effectiveCategories["Income"]||[]).reduce(function(s,sub){ return s+summaryGetSubBgt(sub); },0)*summaryNumMonths;
  const summaryTotalBgtExpenses = summaryCatData.reduce(function(s,c){ return s+c.budget; },0);

  // ── Pre-computed for Budget tab ──
  const budgetGetSub = function(sub){ return budgetOverrides[sub] !== undefined ? budgetOverrides[sub] : (BUDGET_SUBCATEGORY[sub] ? BUDGET_SUBCATEGORY[sub].monthly : 0); };
  const budgetIncome = (effectiveCategories["Income"]||[]).reduce(function(s,sub){ return s+budgetGetSub(sub); },0);
  const budgetExpenses = Object.keys(BUDGET_CATEGORIES).filter(function(c){ return c!=="Income" && !PROJECT_CATEGORIES.includes(c); }).flatMap(function(c){ return effectiveCategories[c]||[]; }).reduce(function(s,sub){ return s+budgetGetSub(sub); },0);
  const budgetNet = budgetIncome - budgetExpenses;
  const budgetOver = budgetNet < 0;
  const freqFactors = { weekly: 52/12, fortnightly: 26/12, monthly: 1, quarterly: 4/12, annually: 1/12 };
  const numTxMonths = new Set(transactions.filter(function(t){ return t.category && t.category!=="_ignore"; }).map(function(t){ const p=t.date.split("/"); return p.length===3 ? p[2]+"-"+p[1].padStart(2,"0") : null; }).filter(Boolean)).size;
  const deletedSubsList = Object.entries(budgetOverrides).filter(function(e){ return e[1]===-1 && BUDGET_SUBCATEGORY[e[0]]; }).map(function(e){ return e[0]; });

  // ── Pre-computed for Cashflow tab ──
  const cfMonths = [...new Set(visibleTx.map(function(t){ const p=t.date.split("/"); return p.length===3 ? p[2]+"-"+p[1].padStart(2,"0") : null; }).filter(Boolean))].sort();
  const cfGetSubBgt = function(sub){ return budgetOverrides[sub]!==undefined ? budgetOverrides[sub] : (BUDGET_SUBCATEGORY[sub] ? BUDGET_SUBCATEGORY[sub].monthly : 0); };
  const cfGetCatBgt = function(cat){ return (effectiveCategories[cat]||[]).reduce(function(s,sub){ return s+cfGetSubBgt(sub); },0); };
  const cfTrendData = cfMonths.map(function(mo){ const yr=mo.split("-")[0]; const mn=mo.split("-")[1]; const mtx=visibleTx.filter(function(t){ const p=t.date.split("/"); return p.length===3 && p[2]+"-"+p[1].padStart(2,"0")===mo; }); const income=mtx.filter(function(t){ return t.category==="Income"; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0); const expenses=mtx.filter(function(t){ return t.category&&t.category!=="Income"&&t.category!=="_ignore"&&t.subcategory!=="Transfer"&&!isProjectTx(t)&&!t._business; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0); const label=new Date(parseInt(yr),parseInt(mn)-1,1).toLocaleString("en-AU",{month:"short",year:"2-digit"}); return {month:label,Income:Math.round(income),Expenses:Math.round(expenses),Net:Math.round(income-expenses)}; });
  const cfCatData = Object.keys(BUDGET_CATEGORIES).filter(function(c){ return c!=="Income" && !PROJECT_CATEGORIES.includes(c); }).map(function(cat){ const actual=visibleTx.filter(function(t){ return t.category===cat&&t.subcategory!=="Transfer"; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0); const budget=cfGetCatBgt(cat)*Math.max(cfMonths.length,1); return {cat,actual:Math.round(actual),budget:Math.round(budget),over:actual>budget}; }).filter(function(d){ return d.actual>0||d.budget>0; });
  const cfSubData = Object.keys(BUDGET_CATEGORIES).filter(function(c){ return c!=="Income"; }).flatMap(function(cat){ return (effectiveCategories[cat]||[]).map(function(sub){ const actual=visibleTx.filter(function(t){ return t.subcategory===sub&&sub!=="Transfer"; }).reduce(function(s,t){ return s+Math.abs(parseFloat(t.amount)||0); },0); const budget=cfGetSubBgt(sub)*Math.max(cfMonths.length,1); return {sub,actual:Math.round(actual),budget:Math.round(budget),overspend:Math.round(actual-budget)}; }); }).filter(function(d){ return d.overspend>0; }).sort(function(a,b){ return b.overspend-a.overspend; }).slice(0,10);
  const cfBgtIncome = (effectiveCategories["Income"]||[]).reduce(function(s,c){ return s+cfGetCatBgt(c); },0);
  const cfBgtExpenses = Object.keys(BUDGET_CATEGORIES).filter(function(c){ return c!=="Income"; }).reduce(function(s,c){ return s+cfGetCatBgt(c); },0);

  // ── Pre-computed for Delete modal ──
  const deleteModalCat = deleteSubModal ? deleteSubModal.cat : "";
  const deleteModalSub = deleteSubModal ? deleteSubModal.sub : "";
  const deleteAffectedTx = deleteSubModal ? transactions.filter(function(t){ return t.subcategory===deleteModalSub; }) : [];
  const deleteOtherSubs = deleteSubModal ? (effectiveCategories[deleteModalCat]||[]).filter(function(s){ return s!==deleteModalSub; }) : [];
  const deleteAllSubs = deleteSubModal ? Object.keys(BUDGET_CATEGORIES).flatMap(function(c){ return (effectiveCategories[c]||[]).filter(function(s){ return s!==deleteModalSub; }).map(function(s){ return {cat:c,sub:s}; }); }) : [];

  // ── Pre-computed for Debug in Rules tab ──
  const debugMatches = debugInput.trim() ? (function(){
    const allRules = [...customRulesRef.current, ...BUILTIN_RULES];
    const winner = applyRules(debugInput, allRules);
    return allRules.map(function(r,i){
      const isCustom = i < customRules.length;
      const pat = typeof r.match==="string" ? r.match : r.match.toString().replace(/^\//,"").replace(/\/i$/,"");
      const normDesc = debugInput.replace(/\s+/g," ").trim();
      let matched = false;
      try { matched = new RegExp(pat,"i").test(normDesc); } catch(_) { matched = normDesc.toLowerCase().includes(pat.toLowerCase()); }
      return matched ? {pat,category:r.category,subcategory:r.subcategory,isCustom,isWinner:winner&&winner.category===r.category&&winner.subcategory===r.subcategory&&!allRules.slice(0,i).some(function(rr){ const pp=typeof rr.match==="string"?rr.match:rr.match.toString().replace(/^\//,"").replace(/\/i$/,""); try{return new RegExp(pp,"i").test(normDesc);}catch(_){return false;} })} : null;
    }).filter(Boolean);
  }()) : [];

  // ── Aliases for JSX (renamed from pre-computed vars) ──
  const totalIncome = summaryTotalIncome;
  const totalExpenses = summaryTotalExpenses;
  const totalBgtIncome = summaryTotalBgtIncome;
  const totalBgtExpenses = summaryTotalBgtExpenses;
  const activeTx = summaryActiveTx;
  const monthSummary = summaryCatData;
  const variance = (actual, budget) => budget > 0 ? Math.round(((actual - budget) / budget) * 100) : null;
  const trendData = cfTrendData;
  const catData = cfCatData;
  const bgtIncome = cfBgtIncome;
  const bgtExpenses = cfBgtExpenses;
  // Debug tab
  const winner = debugMatches.length > 0 ? { category: debugMatches[0].category, subcategory: debugMatches[0].subcategory } : null;
  const matches = debugMatches;
  // Sankey (compute inline)
  const nodeW = 14, nodePad = 6;
  const sfGetSubBgt = (sub) => budgetOverrides[sub] !== undefined ? budgetOverrides[sub] : (BUDGET_SUBCATEGORY[sub] ? BUDGET_SUBCATEGORY[sub].monthly : 0);
  const sfGetCatBgt = (cat) => (effectiveCategories[cat]||[]).reduce((s,sub) => s + sfGetSubBgt(sub), 0);
  const sankeyIncomeSubs = (effectiveCategories["Income"]||[]).filter(s => sfGetSubBgt(s) > 0);
  const sankeyExpCats = Object.keys(BUDGET_CATEGORIES).filter(c => c !== "Income" && sfGetCatBgt(c) > 0);
  const totalIncomeVal = sankeyIncomeSubs.reduce((s,sub) => s + sfGetSubBgt(sub), 0);
  const sankeyNodes = [
    ...sankeyIncomeSubs.map(s => ({ id: "inc_"+s, label: s, value: sfGetSubBgt(s), col: 0, type: "incSub" })),
    { id: "total_income", label: "Total Income", value: totalIncomeVal, col: 1, type: "total" },
    ...sankeyExpCats.map(c => ({ id: "exp_cat_"+c, label: c, value: sfGetCatBgt(c), col: 2, type: "expCat", cat: c })),
    ...sankeyExpCats.flatMap(c => (effectiveCategories[c]||[]).filter(s => sfGetSubBgt(s) > 0).map(s => ({ id: "exp_sub_"+s, label: s, value: sfGetSubBgt(s), col: 3, type: "expSub", cat: c })))
  ];
  const sankeyLinks = [
    ...sankeyIncomeSubs.map(s => ({ source: "inc_"+s, target: "total_income", value: sfGetSubBgt(s) })),
    ...sankeyExpCats.map(c => ({ source: "total_income", target: "exp_cat_"+c, value: sfGetCatBgt(c) })),
    ...sankeyExpCats.flatMap(c => (effectiveCategories[c]||[]).filter(s => sfGetSubBgt(s) > 0).map(s => ({ source: "exp_cat_"+c, target: "exp_sub_"+s, value: sfGetSubBgt(s) })))
  ];
  const cols = [145, 310, 470, 650];
  const skPad = 10;
  const pxPerDollar = totalIncomeVal > 0 ? Math.min(300 / totalIncomeVal, 2) : 1;
  const layoutCol = (nodes, colIdx) => {
    const colNodes = nodes.filter(n => n.col === colIdx);
    let y = skPad;
    return colNodes.map(n => {
      const h = Math.max(2, n.value * pxPerDollar);
      const laid = { ...n, x: cols[colIdx], y, h };
      y += h + nodePad;
      return laid;
    });
  };
  const laid = [...layoutCol(sankeyNodes,0),...layoutCol(sankeyNodes,1),...layoutCol(sankeyNodes,2),...layoutCol(sankeyNodes,3)];
  const skH = Math.max(...laid.map(n => n.y + n.h)) + skPad;
  const skW = 800;
  const laidMap = Object.fromEntries(laid.map(n => [n.id, n]));
  const srcOffsets = {}, tgtOffsets = {};
  const laidLinks = sankeyLinks.map(lk => {
    const src = laidMap[lk.source], tgt = laidMap[lk.target];
    if (!src || !tgt) return null;
    const lh = Math.max(1, lk.value * pxPerDollar);
    const so = srcOffsets[lk.source] || 0;
    const to = tgtOffsets[lk.target] || 0;
    srcOffsets[lk.source] = so + lh;
    tgtOffsets[lk.target] = to + lh;
    const x1 = src.x + nodeW, x2 = tgt.x, mx = (x1 + x2) / 2;
    return { x1, x2, mx, sy: src.y + so, ty: tgt.y + to, lh, src, tgt };
  }).filter(Boolean);
  const CAT_COLORS_SK = { "Income":"#22c55e","Home & utilities":"#3b82f6","Financial & Insurance":"#8b5cf6","Groceries":"#f97316","Eating-out & Entertainment":"#ec4899","Car & Transport":"#06b6d4","Medical, personal & education":"#10b981","Children":"#f59e0b" };
  const getColor = (n) => { if (n.type==="total") return "#94a3b8"; if (n.type==="incSub") return "#22c55e"; return CAT_COLORS_SK[n.cat] || "#94a3b8"; };
  const getLinkColor = (lk) => { if (lk.src.type==="incSub"||lk.src.type==="total") return "#22c55e"; return CAT_COLORS_SK[lk.src.cat] || "#94a3b8"; };
  const fmtK = (v) => v >= 1000 ? "$" + (v/1000).toFixed(1) + "k" : "$" + Math.round(v);

  const runAiReview = async () => {
    const uncats = visibleTx.filter(t => !t.category);
    if (uncats.length === 0) return;
    setAiReviewStatus("running");
    setAiReview([]);
    setTab("review");
    const cats = Object.fromEntries(Object.keys(effectiveCategories).map(c => [c, effectiveCategories[c]]));
    const BATCH = 20;
    let allResults = [];
    for (let i = 0; i < uncats.length; i += BATCH) {
      const batch = uncats.slice(i, i + BATCH);
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{
              role: "user",
              content: `You are categorising Australian bank transactions for a personal budget app.
Available categories and subcategories: ${JSON.stringify(cats)}

For each transaction, use your knowledge of Australian businesses and merchants to determine the best category and subcategory. Use web search if you are unsure what a merchant is.

Transactions to categorise:
${batch.map((t, idx) => idx + ". \"" + t.description + "\" (amount: $" + Math.abs(parseFloat(t.amount)||0).toFixed(2) + ")").join("\n")}

Respond ONLY with a JSON array, one entry per transaction:
[{"index":0,"category":"Groceries","subcategory":"Supermarket","reason":"Coles is a supermarket chain"}]

Every transaction must have an entry. If genuinely unsure, use your best guess and note it in reason.`
            }]
          })
        });
        const data = await response.json();
        const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean.slice(clean.indexOf("["), clean.lastIndexOf("]") + 1));
        const batchResults = batch.map((tx, idx) => {
          const match = parsed.find(p => p.index === idx);
          return {
            tx,
            category: match ? match.category : "",
            subcategory: match ? match.subcategory : "",
            reason: match ? match.reason : "Could not determine",
            confirmed: null,
            overrideCat: "",
            overrideSub: "",
          };
        });
        allResults = [...allResults, ...batchResults];
        setAiReview([...allResults]);
      } catch(e) {
        const batchResults = batch.map(tx => ({ tx, category: "", subcategory: "", reason: "Error: " + e.message, confirmed: null, overrideCat: "", overrideSub: "" }));
        allResults = [...allResults, ...batchResults];
        setAiReview([...allResults]);
      }
    }
    setAiReviewStatus("done");
  };

  const applyAiReview = () => {
    const toApply = aiReview.filter(r => r.confirmed !== false);
    setTransactions(prev => {
      const next = prev.map(t => {
        const match = toApply.find(r => r.tx._id === t._id);
        if (!match) return t;
        const cat = match.overrideCat || match.category;
        const sub = match.overrideSub || match.subcategory;
        return cat ? { ...t, category: cat, subcategory: sub, _manual: true } : t;
      });
      saveTransactions(next);
      return next;
    });
    setAiReview([]);
    setAiReviewStatus("idle");
    setTab("transactions");
  };

  const exportAllData = async () => {
    try {
      setAiStatus("Exporting all data...");
      const load = async (key) => {
        try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch(_) { return null; }
      };
      const txRaw = await load("transactions");
      const rules = await load("custom-rules");
      const overrides = await load("budget-overrides");
      const freqs = await load("budget-freqs");
      const cats = await load("custom-categories");
      const projBudgets = await load("project-budgets");
      const txList = txRaw || transactions;

      // Compute summary stats
      const catBreakdown = {};
      const fileBreakdown = {};
      txList.forEach(t => {
        const cat = t.category || "Uncategorised";
        catBreakdown[cat] = (catBreakdown[cat] || 0) + 1;
        const src = t.file || "unknown";
        fileBreakdown[src] = (fileBreakdown[src] || 0) + 1;
      });
      const dates = txList.map(t => t.date).filter(Boolean).sort();
      const deletedSubsList = overrides ? Object.entries(overrides).filter(([,v]) => v === -1).map(([k]) => k) : [];

      const exportObj = {
        exportedAt: new Date().toISOString(),
        sourceApp: "budget-categoriser.jsx",
        sourceChat: "2eafe99b-cff6-40fe-afaf-0587686d0830",
        transactions: txList,
        customRules: rules || [],
        budgetOverrides: overrides || {},
        budgetFreqs: freqs || {},
        customCategories: cats || {},
        projectBudgets: projBudgets || {},
        deletedSubs: deletedSubsList,
        csvFormatMappings: {},
        businessExpenseFlags: Object.fromEntries(txList.filter(t => t._business).map(t => [t._id, true])),
        summary: {
          totalTransactions: txList.length,
          dateRange: dates.length ? { from: dates[0], to: dates[dates.length-1] } : null,
          byCategory: catBreakdown,
          bySourceFile: fileBreakdown,
          businessFlaggedCount: txList.filter(t => t._business).length,
          manuallyCategoirsedCount: txList.filter(t => t._manual).length,
          uncategorisedCount: txList.filter(t => !t.category).length,
          customRulesCount: (rules || []).length,
        }
      };

      // Build CSV string
      const csvRows = [["_id","date","amount","description","category","subcategory","file","_manual","_business"]];
      txList.forEach(t => csvRows.push([
        t._id, t.date, t.amount,
        '"' + (t.description || "").replace(/"/g, '""') + '"',
        t.category || "", t.subcategory || "",
        t.file || "", t._manual ? "true" : "false", t._business ? "true" : "false"
      ]));
      const csvStr = csvRows.map(r => r.join(",")).join("\n");
      const jsonStr = JSON.stringify(exportObj, null, 2);

      setExportData({ json: jsonStr, csv: csvStr, summary: exportObj.summary });
      setTab("export");
      setAiStatus("Export ready — copy the data below");
      setTimeout(() => setAiStatus(""), 5000);
    } catch(e) {
      setAiStatus("Export failed: " + e.message);
      setTimeout(() => setAiStatus(""), 5000);
    }
  };

  const updateBudgetFromActuals = () => {
    if (numTxMonths === 0) return;
    const next = { ...budgetOverrides };
    Object.keys(effectiveCategories).forEach(cat => {
      (effectiveCategories[cat] || []).forEach(sub => {
        const total = transactions.filter(t => t.subcategory === sub && t.category !== "_ignore")
          .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);
        next[sub] = Math.round(total / numTxMonths);
      });
    });
    setBudgetOverrides(next);
    try { window.storage.set("budget-overrides", JSON.stringify(next)); } catch(_) {}
  };

  // ── Pre-computed for Projects ──
  const projectData = [...PROJECT_CATEGORIES, "Financial & Insurance"].map(cat => {
    const isWholeCategory = PROJECT_CATEGORIES.includes(cat);
    const subs = isWholeCategory
      ? (effectiveCategories[cat] || [])
      : PROJECT_SUBCATEGORIES.filter(s => (effectiveCategories[cat] || []).includes(s));
    if (subs.length === 0) return null;
    const totalSpent = visibleTx
      .filter(t => isWholeCategory ? t.category === cat : PROJECT_SUBCATEGORIES.includes(t.subcategory))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);
    const totalBudget = (projectBudgets[cat] || 0);
    const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : null;
    const subBreakdown = subs.map(sub => ({
      sub,
      spent: visibleTx.filter(t => t.subcategory === sub).reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0),
    }));
    return { cat, subs, totalSpent, totalBudget, pct, subBreakdown, isWholeCategory };
  }).filter(Boolean);

  return (
    <>
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Budget Tracker</h1>
          <p className="text-xs text-gray-400">Steve &amp; Liz</p>
        </div>
        <div className="flex gap-2">
          {transactions.length > 0 && (
            <button onClick={downloadCSV} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium">
              Export CSV
            </button>
          )}
          <button onClick={exportAllData}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
            title="Export all app data for migration">
            ⬇ Export All Data
          </button>
          {transactions.some(t => t._business) && (
            <button onClick={() => {
              const biz = transactions.filter(t => t._business);
              const rows = [["Date","Amount","Description","Category","Subcategory","File"]];
              biz.forEach(t => rows.push([t.date, t.amount, '"' + t.description + '"', t.category, t.subcategory, t.file || ""]));
              const csv = rows.map(r => r.join(",")).join("\n");
              const a = document.createElement("a");
              a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
              a.download = "business_expenses.csv"; a.click();
            }} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium">
              💼 Business ({transactions.filter(t => t._business).length})
            </button>
          )}
          {transactions.length > 0 && (
            <button onClick={() => { if (window.confirm("Clear all transactions?")) { setTransactions([]); try { window.storage.delete("transactions"); } catch(_){} } }}
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-600 px-3 py-1.5 rounded-lg font-medium">
              Clear
            </button>
          )}
          {visibleTx.filter(t => !t.category).length > 0 && (
            <button onClick={runAiReview}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium">
              AI Review ({visibleTx.filter(t => !t.category).length})
            </button>
          )}
          <label className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium cursor-pointer">
            Upload CSV
            <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1">
        {["transactions", "summary", "budget", "cashflow", "rules", "review", "export"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t}
            {t === "rules" && ` (${customRules.length})`}
            {t === "transactions" && uncategorisedCount > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{uncategorisedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* AI Status */}
      {aiStatus && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-sm text-blue-700 text-center font-medium">
          {aiStatus}
        </div>
      )}

      <div className="p-4 max-w-5xl mx-auto">

        {/* Empty state */}
        {transactions.length === 0 && (
          <div className="text-center py-16" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Ready to categorise</h2>
            <p className="text-gray-400 text-sm">Drop a CSV here or use the Upload button above</p>
          </div>
        )}

        {/* ── TRANSACTIONS TAB ── */}
        {tab === "transactions" && transactions.length > 0 && (
          <div>
            {/* Category filters */}
            <div className="space-y-2 mb-3">
              <div className="flex flex-wrap gap-1.5">
                {allCategories.map(cat => (
                  <button key={cat} onClick={() => { setFilterCat(cat); setFilterSub(""); }}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filterCat === cat ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {cat}{cat === "Uncategorised" && uncategorisedCount > 0 ? ` (${uncategorisedCount})` : ""}
                  </button>
                ))}
              </div>
              {availableSubcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-2 border-l-2 border-blue-200">
                  <button onClick={() => setFilterSub("")}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filterSub === "" ? "bg-blue-100 text-blue-700" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    All subcategories
                  </button>
                  {availableSubcategories.map(sub => (
                    <button key={sub} onClick={() => setFilterSub(sub)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filterSub === sub ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source & Month filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <select className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 bg-white"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}>
                <option value="">All months</option>
                {availableMonths.map(m => {
                  const [y, mo] = m.split("-");
                  const label = new Date(parseInt(y), parseInt(mo)-1).toLocaleString("en-AU", { month: "short", year: "numeric" });
                  return <option key={m} value={m}>{label}</option>;
                })}
              </select>
              <select className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 bg-white"
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}>
                <option value="">All sources</option>
                {availableSources.map(s => (
                  <option key={s} value={s}>{s.replace(/\.csv$/i,"").replace(/_/g," ")}</option>
                ))}
              </select>
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setFilterBusiness("all")}
                  className={"text-xs px-2.5 py-1 font-medium " + (filterBusiness === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  All
                </button>
                <button onClick={() => setFilterBusiness("personal")}
                  className={"text-xs px-2.5 py-1 font-medium border-l border-gray-200 " + (filterBusiness === "personal" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  Personal
                </button>
                <button onClick={() => setFilterBusiness("business")}
                  className={"text-xs px-2.5 py-1 font-medium border-l border-gray-200 " + (filterBusiness === "business" ? "bg-amber-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  💼 Business
                </button>
              </div>
              {(filterMonth || filterSource || filterBusiness !== "all") && (
                <button onClick={() => { setFilterMonth(""); setFilterSource(""); setFilterBusiness("all"); }}
                  className="text-xs text-gray-400 hover:text-red-500">
                  Clear filters
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{filtered.length} transactions</span>
            </div>

            {/* Bulk edit bar */}
            {selectedIdxs.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-blue-700">{selectedIdxs.size} selected</span>
                <select className="border rounded px-2 py-1 text-xs" value={bulkEdit.category}
                  onChange={e => setBulkEdit(b => ({ ...b, category: e.target.value, subcategory: "" }))}>
                  <option value="">Set category...</option>
                  {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                  <option value="_ignore">Ignore (skip)</option>
                </select>
                <select className="border rounded px-2 py-1 text-xs" value={bulkEdit.subcategory}
                  onChange={e => setBulkEdit(b => ({ ...b, subcategory: e.target.value }))} disabled={!bulkEdit.category}>
                  <option value="">Set subcategory...</option>
                  {(effectiveCategories[bulkEdit.category] || []).map(s => <option key={s}>{s}</option>)}
                </select>
                <button onClick={applyBulkUpdate} disabled={!bulkEdit.category && !bulkEdit.subcategory}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1 rounded font-medium">
                  Apply to {selectedIdxs.size} transactions
                </button>
                <button onClick={() => { setSelectedIdxs(new Set()); setBulkEdit({ category: "", subcategory: "" }); }}
                  className="text-xs text-gray-500 hover:text-gray-700">Clear selection</button>
                <button onClick={() => deleteTransactions([...selectedIdxs])}
                  className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded font-medium ml-auto">
                  🗑 Delete {selectedIdxs.size}
                </button>
              </div>
            )}

            {/* Source toggle */}
            <div className="flex justify-end mb-1">
              <button onClick={() => setShowSource(s => !s)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${showSource ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {showSource ? "Hide source" : "Show source"}
              </button>
            </div>

            {/* Transaction table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" className="rounded"
                        checked={filtered.length > 0 && filtered.every(tx => selectedIdxs.has(tx._id))}
                        onChange={() => toggleSelectAll(filtered.map(tx => tx._id))} />
                    </th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Subcategory</th>
                    {showSource && <th className="px-3 py-2 text-left">Source</th>}
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(tx => {
                    const isEditing = editingIdx === tx._id;
                    const amt = parseFloat(tx.amount) || 0;
                    return (
                      <tr key={tx._id} className={`hover:bg-gray-50 ${selectedIdxs.has(tx._id) ? "bg-blue-50" : tx._business ? "bg-yellow-50" : !tx.category ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-1.5 w-8">
                          <input type="checkbox" className="rounded" checked={selectedIdxs.has(tx._id)} onChange={() => toggleSelect(tx._id)} />
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 text-xs whitespace-nowrap">{tx.date}</td>
                        <td className="px-3 py-1.5 max-w-xs text-xs" title={tx.description}>
                          <span className="text-gray-800 truncate">{tx.description}</span>
                          {tx._business && <span className="ml-1.5 text-amber-500 text-xs font-medium">💼</span>}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono text-xs ${amt >= 0 ? "text-green-600" : "text-red-500"}`}>
                          ${Math.abs(amt).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <select className="border rounded px-1.5 py-0.5 text-xs w-full" value={tx.category}
                              onChange={e => updateTx(tx._id, { category: e.target.value, subcategory: "" })}>
                              <option value="">-- select --</option>
                              {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                              <option value="_ignore">Ignore (skip)</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[tx.category] || CATEGORY_COLORS["Uncategorised"]}`}>
                              {tx.category === "_ignore" ? "Ignored" : tx.category || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <select className="border rounded px-1.5 py-0.5 text-xs w-full" value={tx.subcategory}
                              onChange={e => updateTx(tx._id, { subcategory: e.target.value })}>
                              <option value="">-- select --</option>
                              {(effectiveCategories[tx.category] || []).map(s => <option key={s}>{s}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-500">{tx.subcategory || ""}</span>
                          )}
                        </td>
                        {showSource && (
                          <td className="px-3 py-1.5">
                            <span className="text-xs text-gray-400 font-mono" title={tx.file}>
                              {tx.file ? tx.file.replace(/\.csv$/i, "").replace(/_/g, " ") : "—"}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex gap-1 justify-end">
                              {tx.category && tx.subcategory && (
                                <button onClick={() => { learnRule(tx); setEditingIdx(null); }}
                                  className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-200">
                                  Learn
                                </button>
                              )}
                              <button onClick={() => setEditingIdx(null)}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200">
                                Done
                              </button>
                              <button onClick={() => { deleteTransactions([tx._id]); setEditingIdx(null); }}
                                className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded hover:bg-red-200">
                                Delete
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end items-center">
                              <button onClick={() => toggleBusiness(tx._id)}
                                className={"text-xs px-1 " + (tx._business ? "text-amber-500" : "text-gray-300 hover:text-amber-400")}
                                title={tx._business ? "Business expense — click to unflag" : "Flag as business expense"}>
                                💼
                              </button>
                              <button onClick={() => setEditingIdx(tx._id)} className="text-xs text-gray-400 hover:text-blue-500 px-1">
                                Edit
                              </button>
                              {tx.category && (
                                <button title="Re-apply rules to this transaction"
                                  onClick={() => {
                                    const allRules = [...customRulesRef.current, ...BUILTIN_RULES];
                                    const r = applyRules(tx.description, allRules);
                                    setTransactions(prev => {
                                      const next = prev.map(t => t._id === tx._id
                                        ? r ? { ...t, ...r, _manual: false } : { ...t, category: "", subcategory: "", _manual: false }
                                        : t);
                                      saveTransactions(next);
                                      return next;
                                    });
                                  }}
                                  className="text-xs text-orange-300 hover:text-orange-500 px-1">
                                  ↺
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-gray-400 border-t">
                {filtered.length} transactions shown
              </div>
            </div>
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {tab === "summary" && transactions.length > 0 && (

            <div className="space-y-3">
              {/* Month selector */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setSummaryMonth("all")}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium ${summaryMonth === "all" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  All months
                </button>
                {summaryMonths.map(m => {
                  const [y, mo] = m.split("-");
                  const label = new Date(parseInt(y), parseInt(mo)-1).toLocaleString("en-AU", { month: "short", year: "numeric" });
                  return (
                    <button key={m} onClick={() => setSummaryMonth(m)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium ${summaryMonth === m ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Overall position */}
              <div className={`rounded-xl p-4 border-2 ${(summaryTotalIncome - summaryTotalExpenses) < 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className={`text-base font-bold ${(summaryTotalIncome - summaryTotalExpenses) < 0 ? "text-red-700" : "text-green-700"}`}>
                      {(summaryTotalIncome - summaryTotalExpenses) < 0 ? "Over budget" : "Under budget"}
                    </div>
                    <div className={`text-xs mt-0.5 ${(summaryTotalIncome - summaryTotalExpenses) < 0 ? "text-red-500" : "text-green-600"}`}>
                      {(summaryTotalIncome - summaryTotalExpenses) < 0 ? `Spending ${fmt(Math.abs(summaryTotalIncome - summaryTotalExpenses))} more than earned` : `${fmt(summaryTotalIncome - summaryTotalExpenses)} surplus`}
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Income</div>
                      <div className="text-sm font-semibold">{fmt(totalIncome)}</div>
                      <div className="text-xs text-gray-400">bgt {fmt(totalBgtIncome)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Expenses</div>
                      <div className="text-sm font-semibold">{fmt(totalExpenses)}</div>
                      <div className="text-xs text-gray-400">bgt {fmt(totalBgtExpenses)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Net</div>
                      <div className={`text-lg font-bold ${(summaryTotalIncome - summaryTotalExpenses) < 0 ? "text-red-600" : "text-green-600"}`}>
                        {(summaryTotalIncome - summaryTotalExpenses) < 0 ? "-" : "+"}{fmt(Math.abs(summaryTotalIncome - summaryTotalExpenses))}
                      </div>
                      <div className={`text-xs ${(summaryTotalIncome - summaryTotalExpenses) - (summaryTotalBgtIncome - summaryTotalBgtExpenses) >= 0 ? "text-green-500" : "text-red-400"}`}>
                        {(summaryTotalIncome - summaryTotalExpenses) - (summaryTotalBgtIncome - summaryTotalBgtExpenses) >= 0 ? "+" : ""}{fmt((summaryTotalIncome - summaryTotalExpenses) - (summaryTotalBgtIncome - summaryTotalBgtExpenses))} vs bgt
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Expenses as % of income</span>
                    <span>{totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0}%</span>
                  </div>
                  <div className="bg-white rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full ${(summaryTotalIncome - summaryTotalExpenses) < 0 ? "bg-red-400" : "bg-green-400"}`}
                      style={{ width: `${Math.min(totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 100, 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* Income card */}
              {summaryTotalIncome > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button onClick={() => toggleCatExpand("Income")}
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:opacity-90 bg-emerald-100 text-emerald-800">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">Income</span>
                      <span className="text-xs opacity-70">{summaryActiveTx.filter(t => t.category === "Income").length} transactions</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs opacity-60">Budget</div>
                        <div className="text-sm font-medium">{summaryTotalBgtIncome > 0 ? fmt(summaryTotalBgtIncome) : "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs opacity-60">Actual</div>
                        <div className="text-lg font-bold">{fmt(summaryTotalIncome)}</div>
                      </div>
                      {summaryTotalBgtIncome > 0 && (
                        <div className="text-right min-w-10">
                          <div className="text-xs opacity-60">vs Budget</div>
                          <div className={`text-sm font-bold ${summaryTotalIncome >= summaryTotalBgtIncome ? "text-green-600" : "text-red-600"}`}>
                            {summaryTotalIncome >= summaryTotalBgtIncome ? "+" : ""}{Math.round(((summaryTotalIncome - summaryTotalBgtIncome) / summaryTotalBgtIncome) * 100)}%
                          </div>
                        </div>
                      )}
                      <span className="text-xs opacity-50">{expandedCats.has("Income") ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expandedCats.has("Income") && (
                    <div className="divide-y divide-gray-50">
                      {Object.entries(summaryIncomeData).sort((a, b) => b[1].total - a[1].total).map(([sub, st]) => {
                        const subOver = st.budget > 0 && st.total < st.budget;
                        const subVari = st.budget > 0 ? Math.round(((st.total - st.budget) / st.budget) * 100) : null;
                        const isDrilldown = drilldown && drilldown.cat === "Income" && drilldown.sub === sub;
                        const subTxs = summaryActiveTx.filter(t => t.category === "Income" && t.subcategory === sub).sort((a, b) => b.date.localeCompare(a.date));
                        return (
                          <div key={sub}>
                            <button onClick={() => setDrilldown(isDrilldown ? null : { cat: "Income", sub })}
                              className={`w-full text-left px-6 py-2.5 flex items-center justify-between hover:bg-gray-50 ${isDrilldown ? "bg-emerald-50" : ""}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700">{sub}</span>
                                <span className="text-xs text-gray-400">{st.count} transactions</span>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <div className="text-xs text-gray-400">Budget</div>
                                  <div className="text-xs text-gray-500">{st.budget > 0 ? fmt(st.budget) : "—"}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-gray-400">Actual</div>
                                  <div className="text-sm font-semibold text-gray-800">{fmt(st.total)}</div>
                                </div>
                                {subVari !== null && (
                                  <div className={`text-xs font-bold min-w-10 text-right ${subOver ? "text-red-500" : "text-green-500"}`}>
                                    {subVari >= 0 ? "+" : ""}{subVari}%
                                  </div>
                                )}
                              </div>
                            </button>
                            {isDrilldown && (
                              <div className="bg-emerald-50 border-t border-emerald-100 px-6 py-2">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {subTxs.map(tx => (
                                      <tr key={tx._id} className="border-b border-emerald-100 last:border-0">
                                        <td className="py-1.5 text-gray-400 pr-3 whitespace-nowrap">{tx.date}</td>
                                        <td className="py-1.5 text-gray-700">{tx.description}</td>
                                        <td className="py-1.5 text-right font-mono text-gray-800">${Math.abs(parseFloat(tx.amount)||0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-emerald-200">
                                      <td colSpan="2" className="pt-1.5 text-gray-400 font-medium">Total ({subTxs.length})</td>
                                      <td className="pt-1.5 text-right font-mono font-semibold text-gray-700">
                                        ${subTxs.reduce((s,t) => s + Math.abs(parseFloat(t.amount)||0), 0).toFixed(2)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Category cards */}
              {monthSummary.map(({ cat, count, total, budget, subs }) => {
                const isExpanded = expandedCats.has(cat);
                const colorClass = CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-700";
                const over = budget > 0 && total > budget;
                const vari = variance(total, budget);
                const sortedSubs = Object.entries(subs).sort((a, b) => b[1].total - a[1].total);
                return (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button onClick={() => toggleCatExpand(cat)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between hover:opacity-90 ${colorClass}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{cat}</span>
                        <span className="text-xs opacity-70">{count} transactions</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs opacity-60">Budget</div>
                          <div className="text-sm font-medium">{budget > 0 ? fmt(budget) : "—"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs opacity-60">Actual</div>
                          <div className="text-lg font-bold">{fmt(total)}</div>
                        </div>
                        {vari !== null && (
                          <div className="text-right min-w-10">
                            <div className="text-xs opacity-60">vs Budget</div>
                            <div className={`text-sm font-bold ${over ? "text-red-600" : "text-green-600"}`}>
                              {over ? "+" : ""}{vari}%
                            </div>
                          </div>
                        )}
                        <span className="text-xs opacity-50">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="divide-y divide-gray-50">
                        {sortedSubs.map(([sub, st]) => {
                          const sb = st.budget;
                          const subOver = sb > 0 && st.total > sb;
                          const subVari = variance(st.total, sb);
                          const isDrilldown = drilldown && drilldown.cat === cat && drilldown.sub === sub;
                          const subTxs = activeTx.filter(t => t.category === cat && (t.subcategory || "Unassigned") === sub)
                            .sort((a, b) => b.date.localeCompare(a.date));
                          return (
                            <div key={sub}>
                              <button onClick={() => setDrilldown(isDrilldown ? null : { cat, sub })}
                                className={`w-full text-left px-6 py-2.5 flex items-center justify-between hover:bg-gray-50 ${isDrilldown ? "bg-blue-50" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-700">{sub}</span>
                                  <span className="text-xs text-gray-400">{st.count} transactions</span>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <div className="text-xs text-gray-400">Budget</div>
                                    <div className="text-xs text-gray-500">{sb > 0 ? fmt(sb) : "—"}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-gray-400">Actual</div>
                                    <div className="text-sm font-semibold text-gray-800">{fmt(st.total)}</div>
                                  </div>
                                  {subVari !== null && (
                                    <div className={`text-xs font-bold min-w-10 text-right ${subOver ? "text-red-500" : "text-green-500"}`}>
                                      {subOver ? "+" : ""}{subVari}%
                                    </div>
                                  )}
                                </div>
                              </button>
                              {isDrilldown && (
                                <div className="bg-blue-50 border-t border-blue-100 px-6 py-2">
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {subTxs.map(tx => (
                                        <tr key={tx._id} className="border-b border-blue-100 last:border-0">
                                          <td className="py-1.5 text-gray-400 pr-3 whitespace-nowrap">{tx.date}</td>
                                          <td className="py-1.5 text-gray-700">{tx.description}{parseFloat(tx.amount) > 0 ? <span className="ml-1.5 text-xs text-green-600 font-medium">(refund/reimbursement)</span> : null}</td>
                                          <td className={"py-1.5 text-right font-mono " + (parseFloat(tx.amount) > 0 ? "text-green-600 font-semibold" : "text-gray-800")}>
                                            {parseFloat(tx.amount) > 0 ? "-" : ""}${Math.abs(parseFloat(tx.amount)||0).toFixed(2)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-blue-200">
                                        <td colSpan="2" className="pt-1.5 text-gray-400 font-medium">Total ({subTxs.length})</td>
                                        <td className="pt-1.5 text-right font-mono font-semibold text-gray-700">
                                          ${subTxs.reduce((s,t) => s + Math.abs(parseFloat(t.amount)||0), 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {uncategorisedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-amber-800">Uncategorised</span>
                  <span className="text-xs text-amber-600">{uncategorisedCount} transactions need review</span>
                </div>
              )}

              {/* Projects summary card */}
              {projectData.some(p => p.totalSpent > 0) && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-amber-200">
                    <span className="font-bold text-amber-900 text-sm">Projects & Capital Expenditure</span>
                    <p className="text-xs text-amber-700 mt-0.5">Below-the-line spend — excluded from income/expense above</p>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {projectData.filter(p => p.totalSpent > 0).map(proj => (
                      <div key={proj.cat} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-sm text-amber-900">{proj.cat}</span>
                          <div className="text-sm font-bold text-amber-900">
                            {fmt(proj.totalSpent)}
                            {proj.totalBudget > 0 && <span className="text-xs font-normal text-amber-600"> / {fmt(proj.totalBudget)} budget</span>}
                          </div>
                        </div>
                        {proj.pct !== null && (
                          <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-amber-200 mb-2">
                            <div className={`h-2 rounded-full ${proj.pct >= 100 ? "bg-red-400" : proj.pct >= 80 ? "bg-amber-400" : "bg-green-400"}`}
                              style={{ width: proj.pct + "%" }} />
                          </div>
                        )}
                        <div className="space-y-0.5">
                          {proj.subBreakdown.filter(s => s.spent > 0).map(s => {
                            const isDrilldown = drilldown && drilldown.cat === proj.cat && drilldown.sub === s.sub;
                            const subTxs = summaryActiveTx.filter(t => t.subcategory === s.sub).sort((a, b) => b.date.localeCompare(a.date));
                            return (
                              <div key={s.sub}>
                                <button onClick={() => setDrilldown(isDrilldown ? null : { cat: proj.cat, sub: s.sub })}
                                  className={`w-full flex justify-between items-center text-xs px-2 py-1.5 rounded hover:bg-amber-100 ${isDrilldown ? "bg-amber-100" : ""}`}>
                                  <span className="text-amber-800 font-medium">{s.sub}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-amber-700">{fmt(s.spent)}</span>
                                    <span className="text-amber-400 text-xs">{isDrilldown ? "▲" : "▼"}</span>
                                  </div>
                                </button>
                                {isDrilldown && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg mx-1 mb-1 px-3 py-2">
                                    <table className="w-full text-xs">
                                      <tbody>
                                        {subTxs.map(tx => (
                                          <tr key={tx._id} className="border-b border-amber-100 last:border-0">
                                            <td className="py-1.5 text-gray-400 pr-3 whitespace-nowrap">{tx.date}</td>
                                            <td className="py-1.5 text-gray-700">{tx.description}</td>
                                            <td className="py-1.5 text-right font-mono text-gray-800">${Math.abs(parseFloat(tx.amount)||0).toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t border-amber-200">
                                          <td colSpan="2" className="pt-1.5 text-gray-400 font-medium">Total ({subTxs.length})</td>
                                          <td className="pt-1.5 text-right font-mono font-semibold text-amber-800">
                                            ${subTxs.reduce((s,t) => s + Math.abs(parseFloat(t.amount)||0), 0).toFixed(2)}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          
        )}

        {/* ── BUDGET TAB ── */}
        {tab === "budget" && (

            <div className="space-y-4">
              {/* Update from actuals button */}
              {transactions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-blue-800">Update from actuals</div>
                    <div className="text-xs text-blue-600 mt-0.5">
                      Set each budget line to the monthly average across {numTxMonths} loaded month{numTxMonths !== 1 ? "s" : ""} of transactions
                    </div>
                  </div>
                  <button onClick={() => updateBudgetFromActuals()}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium flex-shrink-0">
                    Update budget
                  </button>
                </div>
              )}
              {/* Position card */}
              <div className={`rounded-xl p-4 border-2 ${budgetOver ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className={`text-base font-bold ${budgetOver ? "text-red-700" : "text-green-700"}`}>
                      {budgetOver ? "Budget in deficit" : "Budget in surplus"}
                    </div>
                    <div className={`text-xs mt-0.5 ${budgetOver ? "text-red-500" : "text-green-600"}`}>
                      {budgetOver ? `Expenses exceed income by ${fmt(Math.abs(budgetNet))} / mo` : `${fmt(budgetNet)} / mo surplus`}
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Income</div>
                      <div className="text-lg font-bold text-gray-800">{fmt(budgetIncome)}<span className="text-xs font-normal text-gray-400"> /mo</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Expenses</div>
                      <div className="text-lg font-bold text-gray-800">{fmt(budgetExpenses)}<span className="text-xs font-normal text-gray-400"> /mo</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Net</div>
                      <div className={`text-lg font-bold ${budgetOver ? "text-red-600" : "text-green-600"}`}>
                        {budgetOver ? "-" : "+"}{fmt(Math.abs(budgetNet))}<span className="text-xs font-normal"> /mo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                Enter amounts in your preferred frequency — everything converts to monthly for the Summary.
              </div>

              {Object.keys(BUDGET_CATEGORIES).filter(cat => !PROJECT_CATEGORIES.includes(cat)).map(cat => {
                const catSubs = (effectiveCategories[cat] || []).filter(sub => !PROJECT_SUBCATEGORIES.includes(sub));
                const catTotal = catSubs.reduce((s, sub) => s + budgetGetSub(sub), 0);
                const colorClass = CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-700";
                return (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className={`px-4 py-2.5 flex items-center justify-between ${colorClass}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{cat}</span>
                        <span className="text-xs opacity-60">{cat === "Income" ? "income" : "expense"}</span>
                      </div>
                      <span className="text-sm font-bold">{fmt(catTotal)} / mo</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {catSubs.map(sub => {
                        const defaultAmt = BUDGET_SUBCATEGORY[sub] ? BUDGET_SUBCATEGORY[sub].monthly : 0;
                        const current = budgetGetSub(sub);
                        const isModified = budgetOverrides[sub] !== undefined && budgetOverrides[sub] !== defaultAmt;
                        const freq = budgetFreqs[sub] || "monthly";
                        const factor = freqFactors[freq] || 1;
                        const displayVal = Math.round(current / factor);
                        return (
                          <div key={sub} className="px-4 py-2.5 flex items-center justify-between gap-3 group">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {editingSub && editingSub.cat === cat && editingSub.sub === sub ? (
                                <div className="flex items-center gap-1 flex-1">
                                  <input autoFocus className="border border-blue-300 rounded px-2 py-0.5 text-sm flex-1 min-w-0"
                                    value={editingSub.value}
                                    onChange={e => setEditingSub(s => ({ ...s, value: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") renameSubcategory(cat, sub, editingSub.value);
                                      if (e.key === "Escape") setEditingSub(null);
                                    }} />
                                  <button onClick={() => renameSubcategory(cat, sub, editingSub.value)}
                                    className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Save</button>
                                  <button onClick={() => setEditingSub(null)} className="text-xs text-gray-400">Cancel</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="text-sm text-gray-700 truncate">{sub}</span>
                                  <button onClick={() => setEditingSub({ cat, sub, value: sub })}
                                    className="text-xs text-gray-300 hover:text-blue-500 flex-shrink-0" title="Rename">✏️</button>
                                  <button onClick={() => setDeleteSubModal({ cat, sub, transferTo: "" })}
                                    className="text-xs text-gray-300 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete subcategory">🗑</button>
                                </div>
                              )}
                              {isModified && !(editingSub && editingSub.sub === sub) && (
                                <button onClick={() => {
                                  setBudgetOverrides(prev => { const n = { ...prev }; delete n[sub]; try { window.storage.set("budget-overrides", JSON.stringify(n)); } catch(_){} return n; });
                                  setBudgetFreqs(prev => { const n = { ...prev }; delete n[sub]; try { window.storage.set("budget-freqs", JSON.stringify(n)); } catch(_){} return n; });
                                }} className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0" title="Reset">
                                  Reset
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <select className="border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-500 bg-white" value={freq}
                                onChange={e => {
                                  const nf = e.target.value;
                                  setBudgetFreqs(prev => { const n = { ...prev, [sub]: nf }; try { window.storage.set("budget-freqs", JSON.stringify(n)); } catch(_){} return n; });
                                }}>
                                <option value="weekly">/ week</option>
                                <option value="fortnightly">/ fortnight</option>
                                <option value="monthly">/ month</option>
                                <option value="quarterly">/ quarter</option>
                                <option value="annually">/ year</option>
                              </select>
                              <input type="number" min="0" step="1"
                                className={`border rounded px-2 py-1 text-sm w-24 text-right ${isModified ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                                value={displayVal}
                                onKeyDown={e => e.stopPropagation()}
                                onChange={e => {
                                  const entered = parseFloat(e.target.value);
                                  if (isNaN(entered)) return;
                                  const monthly = entered * factor;
                                  setBudgetOverrides(prev => { const n = { ...prev, [sub]: monthly }; try { window.storage.set("budget-overrides", JSON.stringify(n)); } catch(_){} return n; });
                                }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Add subcategory */}
                    {addingToCat === cat ? (
                      <div className="px-4 py-2 flex items-center gap-2 border-t border-dashed border-gray-200">
                        <input autoFocus className="border border-blue-300 rounded px-2 py-1 text-sm flex-1"
                          placeholder="New subcategory name..." value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && newSubName.trim()) { addSubcategory(cat, newSubName); setNewSubName(""); setAddingToCat(null); }
                            if (e.key === "Escape") { setAddingToCat(null); setNewSubName(""); }
                          }} />
                        <button onClick={() => { if (newSubName.trim()) addSubcategory(cat, newSubName); setNewSubName(""); setAddingToCat(null); }}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Add</button>
                        <button onClick={() => { setAddingToCat(null); setNewSubName(""); }}
                          className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingToCat(cat); setNewSubName(""); }}
                        className="w-full px-4 py-2 text-left text-xs text-gray-400 hover:text-blue-500 hover:bg-gray-50 border-t border-dashed border-gray-100">
                        + Add subcategory
                      </button>
                    )}
                  </div>
                );
              })}
              {/* ── PROJECTS ── */}
              {projectData.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-amber-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-amber-900 text-sm">Projects & Capital Expenditure</span>
                      <p className="text-xs text-amber-700 mt-0.5">Excluded from monthly budget. Set a total project budget to track spend.</p>
                    </div>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {projectData.map(proj => (
                      <div key={proj.cat} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm text-amber-900">{proj.cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-700">Total budget:</span>
                            <input type="number" min="0" step="1000"
                              className="border border-amber-300 rounded px-2 py-1 text-sm w-28 text-right bg-white"
                              value={projectBudgets[proj.cat] || ""}
                              placeholder="0"
                              onKeyDown={e => e.stopPropagation()}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setProjectBudgets(prev => {
                                  const n = { ...prev, [proj.cat]: val };
                                  try { window.storage.set("project-budgets", JSON.stringify(n)); } catch(_) {}
                                  return n;
                                });
                              }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 bg-white rounded-full h-3 overflow-hidden border border-amber-200">
                            {proj.pct !== null && (
                              <div className={`h-3 rounded-full transition-all ${proj.pct >= 100 ? "bg-red-400" : proj.pct >= 80 ? "bg-amber-400" : "bg-green-400"}`}
                                style={{ width: proj.pct + "%" }} />
                            )}
                          </div>
                          <div className="text-sm font-semibold text-amber-900 flex-shrink-0">
                            {fmt(proj.totalSpent)}
                            {proj.totalBudget > 0 && <span className="text-xs font-normal text-amber-600"> / {fmt(proj.totalBudget)}</span>}
                          </div>
                          {proj.pct !== null && (
                            <span className={`text-xs font-bold flex-shrink-0 ${proj.pct >= 100 ? "text-red-600" : "text-amber-700"}`}>
                              {Math.round(proj.pct)}%
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-amber-100 border-t border-amber-100 mt-2">
                          {proj.subs.map(sub => {
                            const subBudget = budgetOverrides[sub] !== undefined ? budgetOverrides[sub] : 0;
                            const subSpent = proj.subBreakdown.find(s => s.sub === sub) ? proj.subBreakdown.find(s => s.sub === sub).spent : 0;
                            const isModified = budgetOverrides[sub] !== undefined;
                            return (
                              <div key={sub} className="flex items-center justify-between gap-3 px-2 py-2">
                                <span className="text-sm text-amber-900 flex-1">{sub}</span>
                                {subSpent > 0 && (
                                  <span className="text-xs text-amber-600 font-mono">{fmt(subSpent)} spent</span>
                                )}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-xs text-amber-600">$</span>
                                  <input type="number" min="0" step="100"
                                    className={"border rounded px-2 py-1 text-sm w-24 text-right " + (isModified ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-white")}
                                    value={subBudget || ""}
                                    placeholder="0"
                                    onKeyDown={e => e.stopPropagation()}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setBudgetOverrides(prev => { const n = { ...prev, [sub]: val }; try { window.storage.set("budget-overrides", JSON.stringify(n)); } catch(_){} return n; });
                                    }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deletedSubsList.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-700 mb-2 text-sm">Deleted subcategories</h3>
                  <p className="text-xs text-gray-400 mb-3">These built-in subcategories have been deleted. You can restore them at any time.</p>
                  <div className="space-y-1">
                    {deletedSubsList.map(sub => (
                      <div key={sub} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-500">{sub}</span>
                        <button onClick={() => {
                          setBudgetOverrides(prev => { const n = { ...prev }; delete n[sub]; try { window.storage.set("budget-overrides", JSON.stringify(n)); } catch(_){} return n; });
                        }} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Restore</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        )}

        {/* ── RULES TAB ── */}
        {tab === "cashflow" && transactions.length > 0 && (

            <div className="space-y-6">

              {/* Sankey - Budget flow */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-1">Budget cashflow — where your money goes</h3>
                <p className="text-xs text-gray-400 mb-4">Income sources → Total income → Expense categories → Subcategories. All monthly budget figures.</p>
                <div className="overflow-x-auto">
                  <svg key={JSON.stringify(budgetOverrides)} width={skW} height={skH} style={{ fontFamily: "inherit" }}>
                    {/* Links */}
                    {laidLinks.map((lk, i) => (
                      <path key={i}
                        d={`M${lk.x1},${lk.sy} L${lk.x1},${lk.sy + lk.lh} C${lk.mx},${lk.sy + lk.lh} ${lk.mx},${lk.ty + lk.lh} ${lk.x2},${lk.ty + lk.lh} L${lk.x2},${lk.ty} C${lk.mx},${lk.ty} ${lk.mx},${lk.sy} ${lk.x1},${lk.sy} Z`}
                        fill={getLinkColor(lk)} fillOpacity={0.2} stroke={getLinkColor(lk)} strokeWidth={0.5} strokeOpacity={0.4} />
                    ))}
                    {/* Nodes */}
                    {laid.map((n, i) => (
                      <g key={i}>
                        <rect x={n.x} y={n.y} width={nodeW} height={Math.max(2, n.h)}
                          fill={getColor(n)} rx={2} />
                        {n.col === 0 && (
                          <text x={n.x - 6} y={n.y + n.h / 2} textAnchor="end" dominantBaseline="middle"
                            fontSize={10} fill="#374151">{n.label} {fmt(n.value)}</text>
                        )}
                        {n.col === 1 && (
                          <text x={n.x + nodeW + 6} y={n.y + n.h / 2} dominantBaseline="middle"
                            fontSize={11} fontWeight="600" fill="#374151">{n.label} {fmt(n.value)}</text>
                        )}
                        {n.col === 2 && (
                          <text x={n.x + nodeW + 6} y={n.y + n.h / 2} dominantBaseline="middle"
                            fontSize={10} fill="#374151">{n.label} {fmt(n.value)}</text>
                        )}
                        {n.col === 3 && (
                          <text x={n.x + nodeW + 6} y={n.y + n.h / 2} dominantBaseline="middle"
                            fontSize={10} fill="#374151">{n.label} {fmt(n.value)}</text>
                        )}
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Monthly trend */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-1">Monthly cashflow</h3>
                <p className="text-xs text-gray-400 mb-4">Income, expenses and net per month across all your data.</p>
                {trendData.length < 2 ? (
                  <p className="text-sm text-gray-400">Need at least 2 months of data for trend chart.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={50} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <Line type="monotone" dataKey="Income" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Net" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-3 flex gap-4 text-xs text-gray-500 border-t pt-3">
                  <span>Budget income: <strong className="text-green-600">{fmt(bgtIncome)}/mo</strong></span>
                  <span>Budget expenses: <strong className="text-red-500">{fmt(bgtExpenses)}/mo</strong></span>
                  <span>Budget net: <strong className={cfBgtIncome - bgtExpenses >= 0 ? "text-blue-600" : "text-red-500"}>{fmt(cfBgtIncome - bgtExpenses)}/mo</strong></span>
                </div>
              </div>

              {/* Category actuals vs budget */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-1">Spending by category — actuals vs budget</h3>
                <p className="text-xs text-gray-400 mb-4">Total across all loaded data. Budget scaled to match the same period.</p>
                <ResponsiveContainer width="100%" height={Math.max(300, cfCatData.length * 52)}>
                  <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 60, left: 140, bottom: 0 }}>
                    <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="cat" tick={{ fontSize: 11 }} width={135} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="actual" name="Actual" radius={[0,3,3,0]}>
                      {cfCatData.map((d, i) => <Cell key={i} fill={d.actual > d.budget && d.budget > 0 ? "#ef4444" : "#3b82f6"} />)}
                    </Bar>
                    <Bar dataKey="budget" name="Budget" fill="#d1d5db" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Savings opportunities */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-1">Where to save — top overspend by subcategory</h3>
                <p className="text-xs text-gray-400 mb-3">Subcategories ranked by how much you are over budget. Red means over, green means under.</p>
                <div className="space-y-2">
                  {cfSubData.map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-40 text-xs text-right text-gray-600 truncate flex-shrink-0">{d.sub}</div>
                      <div className="flex-1 relative h-6 bg-gray-100 rounded overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded"
                          style={{ width: `${Math.min(100, d.budget > 0 ? (d.actual / Math.max(d.actual, d.budget)) * 100 : 100)}%`,
                            backgroundColor: d.overspend > 0 ? "#ef4444" : "#22c55e", opacity: 0.8 }} />
                      </div>
                      <div className="w-28 text-xs flex-shrink-0">
                        <span className="text-gray-600">{fmt(d.actual)}</span>
                        {d.budget > 0 && <span className={`ml-1 font-medium ${d.overspend > 0 ? "text-red-500" : "text-green-600"}`}>
                          ({d.overspend > 0 ? "+" : ""}{fmt(d.overspend)})
                        </span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          
        )}

        {tab === "rules" && (
          <div className="space-y-4">

            {/* Rule debugger */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Test a transaction</h3>
              <p className="text-xs text-gray-400 mb-3">Type a transaction description to see which rules match it and in what order.</p>
              <input className="border rounded px-2 py-1.5 text-sm w-full"
                placeholder="e.g. Pavilion Mooloolaba"
                value={debugInput}
                onChange={e => setDebugInput(e.target.value)} />
              <div className="mt-2 text-xs text-gray-400">
                {customRulesRef.current.length === 0
                  ? <span className="text-red-400">⚠ No custom rules loaded — rules may not have loaded from storage yet</span>
                  : <span className="text-green-600">✓ {customRulesRef.current.length} custom rule{customRulesRef.current.length !== 1 ? "s" : ""} loaded</span>
                }
              </div>
              {debugInput.trim() && (

                  <div className="mt-3">
                    {debugMatches.length === 0 ? (
                      <div className="text-xs text-gray-400 py-2">No rules match — transaction would be left uncategorised.</div>
                    ) : (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 mb-2">{debugMatches.length} rule{debugMatches.length !== 1 ? "s" : ""} match — actual winner shown in green:</div>
                        <div className="space-y-1">
                          {debugMatches.map((m, i) => {
                            const isWinner = winner && m.category === winner.category && m.subcategory === winner.subcategory && i === matches.findIndex(x => x.category === winner.category && x.subcategory === winner.subcategory);
                            const handleEditFromDebug = () => {
                              if (m.isCustom) {
                                const rule = customRules.find(r => r.match === m.pat);
                                if (rule) setEditingRule({ original: rule.match, match: rule.match, category: rule.category, subcategory: rule.subcategory });
                              } else {
                                const idx = BUILTIN_RULES.findIndex(r => {
                                  const p = typeof r.match === "string" ? r.match : r.match.toString().replace(/^\//,"").replace(/\/i$/,"");
                                  return p === m.pat;
                                });
                                if (idx >= 0) setEditingBuiltin({ idx, pat: m.pat, category: BUILTIN_RULES[idx].category, subcategory: BUILTIN_RULES[idx].subcategory });
                              }
                              setTab("rules");
                            };
                            return (
                              <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${isWinner ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200 opacity-60"}`}>
                                <span className={`font-bold mt-0.5 flex-shrink-0 ${isWinner ? "text-green-600" : "text-gray-400"}`}>{isWinner ? "✓ Wins" : "Loses"}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-mono text-gray-600 truncate">{m.pat}</div>
                                  <div className="mt-0.5">
                                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[m.category] || "bg-gray-100 text-gray-500"}`}>{m.category === "_ignore" ? "Ignore" : m.category}</span>
                                    {m.subcategory && <span className="ml-1 text-gray-500">{m.subcategory}</span>}
                                  </div>
                                </div>
                                <button onClick={handleEditFromDebug}
                                  className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium hover:opacity-75 ${m.isCustom ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}
                                  title="Click to edit this rule">
                                  {m.isCustom ? "Custom ✏️" : "Built-in ✏️"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">Add a rule</h3>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 flex-1 min-w-32">
                  <input className="border rounded px-2 py-1.5 text-sm flex-1"
                    placeholder="Keyword or pattern..."
                    value={newRule.match} onChange={e => setNewRule(r => ({ ...r, match: e.target.value }))} />
                  <button onClick={() => setShowPatternHelp(true)}
                    className="text-xs text-gray-400 hover:text-blue-500 border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold"
                    title="Pattern help">?</button>
                </div>
                <select className="border rounded px-2 py-1.5 text-sm" value={newRule.category}
                  onChange={e => setNewRule(r => ({ ...r, category: e.target.value, subcategory: "" }))}>
                  <option value="">Category...</option>
                  {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="border rounded px-2 py-1.5 text-sm" value={newRule.subcategory}
                  onChange={e => setNewRule(r => ({ ...r, subcategory: e.target.value }))}>
                  <option value="">Subcategory...</option>
                  {(effectiveCategories[newRule.category] || []).map(s => <option key={s}>{s}</option>)}
                </select>
                <button onClick={addManualRule} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded font-medium">+ Add</button>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">Re-apply runs all rules on every transaction, including ones manually categorised.</p>
                <button onClick={reapplyAllRules} className="text-xs bg-gray-700 hover:bg-gray-900 text-white px-3 py-1.5 rounded font-medium flex-shrink-0">Re-apply all rules</button>
              </div>
            </div>
            {customRules.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-400 uppercase bg-gray-50">
                    <th className="px-4 py-2 text-left">Pattern</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-left">Subcategory</th>
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {customRules.map(r => {
                      const isEd = editingRule && editingRule.original === r.match;
                      if (isEd) {
                        return (
                          <tr key={r.match} className="bg-blue-50">
                            <td className="px-3 py-2">
                              <input autoFocus className="border border-blue-300 rounded px-2 py-1 text-xs font-mono w-full"
                                value={editingRule.match}
                                onChange={e => setEditingRule(er => ({ ...er, match: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === "Enter") saveEditedRule(editingRule);
                                  if (e.key === "Escape") setEditingRule(null);
                                }} />
                            </td>
                            <td className="px-3 py-2">
                              <select className="border border-blue-300 rounded px-1.5 py-1 text-xs w-full"
                                value={editingRule.category}
                                onChange={e => setEditingRule(er => ({ ...er, category: e.target.value, subcategory: "" }))}>
                                <option value="">Category...</option>
                                {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                                <option value="_ignore">Ignore (skip)</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select className="border border-blue-300 rounded px-1.5 py-1 text-xs w-full"
                                value={editingRule.subcategory}
                                onChange={e => setEditingRule(er => ({ ...er, subcategory: e.target.value }))}>
                                <option value="">Subcategory...</option>
                                {(effectiveCategories[editingRule.category] || []).map(s => <option key={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-400">{r.learned ? "Learned" : "Manual"}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => saveEditedRule(editingRule)} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded mr-1">Save</button>
                              <button onClick={() => setEditingRule(null)} className="text-xs text-gray-400">Cancel</button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={r.match} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-blue-700">{r.match}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[r.category] || "bg-gray-100 text-gray-500"}`}>
                              {r.category === "_ignore" ? "Ignore" : r.category}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">{r.subcategory}</td>
                          <td className="px-4 py-2 text-xs text-gray-400">{r.learned ? "Learned" : "Manual"}</td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => setEditingRule({ original: r.match, match: r.match, category: r.category, subcategory: r.subcategory })}
                              className="text-xs text-blue-400 hover:text-blue-600 mr-2">Edit</button>
                            <button onClick={() => deleteRule(r.match)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">🧠</div>
                <p className="text-sm">No custom rules yet.</p>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setShowBuiltinRules(s => !s)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <span>Built-in rules ({BUILTIN_RULES.length})</span>
                <span className="text-xs text-gray-400">{showBuiltinRules ? "Hide" : "Show"} — click Edit to customise</span>
              </button>
              {showBuiltinRules && (
                <div className="border-t overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase bg-gray-50">
                        <th className="px-4 py-2 text-left">Pattern</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-left">Subcategory</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {BUILTIN_RULES.map((r, idx) => {
                        const pat = r.match.toString().replace(/^\//, "").replace(/\/i$/, "");
                        const overrideRule = customRules.find(cr => cr.match === pat);
                        const isEditingThis = editingBuiltin && editingBuiltin.idx === idx;
                        if (isEditingThis) {
                          return (
                            <tr key={idx} className="bg-blue-50">
                              <td className="px-3 py-2">
                                <input autoFocus className="border border-blue-300 rounded px-2 py-1 text-xs font-mono w-full"
                                  value={editingBuiltin.pat}
                                  onChange={e => setEditingBuiltin(eb => ({ ...eb, pat: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Escape") setEditingBuiltin(null); }} />
                              </td>
                              <td className="px-3 py-2">
                                <select className="border border-blue-300 rounded px-1.5 py-1 text-xs w-full"
                                  value={editingBuiltin.category}
                                  onChange={e => setEditingBuiltin(eb => ({ ...eb, category: e.target.value, subcategory: "" }))}>
                                  <option value="">Category...</option>
                                  {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                                  <option value="_ignore">Ignore (skip)</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <select className="border border-blue-300 rounded px-1.5 py-1 text-xs w-full"
                                  value={editingBuiltin.subcategory}
                                  onChange={e => setEditingBuiltin(eb => ({ ...eb, subcategory: e.target.value }))}>
                                  <option value="">Subcategory...</option>
                                  {(effectiveCategories[editingBuiltin.category] || []).map(s => <option key={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded mr-1"
                                  onClick={() => {
                                    const next = [{ match: editingBuiltin.pat, category: editingBuiltin.category, subcategory: editingBuiltin.subcategory, learned: false },
                                      ...customRules.filter(cr => cr.match !== pat)];
                                    setCustomRules(next);
                                    saveRules(next);
                                    applyNewRules(next);
                                    setEditingBuiltin(null);
                                  }}>Save</button>
                                <button className="text-xs text-gray-400" onClick={() => setEditingBuiltin(null)}>Cancel</button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-gray-500 max-w-xs truncate" title={pat}>{pat}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[overrideRule ? overrideRule.category : r.category] || "bg-gray-100 text-gray-500"}`}>
                                {(overrideRule ? overrideRule.category : r.category) === "_ignore" ? "Ignore" : (overrideRule ? overrideRule.category : r.category)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">
                              {overrideRule ? <span className="text-blue-600">{overrideRule.subcategory}</span> : r.subcategory}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button className="text-xs text-blue-400 hover:text-blue-600"
                                onClick={() => setEditingBuiltin({ idx, pat: overrideRule ? overrideRule.match : pat, category: overrideRule ? overrideRule.category : r.category, subcategory: overrideRule ? overrideRule.subcategory : r.subcategory })}>
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REVIEW TAB ── */}
        {tab === "review" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-gray-800">AI Category Review</h2>
                {aiReviewStatus === "done" && (
                  <div className="flex gap-2">
                    <button onClick={() => setAiReview(r => r.map(x => ({ ...x, confirmed: true })))}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium">
                      Confirm all
                    </button>
                    <button onClick={applyAiReview}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">
                      Apply & close
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {aiReviewStatus === "running" ? `Analysing ${visibleTx.filter(t => !t.category).length} uncategorised transactions...` :
                 aiReviewStatus === "done" ? `Review AI suggestions below. Confirm, reject, or override each one, then click Apply.` :
                 "Click AI Review to start."}
              </p>
              {aiReviewStatus === "running" && aiReview.length === 0 && (
                <div className="flex items-center gap-3 text-sm text-gray-400 py-8 justify-center">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Thinking...
                </div>
              )}
              {aiReview.length > 0 && (
                <div className="space-y-2">
                  {aiReview.map((r, i) => (
                    <div key={r.tx._id} className={`rounded-xl border p-3 ${r.confirmed === true ? "bg-green-50 border-green-200" : r.confirmed === false ? "bg-red-50 border-red-100 opacity-50" : "bg-white border-gray-200"}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400">{r.tx.date}</span>
                            <span className="text-sm font-medium text-gray-800 truncate">{r.tx.description}</span>
                            <span className="text-xs font-mono text-gray-500">${Math.abs(parseFloat(r.tx.amount)||0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {r.confirmed !== false && (
                              <>
                                <select className="border rounded px-1.5 py-0.5 text-xs"
                                  value={r.overrideCat || r.category}
                                  onChange={e => setAiReview(prev => prev.map((x, j) => j === i ? { ...x, overrideCat: e.target.value, overrideSub: "" } : x))}>
                                  <option value="">-- category --</option>
                                  {Object.keys(effectiveCategories).map(c => <option key={c}>{c}</option>)}
                                </select>
                                <select className="border rounded px-1.5 py-0.5 text-xs"
                                  value={r.overrideSub || r.subcategory}
                                  onChange={e => setAiReview(prev => prev.map((x, j) => j === i ? { ...x, overrideSub: e.target.value } : x))}>
                                  <option value="">-- subcategory --</option>
                                  {(effectiveCategories[r.overrideCat || r.category] || []).map(s => <option key={s}>{s}</option>)}
                                </select>
                              </>
                            )}
                            <span className="text-xs text-gray-400 italic">{r.reason}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setAiReview(prev => prev.map((x, j) => j === i ? { ...x, confirmed: true } : x))}
                            className={`text-xs px-2 py-1 rounded font-medium ${r.confirmed === true ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"}`}>
                            ✓
                          </button>
                          <button onClick={() => setAiReview(prev => prev.map((x, j) => j === i ? { ...x, confirmed: false } : x))}
                            className={`text-xs px-2 py-1 rounded font-medium ${r.confirmed === false ? "bg-red-400 text-white" : "bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500"}`}>
                            ✗
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {aiReviewStatus === "running" && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      Loading more...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Export tab full-screen overlay */}
    {tab === "export" && exportData && (
      <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Export All Data</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {exportData.summary.totalTransactions} transactions · {exportData.summary.customRulesCount} custom rules · {exportData.summary.businessFlaggedCount} business-flagged
            </p>
          </div>
          <button onClick={() => { setTab("transactions"); setExportData(null); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg">
            ✕ Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <strong>Instructions:</strong> The artifact sandbox blocks file downloads. Copy the JSON below and save it as <code className="font-mono bg-blue-100 px-1 rounded">budget-tracker-export.json</code> in your migration folder. Then copy the CSV and save as <code className="font-mono bg-blue-100 px-1 rounded">budget-tracker-export.csv</code>.
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">budget-tracker-export.json</span>
              <button onClick={() => navigator.clipboard.writeText(exportData.json).then(() => setAiStatus("JSON copied!")).catch(() => setAiStatus("Select all text manually"))}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-medium">
                Copy JSON
              </button>
            </div>
            <textarea readOnly value={exportData.json}
              className="w-full h-64 px-4 py-3 font-mono text-xs text-gray-700 resize-none focus:outline-none"
              onClick={e => e.target.select()} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">budget-tracker-export.csv</span>
              <button onClick={() => navigator.clipboard.writeText(exportData.csv).then(() => setAiStatus("CSV copied!")).catch(() => setAiStatus("Select all text manually"))}
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-medium">
                Copy CSV
              </button>
            </div>
            <textarea readOnly value={exportData.csv}
              className="w-full h-64 px-4 py-3 font-mono text-xs text-gray-700 resize-none focus:outline-none"
              onClick={e => e.target.select()} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Export Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Total transactions:</span> <span className="font-semibold">{exportData.summary.totalTransactions}</span></div>
              <div><span className="text-gray-400">Custom rules:</span> <span className="font-semibold">{exportData.summary.customRulesCount}</span></div>
              <div><span className="text-gray-400">Business flagged:</span> <span className="font-semibold">{exportData.summary.businessFlaggedCount}</span></div>
              <div><span className="text-gray-400">Uncategorised:</span> <span className="font-semibold">{exportData.summary.uncategorisedCount}</span></div>
              <div><span className="text-gray-400">Manually set:</span> <span className="font-semibold">{exportData.summary.manuallyCategoirsedCount}</span></div>
              <div><span className="text-gray-400">Date range:</span> <span className="font-semibold">{exportData.summary.dateRange ? exportData.summary.dateRange.from + " → " + exportData.summary.dateRange.to : "—"}</span></div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-1 font-medium">By category:</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(exportData.summary.byCategory).sort((a,b) => b[1]-a[1]).map(([cat, count]) => (
                  <div key={cat} className="text-xs flex justify-between">
                    <span className="text-gray-600 truncate">{cat}</span>
                    <span className="text-gray-400 ml-2 flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-1 font-medium">By source file:</div>
              {Object.entries(exportData.summary.bySourceFile).map(([file, count]) => (
                <div key={file} className="text-xs flex justify-between">
                  <span className="text-gray-600 truncate">{file}</span>
                  <span className="text-gray-400 ml-2 flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Pattern help modal */}
    {showPatternHelp && (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
        onClick={() => setShowPatternHelp(false)}>
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative"
          onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowPatternHelp(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold">x</button>
          <h2 className="text-base font-bold text-gray-800 mb-1">How to write a pattern</h2>
          <p className="text-xs text-gray-500 mb-4">Patterns are matched against the transaction description (case-insensitive).</p>

          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold text-gray-700 mb-1">Simple keyword</div>
              <div className="text-gray-500 text-xs mb-1">Matches any description containing that word.</div>
              <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs space-y-1">
                <div><span className="text-blue-600">woolworths</span> <span className="text-gray-400">— matches "WOOLWORTHS CHERMSIDE", "Woolworths Online"</span></div>
                <div><span className="text-blue-600">netflix</span> <span className="text-gray-400">— matches "NETFLIX.COM", "Netflix Monthly"</span></div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-1">Multiple keywords (OR)</div>
              <div className="text-gray-500 text-xs mb-1">Use <code className="bg-gray-100 px-1 rounded">|</code> to match any of several words.</div>
              <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs space-y-1">
                <div><span className="text-blue-600">kfc|mcdonalds|hungry jacks</span> <span className="text-gray-400">— matches any of the three</span></div>
                <div><span className="text-blue-600">qantas|jetstar|virgin</span> <span className="text-gray-400">— matches any airline</span></div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-1">Wildcard (match anything)</div>
              <div className="text-gray-500 text-xs mb-1">Use <code className="bg-gray-100 px-1 rounded">.*</code> to match any characters in between.</div>
              <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs space-y-1">
                <div><span className="text-blue-600">uber.*eats</span> <span className="text-gray-400">— matches "UBER* EATS", "Uber Eats Sydney"</span></div>
                <div><span className="text-blue-600">anz.*fee</span> <span className="text-gray-400">— matches "ANZ MONTHLY FEE", "ANZ ACCOUNT FEE"</span></div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-1">Tips</div>
              <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                <li>Patterns are case-insensitive — <span className="font-mono">COLES</span> and <span className="font-mono">coles</span> both work</li>
                <li>Keep patterns specific enough to avoid false matches</li>
                <li>Test by checking the transaction list after saving</li>
                <li>Use the <strong>Learn</strong> button on a transaction to auto-create a rule from it</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    )}
      {/* Delete subcategory modal */}
      {deleteSubModal && (

          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setDeleteSubModal(null); }}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="font-semibold text-gray-800 text-base mb-1">Delete subcategory</h3>
              <p className="text-sm text-gray-500 mb-4">Delete <strong>{deleteModalSub}</strong> from <strong>{deleteModalCat}</strong>?</p>
              {deleteAffectedTx.length > 0 ? (
                <div className="mb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-sm text-amber-800">
                    ⚠ <strong>{deleteAffectedTx.length} transaction{deleteAffectedTx.length !== 1 ? "s" : ""}</strong> are tagged with this subcategory. Choose where to move them before deleting.
                  </div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Transfer transactions to:</label>
                  <select className="border rounded px-2 py-1.5 text-sm w-full"
                    value={deleteSubModal.transferTo}
                    onChange={e => setDeleteSubModal(m => ({ ...m, transferTo: e.target.value }))}>
                    <option value="">— leave uncategorised —</option>
                    <optgroup label={deleteModalCat}>
                      {deleteOtherSubs.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                    <optgroup label="Other categories">
                      {deleteAllSubs.filter(s => s.cat !== cat).map(s => <option key={s.cat+s.sub} value={s.sub}>{s.cat} → {s.sub}</option>)}
                    </optgroup>
                  </select>
                </div>
              ) : (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">✓ No transactions use this subcategory — safe to delete.</p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => setDeleteSubModal(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
                <button onClick={() => deleteSubcategory(deleteModalCat, deleteModalSub, deleteSubModal.transferTo)}
                  className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg font-medium">
                  {deleteAffectedTx.length > 0 && deleteSubModal.transferTo ? "Transfer & Delete" : deleteAffectedTx.length > 0 ? "Delete & Uncategorise" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        
      )}
    </>
  );
}
