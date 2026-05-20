export type GloveStateUsage = {
  name: string;
  abbreviation: string;
  usageIndex: number;
  vsNationalAverage: number;
  rank: number;
  region: string;
  topFactors: string[];
  gloveTypes: string[];
  shortInsight: string;
};

/** Frontend-only educational estimates — not live or internal warehouse data. */
const RAW_STATES: Omit<GloveStateUsage, "vsNationalAverage" | "rank">[] = [
  {
    name: "Alabama",
    abbreviation: "AL",
    usageIndex: 117,
    region: "Southeast",
    topFactors: ["Manufacturing corridors", "Food processing", "Healthcare systems"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Industrial coated"],
    shortInsight: "Mixed industrial and healthcare demand lifts baseline glove turnover across the Gulf South.",
  },
  {
    name: "Alaska",
    abbreviation: "AK",
    usageIndex: 76,
    region: "West",
    topFactors: ["Seasonal workforce", "Remote logistics", "Limited year-round industry"],
    gloveTypes: ["Nitrile exam", "General purpose", "Cold-weather lined"],
    shortInsight: "Smaller permanent workforce and seasonal operations keep estimated relative usage below the national midpoint.",
  },
  {
    name: "Arizona",
    abbreviation: "AZ",
    usageIndex: 110,
    region: "Southwest",
    topFactors: ["Population growth", "Healthcare expansion", "Hospitality & food service"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Housekeeping"],
    shortInsight: "Fast-growing metros and service sectors sustain steady glove consumption across clinical and hospitality settings.",
  },
  {
    name: "Arkansas",
    abbreviation: "AR",
    usageIndex: 108,
    region: "Southeast",
    topFactors: ["Food processing", "Poultry & protein plants", "Distribution hubs"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Protein processing and logistics anchor glove demand in food-safe and general industrial categories.",
  },
  {
    name: "California",
    abbreviation: "CA",
    usageIndex: 151,
    region: "West",
    topFactors: ["Scale of healthcare", "Ports & logistics", "Food & beverage production"],
    gloveTypes: ["Nitrile exam", "Chemo-rated", "Vinyl food service"],
    shortInsight: "Sheer economic scale and regulated healthcare drive one of the highest estimated usage indexes nationally.",
  },
  {
    name: "Colorado",
    abbreviation: "CO",
    usageIndex: 104,
    region: "West",
    topFactors: ["Healthcare clusters", "Food & beverage", "Outdoor hospitality"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "General purpose"],
    shortInsight: "Urban healthcare and hospitality balance a moderate industrial base for steady glove programs.",
  },
  {
    name: "Connecticut",
    abbreviation: "CT",
    usageIndex: 128,
    region: "Northeast",
    topFactors: ["Dense healthcare", "Precision manufacturing", "Corporate campuses"],
    gloveTypes: ["Nitrile exam", "Chemo-rated", "ESD-safe"],
    shortInsight: "Compact but affluent Northeast corridor concentrates clinical and light manufacturing glove use.",
  },
  {
    name: "Delaware",
    abbreviation: "DE",
    usageIndex: 122,
    region: "Northeast",
    topFactors: ["Pharma-adjacent ops", "Food manufacturing", "Regional healthcare"],
    gloveTypes: ["Nitrile exam", "Cleanroom", "Vinyl food service"],
    shortInsight: "Chemical and food manufacturing alongside regional hospitals elevate per-capita glove intensity.",
  },
  {
    name: "District of Columbia",
    abbreviation: "DC",
    usageIndex: 118,
    region: "Mid-Atlantic",
    topFactors: ["Healthcare", "Public sector facilities", "Hospitality", "Food service"],
    gloveTypes: ["Nitrile", "Vinyl", "Exam-grade"],
    shortInsight:
      "Federal city healthcare, public facilities, and hospitality concentrate exam and food-service glove demand in a compact metro footprint.",
  },
  {
    name: "Florida",
    abbreviation: "FL",
    usageIndex: 135,
    region: "Southeast",
    topFactors: ["Tourism & hospitality", "Healthcare retiree markets", "Ports & logistics"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Housekeeping"],
    shortInsight: "Hospitality volume and large healthcare networks push Florida above the national usage midpoint.",
  },
  {
    name: "Georgia",
    abbreviation: "GA",
    usageIndex: 130,
    region: "Southeast",
    topFactors: ["Distribution & logistics", "Food processing", "Healthcare hubs"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Industrial coated"],
    shortInsight: "Atlanta logistics and Southeast food production sustain strong multi-category glove demand.",
  },
  {
    name: "Hawaii",
    abbreviation: "HI",
    usageIndex: 92,
    region: "West",
    topFactors: ["Tourism & food service", "Island logistics", "Healthcare import reliance"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "General purpose"],
    shortInsight: "Service-heavy island economy with import constraints yields moderate estimated usage relative to mainland industrial states.",
  },
  {
    name: "Idaho",
    abbreviation: "ID",
    usageIndex: 96,
    region: "West",
    topFactors: ["Food & ag processing", "Growing logistics", "Regional healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Agricultural processing and inbound logistics support baseline food-safe and exam glove programs.",
  },
  {
    name: "Illinois",
    abbreviation: "IL",
    usageIndex: 128,
    region: "Midwest",
    topFactors: ["Manufacturing density", "Healthcare systems", "Food & beverage"],
    gloveTypes: ["Nitrile exam", "Industrial coated", "Vinyl food service"],
    shortInsight: "Chicago metro manufacturing and healthcare networks keep Illinois near upper-mid national usage.",
  },
  {
    name: "Indiana",
    abbreviation: "IN",
    usageIndex: 115,
    region: "Midwest",
    topFactors: ["Automotive & parts", "Pharma manufacturing", "Healthcare"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Cleanroom"],
    shortInsight: "Automotive supply chains and pharma plants drive industrial and cleanroom glove categories.",
  },
  {
    name: "Iowa",
    abbreviation: "IA",
    usageIndex: 105,
    region: "Midwest",
    topFactors: ["Food & protein processing", "Ag equipment", "Regional healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Protein and grain processing anchor food-service glove demand across the upper Midwest.",
  },
  {
    name: "Kansas",
    abbreviation: "KS",
    usageIndex: 102,
    region: "Midwest",
    topFactors: ["Protein processing", "Aviation MRO", "Healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Food processing and aviation maintenance mix food-safe and industrial glove needs.",
  },
  {
    name: "Kentucky",
    abbreviation: "KY",
    usageIndex: 115,
    region: "Southeast",
    topFactors: ["Automotive assembly", "Food & beverage", "Healthcare"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Vinyl food service"],
    shortInsight: "Assembly plants and bourbon/food production sustain industrial and food-service glove turnover.",
  },
  {
    name: "Louisiana",
    abbreviation: "LA",
    usageIndex: 168,
    region: "Southeast",
    topFactors: ["Petrochemical & refining", "Ports & maritime", "Healthcare along Gulf"],
    gloveTypes: ["Chemical-resistant", "Industrial coated", "Nitrile exam"],
    shortInsight: "Energy, chemical, and port operations push Louisiana to the top of the estimated relative usage index.",
  },
  {
    name: "Maine",
    abbreviation: "ME",
    usageIndex: 88,
    region: "Northeast",
    topFactors: ["Seafood processing", "Seasonal tourism", "Regional healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "General purpose"],
    shortInsight: "Smaller population and seasonal hospitality keep estimated usage below the national average.",
  },
  {
    name: "Maryland",
    abbreviation: "MD",
    usageIndex: 125,
    region: "Northeast",
    topFactors: ["Federal & biotech adjacency", "Healthcare", "Ports"],
    gloveTypes: ["Nitrile exam", "Chemo-rated", "Cleanroom"],
    shortInsight: "Biotech-adjacent and clinical operations near the DC corridor elevate exam and cleanroom demand.",
  },
  {
    name: "Massachusetts",
    abbreviation: "MA",
    usageIndex: 134,
    region: "Northeast",
    topFactors: ["Biotech & research", "Dense healthcare", "Higher-ed labs"],
    gloveTypes: ["Nitrile exam", "Chemo-rated", "Cleanroom"],
    shortInsight: "Research, biotech, and academic medical centers concentrate high-spec glove categories.",
  },
  {
    name: "Michigan",
    abbreviation: "MI",
    usageIndex: 148,
    region: "Midwest",
    topFactors: ["Automotive manufacturing", "Healthcare systems", "Food processing"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Vinyl food service"],
    shortInsight: "Automotive supply chains and large healthcare networks drive upper-tier estimated usage.",
  },
  {
    name: "Minnesota",
    abbreviation: "MN",
    usageIndex: 113,
    region: "Midwest",
    topFactors: ["Food & med-tech", "Healthcare systems", "Cold-chain logistics"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Cleanroom"],
    shortInsight: "Med-tech and food giants alongside major hospital systems sustain diversified glove programs.",
  },
  {
    name: "Mississippi",
    abbreviation: "MS",
    usageIndex: 120,
    region: "Southeast",
    topFactors: ["Food & protein plants", "Ports", "Healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Gulf processing and port activity lift food-safe and industrial glove demand above the midpoint.",
  },
  {
    name: "Missouri",
    abbreviation: "MO",
    usageIndex: 114,
    region: "Midwest",
    topFactors: ["Distribution hubs", "Food processing", "Healthcare"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Industrial coated"],
    shortInsight: "Central logistics corridors and regional healthcare keep Missouri in the upper-mid usage band.",
  },
  {
    name: "Montana",
    abbreviation: "MT",
    usageIndex: 82,
    region: "West",
    topFactors: ["Sparse population", "Ag & mining", "Seasonal tourism"],
    gloveTypes: ["General purpose", "Nitrile exam", "Industrial coated"],
    shortInsight: "Low population density and limited metro healthcare scale reduce estimated relative usage.",
  },
  {
    name: "Nebraska",
    abbreviation: "NE",
    usageIndex: 98,
    region: "Midwest",
    topFactors: ["Protein processing", "Ag logistics", "Regional healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "General purpose"],
    shortInsight: "Protein and grain logistics anchor food-service glove use with moderate clinical demand.",
  },
  {
    name: "Nevada",
    abbreviation: "NV",
    usageIndex: 108,
    region: "West",
    topFactors: ["Hospitality & gaming", "Population growth", "Healthcare expansion"],
    gloveTypes: ["Vinyl food service", "Housekeeping", "Nitrile exam"],
    shortInsight: "Las Vegas hospitality volume drives housekeeping and food-service glove categories.",
  },
  {
    name: "New Hampshire",
    abbreviation: "NH",
    usageIndex: 115,
    region: "Northeast",
    topFactors: ["Precision manufacturing", "Healthcare", "Tourism"],
    gloveTypes: ["Nitrile exam", "ESD-safe", "Vinyl food service"],
    shortInsight: "Light manufacturing and regional hospitals sustain moderate Northeast glove intensity.",
  },
  {
    name: "New Jersey",
    abbreviation: "NJ",
    usageIndex: 121,
    region: "Northeast",
    topFactors: ["Pharma & chemical", "Ports & logistics", "Dense healthcare"],
    gloveTypes: ["Chemo-rated", "Nitrile exam", "Chemical-resistant"],
    shortInsight: "Pharma corridors and port logistics elevate chemical-resistant and clinical glove demand.",
  },
  {
    name: "New Mexico",
    abbreviation: "NM",
    usageIndex: 103,
    region: "Southwest",
    topFactors: ["Federal labs", "Healthcare", "Food service"],
    gloveTypes: ["Nitrile exam", "Cleanroom", "Vinyl food service"],
    shortInsight: "Federal research and regional healthcare mix cleanroom and exam glove needs.",
  },
  {
    name: "New York",
    abbreviation: "NY",
    usageIndex: 132,
    region: "Northeast",
    topFactors: ["Healthcare scale", "Food & hospitality", "Finance & corporate campuses"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Chemo-rated"],
    shortInsight: "NYC metro healthcare and hospitality volume place New York well above the national midpoint.",
  },
  {
    name: "North Carolina",
    abbreviation: "NC",
    usageIndex: 126,
    region: "Southeast",
    topFactors: ["Pharma & biotech", "Food processing", "Healthcare growth"],
    gloveTypes: ["Nitrile exam", "Cleanroom", "Vinyl food service"],
    shortInsight: "Research Triangle biotech and Southeast food production sustain strong multi-sector demand.",
  },
  {
    name: "North Dakota",
    abbreviation: "ND",
    usageIndex: 89,
    region: "Midwest",
    topFactors: ["Energy & ag", "Sparse population", "Regional healthcare"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "General purpose"],
    shortInsight: "Energy cycles and low population density keep estimated usage below the national average.",
  },
  {
    name: "Ohio",
    abbreviation: "OH",
    usageIndex: 118,
    region: "Midwest",
    topFactors: ["Manufacturing breadth", "Healthcare systems", "Food processing"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Vinyl food service"],
    shortInsight: "Broad manufacturing and hospital networks sustain upper-mid industrial and clinical glove use.",
  },
  {
    name: "Oklahoma",
    abbreviation: "OK",
    usageIndex: 112,
    region: "Southwest",
    topFactors: ["Energy services", "Food processing", "Healthcare"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Chemical-resistant"],
    shortInsight: "Energy field services and protein processing mix industrial and food-safe glove categories.",
  },
  {
    name: "Oregon",
    abbreviation: "OR",
    usageIndex: 118,
    region: "West",
    topFactors: ["Food & beverage", "Tech campuses", "Healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "ESD-safe"],
    shortInsight: "Food production and tech-adjacent campuses diversify exam and food-service glove demand.",
  },
  {
    name: "Pennsylvania",
    abbreviation: "PA",
    usageIndex: 139,
    region: "Northeast",
    topFactors: ["Healthcare systems", "Manufacturing", "Food & pharma"],
    gloveTypes: ["Nitrile exam", "Industrial coated", "Chemo-rated"],
    shortInsight: "Large hospital networks and legacy manufacturing keep Pennsylvania in the upper usage tier.",
  },
  {
    name: "Rhode Island",
    abbreviation: "RI",
    usageIndex: 118,
    region: "Northeast",
    topFactors: ["Healthcare density", "Hospitality", "Marine trades"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "General purpose"],
    shortInsight: "Compact metro healthcare and hospitality sustain moderate Northeast glove intensity.",
  },
  {
    name: "South Carolina",
    abbreviation: "SC",
    usageIndex: 124,
    region: "Southeast",
    topFactors: ["Automotive & aerospace", "Ports", "Healthcare growth"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "Vinyl food service"],
    shortInsight: "Inbound manufacturing and port logistics lift industrial and food-safe glove turnover.",
  },
  {
    name: "South Dakota",
    abbreviation: "SD",
    usageIndex: 88,
    region: "Midwest",
    topFactors: ["Ag processing", "Sparse population", "Regional healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "General purpose"],
    shortInsight: "Agricultural processing with limited metro scale keeps estimated usage below the national midpoint.",
  },
  {
    name: "Tennessee",
    abbreviation: "TN",
    usageIndex: 122,
    region: "Southeast",
    topFactors: ["Healthcare systems", "Food & beverage", "Distribution hubs"],
    gloveTypes: ["Nitrile exam", "Vinyl food service", "Industrial coated"],
    shortInsight: "Nashville healthcare growth and Southeast distribution sustain steady multi-category demand.",
  },
  {
    name: "Texas",
    abbreviation: "TX",
    usageIndex: 156,
    region: "Southwest",
    topFactors: ["Energy & petrochemical", "Population scale", "Healthcare expansion"],
    gloveTypes: ["Chemical-resistant", "Nitrile exam", "Industrial coated"],
    shortInsight: "Energy, refining, and rapid metro growth place Texas among the highest estimated usage indexes.",
  },
  {
    name: "Utah",
    abbreviation: "UT",
    usageIndex: 124,
    region: "West",
    topFactors: ["Tech & data centers", "Healthcare growth", "Food manufacturing"],
    gloveTypes: ["Nitrile exam", "ESD-safe", "Vinyl food service"],
    shortInsight: "Fast-growing metros and tech campuses elevate exam and light industrial glove programs.",
  },
  {
    name: "Vermont",
    abbreviation: "VT",
    usageIndex: 80,
    region: "Northeast",
    topFactors: ["Small population", "Food & dairy", "Seasonal tourism"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "General purpose"],
    shortInsight: "Rural scale and seasonal hospitality keep Vermont among the lower estimated usage states.",
  },
  {
    name: "Virginia",
    abbreviation: "VA",
    usageIndex: 127,
    region: "Southeast",
    topFactors: ["Federal & defense contractors", "Ports", "Healthcare"],
    gloveTypes: ["Nitrile exam", "Industrial coated", "Cleanroom"],
    shortInsight: "Defense-adjacent manufacturing and port activity sustain industrial and clinical glove demand.",
  },
  {
    name: "Washington",
    abbreviation: "WA",
    usageIndex: 129,
    region: "West",
    topFactors: ["Aerospace & tech", "Ports", "Healthcare"],
    gloveTypes: ["ESD-safe", "Nitrile exam", "Industrial coated"],
    shortInsight: "Aerospace supply chains and Seattle metro healthcare drive upper-mid estimated usage.",
  },
  {
    name: "West Virginia",
    abbreviation: "WV",
    usageIndex: 95,
    region: "Southeast",
    topFactors: ["Energy & mining", "Healthcare", "Food service"],
    gloveTypes: ["Industrial coated", "Nitrile exam", "General purpose"],
    shortInsight: "Energy extraction with smaller healthcare networks yields below-average estimated usage.",
  },
  {
    name: "Wisconsin",
    abbreviation: "WI",
    usageIndex: 112,
    region: "Midwest",
    topFactors: ["Food & dairy processing", "Manufacturing", "Healthcare"],
    gloveTypes: ["Vinyl food service", "Nitrile exam", "Industrial coated"],
    shortInsight: "Dairy and food manufacturing anchor food-service glove demand across the upper Midwest.",
  },
  {
    name: "Wyoming",
    abbreviation: "WY",
    usageIndex: 87,
    region: "West",
    topFactors: ["Energy & mining", "Sparse population", "Seasonal workforce"],
    gloveTypes: ["Industrial coated", "General purpose", "Nitrile exam"],
    shortInsight: "Energy field work with very low population density keeps Wyoming near the lower usage band.",
  },
];

const avg =
  RAW_STATES.reduce((sum, s) => sum + s.usageIndex, 0) / RAW_STATES.length;

export const NATIONAL_USAGE_INDEX = Math.round(avg);

const ranked = [...RAW_STATES]
  .sort((a, b) => b.usageIndex - a.usageIndex)
  .map((s, i) => ({
    ...s,
    rank: i + 1,
    vsNationalAverage: Math.round(((s.usageIndex - NATIONAL_USAGE_INDEX) / NATIONAL_USAGE_INDEX) * 100),
  }));

export const GLOVE_USAGE_BY_STATE: GloveStateUsage[] = ranked;

export const GLOVE_USAGE_BY_ABBR = Object.fromEntries(
  GLOVE_USAGE_BY_STATE.map((s) => [s.abbreviation, s])
) as Record<string, GloveStateUsage>;

export const STATE_NAME_TO_ABBR = Object.fromEntries(
  GLOVE_USAGE_BY_STATE.map((s) => [s.name, s.abbreviation])
) as Record<string, string>;

export const USAGE_INDEX_MIN = Math.min(...GLOVE_USAGE_BY_STATE.map((s) => s.usageIndex));
export const USAGE_INDEX_MAX = Math.max(...GLOVE_USAGE_BY_STATE.map((s) => s.usageIndex));

export const GLOVE_USAGE_LEADERBOARD = GLOVE_USAGE_BY_STATE.slice(0, 5);

export function getStateByAbbr(abbr: string | undefined): GloveStateUsage | undefined {
  if (!abbr) return undefined;
  return GLOVE_USAGE_BY_ABBR[abbr.toUpperCase()];
}

export function getStateByName(name: string | undefined): GloveStateUsage | undefined {
  if (!name) return undefined;
  const abbr = STATE_NAME_TO_ABBR[name];
  return getStateByAbbr(abbr);
}

/** Cream (#F3E4CC) → orange (#FF6A00) heat fill for choropleth. */
export function usageIndexToFill(index: number): string {
  const t = Math.max(
    0,
    Math.min(1, (index - USAGE_INDEX_MIN) / (USAGE_INDEX_MAX - USAGE_INDEX_MIN))
  );
  const r = Math.round(243 + (255 - 243) * t);
  const g = Math.round(228 + (106 - 228) * t);
  const b = Math.round(204 + (0 - 204) * t);
  return `rgb(${r} ${g} ${b})`;
}

export const GLOVE_USAGE_INDEX_LABEL = "Estimated Relative Glove Usage Index";

export const GLOVE_USAGE_DISCLAIMER =
  "Educational estimate based on industry mix and operating conditions. Not live procurement telemetry. Not automated SKU recommendations.";

export const GLOVE_USAGE_METHODOLOGY = [
  "Indexes are relative educational estimates for planning context only.",
  "Values reflect plausible industry mix, regulatory environment, and operating conditions — not live procurement telemetry.",
  "Not automated SKU recommendations; no BLS, warehouse, or internal GloveCubs transaction data unless explicitly wired later.",
];
