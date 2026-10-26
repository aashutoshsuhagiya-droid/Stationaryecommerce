export const INDIA_CITIES = [
  ["Visakhapatnam", "Andhra Pradesh"], ["Vijayawada", "Andhra Pradesh"], ["Tirupati", "Andhra Pradesh"],
  ["Itanagar", "Arunachal Pradesh"], ["Guwahati", "Assam"], ["Patna", "Bihar"], ["Raipur", "Chhattisgarh"],
  ["Delhi", "Delhi"], ["Panaji", "Goa"], ["Ahmedabad", "Gujarat"], ["Surat", "Gujarat"], ["Vadodara", "Gujarat"], ["Rajkot", "Gujarat"],
  ["Gurugram", "Haryana"], ["Faridabad", "Haryana"], ["Shimla", "Himachal Pradesh"], ["Jammu", "Jammu and Kashmir"], ["Srinagar", "Jammu and Kashmir"],
  ["Ranchi", "Jharkhand"], ["Bengaluru", "Karnataka"], ["Mysuru", "Karnataka"], ["Mangaluru", "Karnataka"], ["Kochi", "Kerala"], ["Thiruvananthapuram", "Kerala"], ["Kozhikode", "Kerala"],
  ["Bhopal", "Madhya Pradesh"], ["Indore", "Madhya Pradesh"], ["Jabalpur", "Madhya Pradesh"], ["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Nagpur", "Maharashtra"], ["Nashik", "Maharashtra"], ["Thane", "Maharashtra"],
  ["Imphal", "Manipur"], ["Shillong", "Meghalaya"], ["Aizawl", "Mizoram"], ["Kohima", "Nagaland"], ["Bhubaneswar", "Odisha"], ["Cuttack", "Odisha"],
  ["Chandigarh", "Punjab"], ["Ludhiana", "Punjab"], ["Amritsar", "Punjab"], ["Jaipur", "Rajasthan"], ["Jodhpur", "Rajasthan"], ["Udaipur", "Rajasthan"], ["Kota", "Rajasthan"],
  ["Gangtok", "Sikkim"], ["Chennai", "Tamil Nadu"], ["Coimbatore", "Tamil Nadu"], ["Madurai", "Tamil Nadu"], ["Tiruchirappalli", "Tamil Nadu"], ["Hyderabad", "Telangana"], ["Warangal", "Telangana"],
  ["Agartala", "Tripura"], ["Lucknow", "Uttar Pradesh"], ["Noida", "Uttar Pradesh"], ["Kanpur", "Uttar Pradesh"], ["Varanasi", "Uttar Pradesh"], ["Agra", "Uttar Pradesh"],
  ["Dehradun", "Uttarakhand"], ["Kolkata", "West Bengal"], ["Siliguri", "West Bengal"], ["Port Blair", "Andaman and Nicobar Islands"], ["Puducherry", "Puducherry"],
] as const;

export const cityStateByCity = new Map<string, string>(INDIA_CITIES);
export const INDIA_STATES = [...new Set(INDIA_CITIES.map(([, state]) => state))].sort((left, right) => left.localeCompare(right, "en-IN"));
