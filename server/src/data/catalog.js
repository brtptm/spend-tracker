// Category taxonomy + merchant catalog. Drives categorisation, the sample-data
// generator and offer targeting. Colors are the validated categorical palette
// in fixed order — a category keeps its color everywhere.

export const CATEGORIES = [
  { id: 'food', name: 'Food & Dining', emoji: '🍕', color: '#5b8def', subs: { food_delivery: 'Food delivery', restaurants: 'Restaurants', groceries: 'Groceries', street_food: 'Street food', coffee: 'Coffee shops' } },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#c97b4a', subs: { electronics: 'Electronics', fashion: 'Fashion', home: 'Home & kitchen', beauty: 'Beauty & care', marketplace: 'Marketplace' } },
  { id: 'transport', name: 'Travel & Transport', emoji: '🚕', color: '#3fa58a', subs: { cabs: 'Cabs & autos', flights: 'Flights', hotels: 'Hotels', bus_train: 'Bus & train', fuel: 'Fuel', metro: 'Metro' } },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬', color: '#8a7fd6', subs: { streaming: 'Streaming', gaming: 'Gaming', fitness: 'Gym & fitness', events: 'Movies & events', music: 'Music', software: 'Apps & software' } },
  { id: 'bills', name: 'Bills & Utilities', emoji: '💡', color: '#a98b3c', subs: { electricity: 'Electricity', internet: 'Internet', mobile: 'Mobile recharge', insurance: 'Insurance', rent: 'Rent', gas: 'Gas' } },
  { id: 'personal', name: 'Health & Finance', emoji: '🩺', color: '#cc6a8c', subs: { healthcare: 'Healthcare', emi: 'Loans & EMI', investments: 'Investments', donations: 'Donations', education: 'Education' } },
  { id: 'p2p', name: 'Peer-to-Peer', emoji: '👥', color: '#2b98c7', subs: { friends: 'Friend payments', split: 'Split bills', family: 'Family transfers' } },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const categoryName = (id) => CATEGORY[id]?.name || 'Other';
export const subName = (cat, sub) => CATEGORY[cat]?.subs?.[sub] || sub;

// m(id, name, category, sub, [min, max], hours, keywords, extra)
const m = (id, name, category, sub, range, hours, keywords = [], extra = {}) => ({ id, name, category, sub, range, hours, keywords, ...extra });
const MEALS = [12, 13, 13, 20, 20, 21, 19, 14];
const DAY = [10, 11, 13, 15, 17, 18, 19, 20];
const NIGHT = [21, 22, 23, 22, 21];

export const MERCHANTS = [
  m('swiggy', 'Swiggy', 'food', 'food_delivery', [180, 650], MEALS, ['swiggy', 'bundl'], { deliveryApp: true }),
  m('zomato', 'Zomato', 'food', 'food_delivery', [200, 700], MEALS, ['zomato'], { deliveryApp: true }),
  m('eatsure', 'EatSure', 'food', 'food_delivery', [220, 600], MEALS, ['eatsure']),
  m('dineout', 'Dineout', 'food', 'restaurants', [700, 2600], [13, 20, 21, 21], ['dineout']),
  m('barbeque', 'Barbeque Nation', 'food', 'restaurants', [900, 3200], [13, 20, 21], ['barbeque nation', 'bbq']),
  m('haldirams', "Haldiram's", 'food', 'restaurants', [250, 900], [13, 17, 20], ['haldiram']),
  m('bigbasket', 'BigBasket', 'food', 'groceries', [500, 2800], [9, 10, 18, 19], ['bigbasket', 'bb now']),
  m('blinkit', 'Blinkit', 'food', 'groceries', [150, 1200], [8, 19, 21, 22], ['blinkit', 'grofers']),
  m('zepto', 'Zepto', 'food', 'groceries', [150, 1100], [8, 19, 21, 22], ['zepto']),
  m('dmart', 'DMart', 'food', 'groceries', [900, 4200], [11, 17, 18], ['dmart', 'avenue supermarts']),
  m('chaipoint', 'Chai Point', 'food', 'coffee', [60, 220], [9, 11, 16, 17], ['chai point', 'chaayos', 'chaayos']),
  m('starbucks', 'Starbucks', 'food', 'coffee', [280, 750], [9, 11, 16, 17], ['starbucks', 'tata starbucks']),
  m('ccd', 'Café Coffee Day', 'food', 'coffee', [150, 450], [11, 16, 17], ['cafe coffee day', 'ccd']),
  m('streetfood', 'Local food stall', 'food', 'street_food', [40, 220], [13, 17, 19, 20], ['chaat', 'pani puri', 'dhaba', 'tea stall', 'vada pav']),

  m('amazon', 'Amazon', 'shopping', 'marketplace', [300, 9000], DAY, ['amazon', 'amzn']),
  m('flipkart', 'Flipkart', 'shopping', 'marketplace', [300, 9000], DAY, ['flipkart']),
  m('croma', 'Croma', 'shopping', 'electronics', [1500, 45000], [12, 17, 18, 19], ['croma']),
  m('reliancedigital', 'Reliance Digital', 'shopping', 'electronics', [1200, 40000], [12, 17, 18], ['reliance digital']),
  m('myntra', 'Myntra', 'shopping', 'fashion', [600, 4500], [13, 21, 22, 23], ['myntra']),
  m('ajio', 'AJIO', 'shopping', 'fashion', [600, 4200], [13, 21, 22, 23], ['ajio']),
  m('hm', 'H&M', 'shopping', 'fashion', [800, 5000], [12, 17, 18], ['h&m', 'hennes']),
  m('nykaa', 'Nykaa', 'shopping', 'beauty', [300, 2800], [13, 21, 22], ['nykaa']),
  m('ikea', 'IKEA', 'shopping', 'home', [700, 12000], [12, 16, 17], ['ikea']),
  m('pepperfry', 'Pepperfry', 'shopping', 'home', [1500, 18000], [13, 21], ['pepperfry']),

  m('uber', 'Uber', 'transport', 'cabs', [90, 650], [8, 9, 10, 18, 19, 20, 23], ['uber']),
  m('ola', 'Ola', 'transport', 'cabs', [80, 600], [8, 9, 10, 18, 19, 20, 23], ['ola', 'ani technologies']),
  m('rapido', 'Rapido', 'transport', 'cabs', [40, 220], [8, 9, 18, 19], ['rapido']),
  m('metro', 'Namma Metro', 'transport', 'metro', [30, 70], [8, 9, 18, 19], ['metro', 'bmrcl', 'dmrc']),
  m('indigo', 'IndiGo', 'transport', 'flights', [3200, 14000], [10, 15, 21, 22], ['indigo', 'interglobe']),
  m('makemytrip', 'MakeMyTrip', 'transport', 'hotels', [2200, 16000], [21, 22, 23], ['makemytrip', 'mmt']),
  m('irctc', 'IRCTC', 'transport', 'bus_train', [300, 3200], [9, 10, 22], ['irctc']),
  m('redbus', 'redBus', 'transport', 'bus_train', [450, 2200], [20, 21, 22], ['redbus']),
  m('hpcl', 'HP Petrol Pump', 'transport', 'fuel', [500, 3000], [8, 9, 18, 19], ['hpcl', 'hindustan petroleum', 'petrol', 'iocl', 'bpcl', 'fuel']),

  m('netflix', 'Netflix', 'entertainment', 'streaming', [199, 649], [1], ['netflix'], { subscription: true }),
  m('hotstar', 'Disney+ Hotstar', 'entertainment', 'streaming', [299, 899], [1], ['hotstar', 'disney'], { subscription: true }),
  m('prime', 'Amazon Prime', 'entertainment', 'streaming', [299, 299], [1], ['prime video', 'amazon prime'], { subscription: true }),
  m('sonyliv', 'SonyLIV', 'entertainment', 'streaming', [299, 299], [1], ['sonyliv'], { subscription: true }),
  m('spotify', 'Spotify', 'entertainment', 'music', [119, 179], [1], ['spotify'], { subscription: true }),
  m('youtube', 'YouTube Premium', 'entertainment', 'music', [149, 149], [1], ['youtube premium', 'google youtube'], { subscription: true }),
  m('adobe', 'Adobe Creative Cloud', 'entertainment', 'software', [676, 1675], [1], ['adobe'], { subscription: true }),
  m('cultfit', 'cult.fit', 'entertainment', 'fitness', [1200, 3000], [1], ['cult.fit', 'cultfit', 'curefit'], { subscription: true }),
  m('goldsgym', "Gold's Gym", 'entertainment', 'fitness', [2000, 3500], [1], ['gold\'s gym', 'golds gym'], { subscription: true }),
  m('bookmyshow', 'BookMyShow', 'entertainment', 'events', [250, 1800], [19, 20, 21, 22], ['bookmyshow', 'bms']),
  m('pvr', 'PVR INOX', 'entertainment', 'events', [300, 1400], [18, 19, 21], ['pvr', 'inox']),
  m('steam', 'Steam', 'entertainment', 'gaming', [200, 2500], [22, 23, 0], ['steam', 'valve']),
  m('dream11', 'Dream11', 'entertainment', 'gaming', [49, 999], [19, 20, 21], ['dream11']),

  m('bescom', 'BESCOM Electricity', 'bills', 'electricity', [900, 3600], [10, 11], ['bescom', 'electricity', 'tata power', 'adani electricity', 'msedcl']),
  m('airtelfiber', 'Airtel Xstream Fiber', 'bills', 'internet', [799, 1499], [10], ['airtel xstream', 'broadband', 'act fibernet'], { subscription: true }),
  m('jio', 'Jio Recharge', 'bills', 'mobile', [239, 999], [9, 20], ['jio', 'reliance jio']),
  m('airtel', 'Airtel Recharge', 'bills', 'mobile', [265, 899], [9, 20], ['airtel prepaid', 'airtel recharge']),
  m('lic', 'LIC Premium', 'bills', 'insurance', [1800, 6500], [11], ['lic', 'life insurance']),
  m('policybazaar', 'PolicyBazaar', 'bills', 'insurance', [900, 3500], [11, 21], ['policybazaar', 'insurance']),
  m('indane', 'Indane Gas', 'bills', 'gas', [850, 1100], [10], ['indane', 'hp gas', 'bharat gas', 'lpg']),
  m('nobroker', 'NoBroker Rent', 'bills', 'rent', [12000, 45000], [10], ['nobroker', 'rent']),

  m('apollo', 'Apollo Pharmacy', 'personal', 'healthcare', [150, 2200], [10, 19, 20], ['apollo', 'pharmacy', 'medplus', 'pharmeasy', '1mg']),
  m('practo', 'Practo', 'personal', 'healthcare', [400, 1500], [11, 18], ['practo', 'clinic', 'hospital']),
  m('bajajemi', 'Bajaj Finserv EMI', 'personal', 'emi', [2500, 18000], [10], ['bajaj finserv', 'emi', 'loan']),
  m('groww', 'Groww SIP', 'personal', 'investments', [1000, 15000], [10], ['groww', 'sip', 'zerodha', 'mutual fund']),
  m('giveindia', 'GiveIndia', 'personal', 'donations', [200, 2000], [11, 21], ['giveindia', 'donation', 'ngo']),
  m('byjus', 'Unacademy', 'personal', 'education', [800, 4000], [21], ['unacademy', 'byju', 'coursera', 'udemy']),
];
export const MERCHANT = Object.fromEntries(MERCHANTS.map((x) => [x.id, x]));

export const DISHES = ['Chicken Biryani', 'Mutton Biryani', 'Paneer Butter Masala', 'Margherita Pizza', 'Masala Dosa', 'Burger combo', 'Veg Thali', 'Chicken Momos', 'Shawarma roll', 'Hakka Noodles', 'Chole Bhature', 'Pav Bhaji'];
export const PEOPLE = ['Rahul Sharma', 'Priya Nair', 'Arjun Mehta', 'Sneha Iyer', 'Vikram Rao', 'Ananya Gupta', 'Mom', 'Dad', 'Karan Malhotra', 'Divya Menon'];
