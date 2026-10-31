export const INDIA_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndiaState = typeof INDIA_STATES[number];

// The input stays editable so vendors in any Indian city can register. These
// common-city suggestions only make frequent choices faster to find.
const CITY_SUGGESTIONS_BY_STATE = {
  "Andaman and Nicobar Islands": ["Port Blair"],
  "Andhra Pradesh": ["Amaravati", "Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kurnool"],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang"],
  Assam: ["Dispur", "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Tezpur"],
  Bihar: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba", "Jagdalpur"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa", "Daman", "Diu"],
  Delhi: ["Delhi", "New Delhi", "Dwarka", "Rohini", "Saket"],
  Goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar"],
  Haryana: ["Gurugram", "Faridabad", "Hisar", "Panipat", "Ambala", "Karnal"],
  "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi", "Kullu"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua"],
  Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar"],
  Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Kalaburagi"],
  Kerala: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur"],
  Ladakh: ["Leh", "Kargil"],
  Lakshadweep: ["Kavaratti"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Kolhapur"],
  Manipur: ["Imphal", "Thoubal", "Bishnupur"],
  Meghalaya: ["Shillong", "Tura", "Jowai"],
  Mizoram: ["Aizawl", "Lunglei", "Champhai"],
  Nagaland: ["Kohima", "Dimapur", "Mokokchung"],
  Odisha: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
  Puducherry: ["Puducherry", "Karaikal", "Mahe", "Yanam"],
  Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
  Sikkim: ["Gangtok", "Namchi", "Gyalshing"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
  Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
  Tripura: ["Agartala", "Udaipur", "Dharmanagar"],
  "Uttar Pradesh": ["Lucknow", "Noida", "Kanpur", "Varanasi", "Agra", "Prayagraj", "Meerut"],
  Uttarakhand: ["Dehradun", "Haridwar", "Haldwani", "Roorkee", "Nainital"],
  "West Bengal": ["Kolkata", "Siliguri", "Howrah", "Durgapur", "Asansol", "Darjeeling"],
} as const satisfies Record<IndiaState, readonly string[]>;

export type IndiaCity = readonly [city: string, state: IndiaState];

export const INDIA_CITIES: readonly IndiaCity[] = INDIA_STATES.flatMap((state) =>
  CITY_SUGGESTIONS_BY_STATE[state].map((city): IndiaCity => [city, state]),
);

const stateNames = new Set<string>(INDIA_STATES);
const normalizeCity = (value: string) => value.trim().normalize("NFKD").toLocaleLowerCase("en-IN");
const statesByKnownCity = INDIA_CITIES.reduce((result, [city, state]) => {
  const key = normalizeCity(city);
  const states = result.get(key) ?? new Set<IndiaState>();
  states.add(state);
  result.set(key, states);
  return result;
}, new Map<string, Set<IndiaState>>());

export function isIndiaState(value: string): value is IndiaState {
  return stateNames.has(value);
}

export function citiesForState(state: string): readonly string[] {
  return isIndiaState(state) ? CITY_SUGGESTIONS_BY_STATE[state] : [];
}

// Unknown cities are intentionally accepted: India has far more cities than a
// registration form should hard-code. Known suggestions must still match their
// canonical state, which catches accidental mismatches such as Pune + Gujarat.
export function isCityCompatibleWithState(city: string, state: string) {
  const knownStates = statesByKnownCity.get(normalizeCity(city));
  return !knownStates || knownStates.has(state as IndiaState);
}