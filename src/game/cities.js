// Cities and towns only, drawn from MapTap's own pool at
// https://maptap.gg/data/master_locations.js but re-tiered and trimmed, because
// the file as published does not describe the game people actually play.
//
// Three things were wrong with using it raw:
//
//   Its 500-odd monuments, battlefields, waterfalls and national parks are not
//   what the real game asks for, so only city/capital/state_capital survive.
//
//   Its own difficulty grading does not track how known a place is -- it files
//   Paris, Rome and Sydney as hard and Akola, Andernach and Ilorin as easy.
//   Banding by English Wikipedia readership was tried and felt random too:
//   readership measures what people look up, not what they could click, so
//   Batman, Sparta and Kinshasa landed in round 1 while Havana and Cusco sat
//   in round 3. The tiers below are rated by hand instead, for a western
//   player, on "how many layers of knowledge does landing near it take":
//
//     1  global icons that anyone with a TV can place
//     2  well-known capitals and famous second cities
//     3  capitals of countries most can find, lesser cities of famous ones
//     4  needs real geography, but a fair ask -- Dakar, Cusco, Tashkent
//     5  brutal, and meant to be: rounds 1-4 ramp gently, round 5 is a cliff
//
//   Namesakes are rated as the place the prompt names, and population counts
//   for nothing: a 30-million Chongqing is a 3 and a 130-thousand Reykjavik
//   a 1. Nor does the name itself: difficulty is where the click lands. A
//   place within 350 km of a round 1 or 2 city of its country is at most a
//   3, since clicking the famous city still scores 93 -- Kirkjubaejarklaustur
//   is a 3 because Reykjavik is 190 km away, London, Ontario because Toronto
//   is. Within reach of a round 3 city it is at most a 4. Round 5 is for
//   places that are hard to land near even knowing the country's landmarks,
//   and anything closer than the 25 km one click covers is not in the pool.
//   Islands follow the same logic: on one most players can find and click
//   the middle of -- Cyprus, Jamaica, Hispaniola, Trinidad -- every town is a 3, and
//   where a landmark gets you close -- the Lesser Antilles arc, the
//   Aleutians -- a 4. Round 5 islands are the ones nobody can point at.
//
//   It carries no country. The live game derives one from polygons at runtime,
//   which is why 40-odd entries here were labeled by continent and read as
//   "Bogota, South America". Countries are resolved from MapTap's own
//   countries.geojson, with microstates named directly since those outlines are
//   too coarse to separate Monaco from France.
//
// Every country contributes its two most recognizable places at minimum, and
// well-known ones up to fourteen, so no round fills with towns from whichever
// country the source happened to over-collect. The tiers are unequal in size
// because the ratings are absolute, not quantiles: there are only so many
// places everyone knows, and round 1 repeats sooner than round 5 as a result.
//
// The United States is the one country built out past that cap, to some
// 140 places -- at most four per state, plus anything larger than Portland
// -- because the source had fifteen and no Houston, Denver or Las Vegas
// among them. No US city sits above round 3: the prompt names the state, so
// the ask is never harder than "place Wyoming". Cities larger than Portland
// are round 2, the rest round 3. A pool that deep would make round 3 half
// American if places were drawn uniformly, which is why the sampler draws a
// country first; see weightOf() below.
//
// `region` is the source's own label where it had one, since "Aberdeen,
// Scotland" says more than "Aberdeen, the UK"; otherwise it is the resolved
// country. `note` covers the few whose region is not a sovereign state.

import {continentOf} from './continents'

const TIERS = [
  // round 1 -- 53 places: global icons -- anyone with a TV can place them
  [
    {name: 'New York City', region: 'New York, United States', lat: 40.7128, lon: -74.006},
    {name: 'Singapore', region: 'Singapore', lat: 1.3521, lon: 103.8198},
    {name: 'London', region: 'England', lat: 51.5074, lon: -0.1278},
    {name: 'Hong Kong', region: 'Hong Kong, China', note: 'Special Administrative Region of China', lat: 22.3193, lon: 114.1694},
    {name: 'Los Angeles', region: 'California, United States', lat: 34.0522, lon: -118.2437},
    {name: 'Washington DC', region: 'District of Columbia, United States', lat: 38.9072, lon: -77.0369},
    {name: 'Mexico City', region: 'Mexico City, Mexico', lat: 19.4326, lon: -99.1332},
    {name: 'Paris', region: 'France', lat: 48.8566, lon: 2.3522},
    {name: 'Chicago', region: 'Illinois, United States', lat: 41.8781, lon: -87.6298},
    {name: 'Berlin', region: 'Germany', lat: 52.52, lon: 13.405},
    {name: 'Buenos Aires', region: 'Argentina', lat: -34.6037, lon: -58.3816},
    {name: 'Toronto', region: 'Ontario, Canada', lat: 43.6511, lon: -79.347},
    {name: 'Seattle', region: 'Washington, United States', lat: 47.6062, lon: -122.3321},
    {name: 'Boston', region: 'Massachusetts, United States', lat: 42.3601, lon: -71.0589},
    {name: 'Tokyo', region: 'Japan', lat: 35.6762, lon: 139.6503},
    {name: 'Barcelona', region: 'Spain', lat: 41.3851, lon: 2.1734},
    {name: 'Dubai', region: 'United Arab Emirates', lat: 25.2048, lon: 55.2708},
    {name: 'San Francisco', region: 'California, United States', lat: 37.7749, lon: -122.4194},
    {name: 'Rome', region: 'Italy', lat: 41.9028, lon: 12.4964},
    {name: 'Vancouver', region: 'British Columbia, Canada', lat: 49.2827, lon: -123.1207},
    {name: 'Sydney', region: 'New South Wales, Australia', lat: -33.8688, lon: 151.2093},
    {name: 'Istanbul', region: 'Turkey', lat: 41.0082, lon: 28.9784},
    {name: 'Mumbai', region: 'Maharashtra, India', lat: 19.076, lon: 72.8777},
    {name: 'Jerusalem', region: 'Israel', lat: 31.772, lon: 35.217},
    {name: 'Montreal', region: 'Québec, Canada', lat: 45.5017, lon: -73.5673},
    {name: 'Amsterdam', region: 'Netherlands', lat: 52.37, lon: 4.9},
    {name: 'Madrid', region: 'Spain', lat: 40.4168, lon: -3.7038},
    {name: 'Melbourne', region: 'Victoria, Australia', lat: -37.8136, lon: 144.9631},
    {name: 'Miami', region: 'Florida, United States', lat: 25.7617, lon: -80.1918},
    {name: 'Shanghai', region: 'Shanghai, China', lat: 31.2304, lon: 121.4737},
    {name: 'Moscow', region: 'Russia', lat: 55.7558, lon: 37.6173},
    {name: 'Venice', region: 'Italy', lat: 45.4408, lon: 12.3155},
    {name: 'Beijing', region: 'Beijing, China', lat: 39.9042, lon: 116.4074},
    {name: 'Dublin', region: 'Ireland', lat: 53.3498, lon: -6.2603},
    {name: 'Athens', region: 'Greece', lat: 37.9795, lon: 23.7162},
    {name: 'Rio de Janeiro', region: 'Rio de Janeiro, Brazil', lat: -22.9083, lon: -43.1964},
    {name: 'Bangkok', region: 'Thailand', lat: 13.7563, lon: 100.5018},
    {name: 'Delhi', region: 'Delhi, India', lat: 28.6139, lon: 77.209},
    {name: 'São Paulo', region: 'São Paulo, Brazil', lat: -23.5338, lon: -46.6253},
    {name: 'Seoul', region: 'South Korea', lat: 37.5665, lon: 126.978},
    {name: 'Lisbon', region: 'Portugal', lat: 38.7169, lon: -9.1399},
    {name: 'Reykjavik', region: 'Iceland', lat: 64.1355, lon: -21.8954},
    {name: 'Cairo', region: 'Egypt', lat: 30.0444, lon: 31.2357},
    {name: 'Havana', region: 'Cuba', lat: 23.1136, lon: -82.3666},
    {name: 'Prague', region: 'Czechia', lat: 50.0755, lon: 14.4378},
    {name: 'Vienna', region: 'Austria', lat: 48.2082, lon: 16.3738},
    {name: 'Copenhagen', region: 'Denmark', lat: 55.6761, lon: 12.5683},
    {name: 'Munich', region: 'Germany', lat: 48.1374, lon: 11.5755},
    {name: 'Milan', region: 'Italy', lat: 45.4642, lon: 9.19},
    {name: 'Stockholm', region: 'Sweden', lat: 59.3326, lon: 18.0649},
    {name: 'Las Vegas', region: 'Nevada, United States', lat: 36.1699, lon: -115.1398},
    {name: 'Honolulu', region: 'Hawaii, United States', lat: 21.3069, lon: -157.8583},
    {name: 'New Orleans', region: 'Louisiana, United States', lat: 29.9511, lon: -90.0715},
  ],
  // round 2 -- 84 places: well-known capitals and famous second cities
  [
    {name: 'Philadelphia', region: 'Pennsylvania, United States', lat: 39.9526, lon: -75.1652},
    {name: 'Atlanta', region: 'Georgia, United States', lat: 33.749, lon: -84.388},
    {name: 'Birmingham', region: 'England', lat: 52.4862, lon: -1.8904},
    {name: 'Casablanca', region: 'Morocco', lat: 33.5731, lon: -7.5898},
    {name: 'Edinburgh', region: 'Scotland', lat: 55.9533, lon: -3.1883},
    {name: 'Jakarta', region: 'Indonesia', lat: -6.2088, lon: 106.8456},
    {name: 'Glasgow', region: 'Scotland', lat: 55.8642, lon: -4.2518},
    {name: 'Manchester', region: 'England', lat: 53.4808, lon: -2.2426},
    {name: 'Saint Petersburg', region: 'Russia', lat: 59.9343, lon: 30.3351},
    {name: 'Liverpool', region: 'England', lat: 53.4084, lon: -2.9916},
    {name: 'Budapest', region: 'Hungary', lat: 47.4979, lon: 19.0402},
    {name: 'Bengaluru', region: 'Karnataka, India', lat: 12.9716, lon: 77.5946},
    {name: 'Mecca', region: 'Saudi Arabia', lat: 21.3891, lon: 39.8579},
    {name: 'Warsaw', region: 'Poland', lat: 52.2297, lon: 21.0122},
    {name: 'Hamburg', region: 'Germany', lat: 53.5511, lon: 9.9937},
    {name: 'Kuala Lumpur', region: 'Malaysia', lat: 3.139, lon: 101.6869},
    {name: 'Oslo', region: 'Norway', lat: 59.9115, lon: 10.7579},
    {name: 'Cape Town', region: 'South Africa', lat: -33.9249, lon: 18.4241},
    {name: 'Naples', region: 'Italy', lat: 40.8518, lon: 14.2681},
    {name: 'Ottawa', region: 'Ontario, Canada', lat: 45.4112, lon: -75.6981},
    {name: 'Ho Chi Minh City', region: 'Vietnam', lat: 10.8231, lon: 106.6297},
    {name: 'Calgary', region: 'Alberta, Canada', lat: 51.0447, lon: -114.0719},
    {name: 'Alexandria', region: 'Egypt', lat: 31.2001, lon: 29.9187},
    {name: 'Johannesburg', region: 'South Africa', lat: -26.2041, lon: 28.0473},
    {name: 'Lagos', region: 'Nigeria', lat: 6.5244, lon: 3.3792},
    {name: 'Kolkata', region: 'West Bengal, India', lat: 22.5726, lon: 88.3639},
    {name: 'Brussels', region: 'Belgium', lat: 50.8503, lon: 4.3517},
    {name: 'Belfast', region: 'Northern Ireland', lat: 54.5973, lon: -5.9301},
    {name: 'Marseille', region: 'France', lat: 43.2965, lon: 5.3698},
    {name: 'Bogotá', region: 'Colombia', lat: 4.711, lon: -74.0721},
    {name: 'Florence', region: 'Italy', lat: 43.7699, lon: 11.2556},
    {name: 'Tel Aviv', region: 'Israel', lat: 32.0853, lon: 34.7818},
    {name: 'Canberra', region: 'Australian Capital Territory, Australia', lat: -35.2809, lon: 149.13},
    {name: 'Helsinki', region: 'Finland', lat: 60.1699, lon: 24.9384},
    {name: 'Seville', region: 'Spain', lat: 37.3886, lon: -5.9823},
    {name: 'Riyadh', region: 'Saudi Arabia', lat: 24.7136, lon: 46.6753},
    {name: 'Manila', region: 'Philippines', lat: 14.5995, lon: 120.9842},
    {name: 'Brisbane', region: 'Queensland, Australia', lat: -27.4698, lon: 153.0251},
    {name: 'Abu Dhabi', region: 'United Arab Emirates', lat: 24.4539, lon: 54.3773},
    {name: 'Frankfurt', region: 'Germany', lat: 50.1109, lon: 8.6821},
    {name: 'Geneva', region: 'Switzerland', lat: 46.2044, lon: 6.1432},
    {name: 'Auckland', region: 'New Zealand', lat: -36.8509, lon: 174.7645},
    {name: 'Kyiv', region: 'Ukraine', lat: 50.4501, lon: 30.5234},
    {name: 'Cardiff', region: 'Wales', lat: 51.4816, lon: -3.1791},
    {name: 'Hiroshima', region: 'Japan', lat: 34.3853, lon: 132.4553},
    {name: 'Osaka', region: 'Japan', lat: 34.6937, lon: 135.5023},
    {name: 'Baghdad', region: 'Iraq', lat: 33.3128, lon: 44.3615},
    {name: 'Zurich', region: 'Switzerland', lat: 47.3769, lon: 8.5417},
    {name: 'Tehran', region: 'Iran', lat: 35.6892, lon: 51.389},
    {name: 'Taipei', region: 'Taiwan', lat: 25.033, lon: 121.5654},
    {name: 'Kyoto', region: 'Japan', lat: 35.0116, lon: 135.7681},
    {name: 'Wellington', region: 'New Zealand', lat: -41.2865, lon: 174.7762},
    {name: 'Pyongyang', region: 'North Korea', lat: 39.0392, lon: 125.7625},
    {name: 'Santiago', region: 'Chile', lat: -33.4489, lon: -70.6693},
    {name: 'Nairobi', region: 'Kenya', lat: -1.2864, lon: 36.8172},
    {name: 'Panama City', region: 'Panama', lat: 8.9833, lon: -79.5167},
    {name: 'San Juan', region: 'Puerto Rico', note: 'unincorporated territory of the United States', lat: 18.4655, lon: -66.1057},
    {name: 'Tijuana', region: 'Baja California, Mexico', lat: 32.5149, lon: -117.0382},
    {name: 'Cancún', region: 'Quintana Roo, Mexico', lat: 21.1619, lon: -86.8515},
    {name: 'Houston', region: 'Texas, United States', lat: 29.7604, lon: -95.3698},
    {name: 'Dallas', region: 'Texas, United States', lat: 32.7767, lon: -96.797},
    {name: 'Austin', region: 'Texas, United States', lat: 30.2672, lon: -97.7431},
    {name: 'Phoenix', region: 'Arizona, United States', lat: 33.4484, lon: -112.074},
    {name: 'Denver', region: 'Colorado, United States', lat: 39.7392, lon: -104.9903},
    {name: 'Detroit', region: 'Michigan, United States', lat: 42.3314, lon: -83.0458},
    {name: 'San Diego', region: 'California, United States', lat: 32.7157, lon: -117.1611},
    {name: 'Nashville', region: 'Tennessee, United States', lat: 36.1627, lon: -86.7816},
    {name: 'Minneapolis', region: 'Minnesota, United States', lat: 44.9778, lon: -93.265},
    {name: 'Portland', region: 'Oregon, United States', lat: 45.5152, lon: -122.6784},
    {name: 'Salt Lake City', region: 'Utah, United States', lat: 40.7608, lon: -111.891},
    {name: 'San Antonio', region: 'Texas, United States', lat: 29.4241, lon: -98.4936},
    {name: 'Baltimore', region: 'Maryland, United States', lat: 39.2904, lon: -76.6122},
    {name: 'Orlando', region: 'Florida, United States', lat: 28.5383, lon: -81.3792},
    {name: 'St. Louis', region: 'Missouri, United States', lat: 38.627, lon: -90.1994},
    {name: 'Charlotte', region: 'North Carolina, United States', lat: 35.2271, lon: -80.8431},
    {name: 'Indianapolis', region: 'Indiana, United States', lat: 39.7684, lon: -86.1581},
    {name: 'Oklahoma City', region: 'Oklahoma, United States', lat: 35.4676, lon: -97.5164},
    {name: 'Jacksonville', region: 'Florida, United States', lat: 30.3322, lon: -81.6557},
    {name: 'Columbus', region: 'Ohio, United States', lat: 39.9612, lon: -82.9988},
    {name: 'Tampa', region: 'Florida, United States', lat: 27.9506, lon: -82.4572},
    {name: 'Fort Worth', region: 'Texas, United States', lat: 32.7555, lon: -97.3308},
    {name: 'El Paso', region: 'Texas, United States', lat: 31.7619, lon: -106.485},
    {name: 'San Jose', region: 'California, United States', lat: 37.3382, lon: -121.8863},
    {name: 'Perth', region: 'Western Australia, Australia', lat: -31.9523, lon: 115.8613},
  ],
  // round 3 -- 378 places: capitals of placeable countries, lesser cities of famous ones
  [
    {name: 'San Marino', region: 'San Marino', lat: 43.9424, lon: 12.4578},
    {name: 'Chongqing', region: 'Chongqing, China', lat: 29.5637, lon: 106.5504},
    {name: 'Kansas City', region: 'Missouri, United States', lat: 39.0997, lon: -94.5786},
    {name: 'The Hague', region: 'Netherlands', lat: 52.0767, lon: 4.2986},
    {name: 'Kinshasa', region: 'Democratic Republic of the Congo', lat: -4.3276, lon: 15.3136},
    {name: 'Guangzhou', region: 'Guangdong, China', lat: 23.1291, lon: 113.2644},
    {name: 'Hyderabad', region: 'Telangana, India', lat: 17.385, lon: 78.4867},
    {name: 'Sarajevo', region: 'Bosnia and Herzegovina', lat: 43.8563, lon: 18.4131},
    {name: 'Cologne', region: 'Germany', lat: 50.9352, lon: 6.9531},
    {name: 'Thessaloniki', region: 'Greece', lat: 40.6401, lon: 22.9444},
    {name: 'Belgrade', region: 'Serbia', lat: 44.7872, lon: 20.4573},
    {name: 'Leeds', region: 'England', lat: 53.8008, lon: -1.5491},
    {name: 'Chennai', region: 'Tamil Nadu, India', lat: 13.0827, lon: 80.2707},
    {name: 'Bordeaux', region: 'France', lat: 44.8378, lon: -0.5792},
    {name: 'Bristol', region: 'England', lat: 51.4545, lon: -2.5879},
    {name: 'Shenzhen', region: 'Guangdong, China', lat: 22.5431, lon: 114.0579},
    {name: 'Karachi', region: 'Pakistan', lat: 24.8645, lon: 66.9978},
    {name: 'Valencia', region: 'Spain', lat: 39.4699, lon: -0.3763},
    {name: 'Monterrey', region: 'Nuevo León, Mexico', lat: 25.6866, lon: -100.3161},
    {name: 'Damascus', region: 'Syria', lat: 33.5138, lon: 36.2765},
    {name: 'Dhaka', region: 'Bangladesh', lat: 23.8103, lon: 90.4125},
    {name: 'Nuremberg', region: 'Germany', lat: 49.4521, lon: 11.0767},
    {name: 'Montevideo', region: 'Uruguay', lat: -34.9011, lon: -56.1645},
    {name: 'Strasbourg', region: 'France', lat: 48.5734, lon: 7.7521},
    {name: 'Genoa', region: 'Italy', lat: 44.4056, lon: 8.9463},
    {name: 'Edmonton', region: 'Alberta, Canada', lat: 53.5461, lon: -113.4938},
    {name: 'Addis Ababa', region: 'Ethiopia', lat: 9.0222, lon: 38.7469},
    {name: 'Ljubljana', region: 'Slovenia', lat: 46.0569, lon: 14.5058},
    {name: 'Bilbao', region: 'Spain', lat: 43.263, lon: -2.935},
    {name: 'Turin', region: 'Italy', lat: 45.0703, lon: 7.6869},
    {name: 'Adelaide', region: 'South Australia, Australia', lat: -34.9285, lon: 138.6008},
    {name: 'Kraków', region: 'Poland', lat: 50.0647, lon: 19.945},
    {name: 'Lahore', region: 'Pakistan', lat: 31.5204, lon: 74.3587},
    {name: 'Ulaanbaatar', region: 'Mongolia', lat: 47.8864, lon: 106.9057},
    {name: 'Bratislava', region: 'Slovakia', lat: 48.1486, lon: 17.1077},
    {name: 'Lyon', region: 'France', lat: 45.764, lon: 4.8357},
    {name: 'Winnipeg', region: 'Manitoba, Canada', lat: 49.8951, lon: -97.1384},
    {name: 'Ankara', region: 'Turkey', lat: 39.9208, lon: 32.8541},
    {name: 'Nice', region: 'France', lat: 43.7102, lon: 7.262},
    {name: 'Guadalajara', region: 'Jalisco, Mexico', lat: 20.6597, lon: -103.3496},
    {name: 'Bologna', region: 'Italy', lat: 44.4949, lon: 11.3426},
    {name: 'Antwerp', region: 'Belgium', lat: 51.2194, lon: 4.4025},
    {name: 'Tallinn', region: 'Estonia', lat: 59.437, lon: 24.7536},
    {name: 'Málaga', region: 'Spain', lat: 36.7213, lon: -4.4214},
    {name: 'Quebec City', region: 'Québec, Canada', lat: 46.8139, lon: -71.208},
    {name: 'Lima', region: 'Peru', lat: -12.0464, lon: -77.0428},
    {name: 'Bucharest', region: 'Romania', lat: 44.4268, lon: 26.1025},
    {name: 'Brasília', region: 'Federal District, Brazil', lat: -15.7939, lon: -47.8828},
    {name: 'Rabat', region: 'Morocco', lat: 34.0209, lon: -6.8416},
    {name: 'Nassau', region: 'The Bahamas', lat: 25.0343, lon: -77.3963},
    {name: 'Göteborg', region: 'Sweden', lat: 57.7089, lon: 11.9746},
    {name: 'Medellín', region: 'Colombia', lat: 6.2442, lon: -75.5812},
    {name: 'Vladivostok', region: 'Primorsky Krai, Russia', lat: 43.1155, lon: 131.8855},
    {name: 'Beirut', region: 'Lebanon', lat: 33.8886, lon: 35.4955},
    {name: 'Zagreb', region: 'Croatia', lat: 45.815, lon: 15.9819},
    {name: 'Darwin', region: 'Northern Territory, Australia', lat: -12.4634, lon: 130.8456},
    {name: 'Sofia', region: 'Bulgaria', lat: 42.6977, lon: 23.3219},
    {name: 'Pretoria', region: 'South Africa', lat: -25.7479, lon: 28.2293},
    {name: 'Hanoi', region: 'Vietnam', lat: 21.0285, lon: 105.8542},
    {name: 'Palermo', region: 'Italy', lat: 38.1157, lon: 13.3615},
    {name: 'Tangier', region: 'Morocco', lat: 35.7673, lon: -5.7998},
    {name: 'Porto', region: 'Portugal', lat: 41.1579, lon: -8.6291},
    {name: 'Brighton', region: 'England', lat: 50.8225, lon: -0.1372},
    {name: 'Marrakech', region: 'Morocco', lat: 31.6295, lon: -7.9811},
    {name: 'Riga', region: 'Latvia', lat: 56.9496, lon: 24.1052},
    {name: 'Oxford', region: 'England', lat: 51.752, lon: -1.2577},
    {name: 'Dresden', region: 'Germany', lat: 51.0504, lon: 13.7373},
    {name: 'Toulouse', region: 'France', lat: 43.6047, lon: 1.4442},
    {name: 'Stuttgart', region: 'Germany', lat: 48.7758, lon: 9.1829},
    {name: 'Christchurch', region: 'New Zealand', lat: -43.5321, lon: 172.6362},
    {name: 'Islamabad', region: 'Pakistan', lat: 33.6844, lon: 73.0479},
    {name: 'Kathmandu', region: 'Nepal', lat: 27.7172, lon: 85.324},
    {name: 'Algiers', region: 'Algeria', lat: 36.7372, lon: 3.0863},
    {name: 'Salzburg', region: 'Austria', lat: 47.8095, lon: 13.055},
    {name: 'Basel', region: 'Switzerland', lat: 47.5596, lon: 7.5886},
    {name: 'Gold Coast', region: 'Queensland, Australia', lat: -28.0167, lon: 153.4},
    {name: 'Quito', region: 'Ecuador', lat: -0.1807, lon: -78.4678},
    {name: 'Caracas', region: 'Venezuela', lat: 10.4806, lon: -66.9036},
    {name: 'Cork', region: 'Ireland', lat: 51.8985, lon: -8.4756},
    {name: 'La Paz', region: 'Bolivia', lat: -16.4897, lon: -68.1193},
    {name: 'Doha', region: 'Qatar', lat: 25.277, lon: 51.52},
    {name: 'Düsseldorf', region: 'Germany', lat: 51.2277, lon: 6.7735},
    {name: 'Rotterdam', region: 'Netherlands', lat: 51.9244, lon: 4.4777},
    {name: 'Minsk', region: 'Belarus', lat: 53.9, lon: 27.5667},
    {name: 'Kabul', region: 'Afghanistan', lat: 34.5553, lon: 69.2075},
    {name: 'Jeddah', region: 'Saudi Arabia', lat: 21.4858, lon: 39.1925},
    {name: 'Bergen', region: 'Norway', lat: 60.3913, lon: 5.3221},
    {name: 'Medina', region: 'Saudi Arabia', lat: 24.4686, lon: 39.6142},
    {name: 'Haifa', region: 'Israel', lat: 32.794, lon: 34.9896},
    {name: 'Sapporo', region: 'Japan', lat: 43.0618, lon: 141.3545},
    {name: 'Granada', region: 'Spain', lat: 37.1773, lon: -3.5986},
    {name: 'Yokohama', region: 'Japan', lat: 35.4437, lon: 139.638},
    {name: 'Bern', region: 'Switzerland', lat: 46.9481, lon: 7.4474},
    {name: 'Valletta', region: 'Malta', lat: 35.8997, lon: 14.5147},
    {name: 'Odesa', region: 'Ukraine', lat: 46.4825, lon: 30.7233},
    {name: 'Busan', region: 'South Korea', lat: 35.1796, lon: 129.0756},
    {name: 'Santo Domingo', region: 'Dominican Republic', lat: 18.4861, lon: -69.9312},
    {name: 'Durban', region: 'South Africa', lat: -29.8587, lon: 31.0218},
    {name: 'Nagasaki', region: 'Japan', lat: 32.7503, lon: 129.8779},
    {name: 'Phnom Penh', region: 'Cambodia', lat: 11.5564, lon: 104.9282},
    {name: 'Nagoya', region: 'Japan', lat: 35.1815, lon: 136.9066},
    {name: 'Colombo', region: 'Sri Lanka', lat: 6.9271, lon: 79.8612},
    {name: 'Nazareth', region: 'Israel', lat: 32.6996, lon: 35.3035},
    {name: 'Khartoum', region: 'Sudan', lat: 15.5007, lon: 32.5599},
    {name: 'Tripoli', region: 'Libya', lat: 32.8872, lon: 13.1913},
    {name: 'Manaus', region: 'Amazonas, Brazil', lat: -3.119, lon: -60.0217},
    {name: 'Amman', region: 'Jordan', lat: 31.9632, lon: 35.9303},
    {name: 'Wuhan', region: 'Hubei, China', lat: 30.5928, lon: 114.3055},
    {name: 'Yangon', region: 'Myanmar', lat: 16.8661, lon: 96.1951},
    {name: 'Kingston', region: 'Jamaica', lat: 17.9712, lon: -76.792},
    {name: 'Port-au-Prince', region: 'Haiti', lat: 18.5944, lon: -72.3074},
    {name: 'Luxor', region: 'Egypt', lat: 25.6872, lon: 32.6396},
    {name: 'Tunis', region: 'Tunisia', lat: 36.8065, lon: 10.1815},
    {name: 'Antananarivo', region: 'Madagascar', lat: -18.8792, lon: 47.5079},
    {name: 'Kobe', region: 'Japan', lat: 34.6901, lon: 135.1955},
    {name: 'Incheon', region: 'South Korea', lat: 37.4563, lon: 126.7052},
    {name: 'Guatemala City', region: 'Guatemala', lat: 14.6211, lon: -90.5269},
    {name: 'San Salvador', region: 'El Salvador', lat: 13.6894, lon: -89.1872},
    {name: 'Acapulco', region: 'Guerrero, Mexico', lat: 16.8531, lon: -99.8237},
    {name: 'Kuwait City', region: 'Kuwait', lat: 29.3697, lon: 47.9783},
    {name: 'San José', region: 'Costa Rica', lat: 9.9281, lon: -84.0907},
    {name: 'Birmingham', region: 'Alabama, United States', lat: 33.5186, lon: -86.8104},
    {name: 'Anchorage', region: 'Alaska, United States', lat: 61.2181, lon: -149.9003},
    {name: 'Memphis', region: 'Tennessee, United States', lat: 35.1495, lon: -90.049},
    {name: 'Pittsburgh', region: 'Pennsylvania, United States', lat: 40.4406, lon: -79.9959},
    {name: 'Buffalo', region: 'New York, United States', lat: 42.8864, lon: -78.8784},
    {name: 'Cleveland', region: 'Ohio, United States', lat: 41.4993, lon: -81.6944},
    {name: 'Milwaukee', region: 'Wisconsin, United States', lat: 43.0389, lon: -87.9065},
    {name: 'Santa Fe', region: 'New Mexico, United States', lat: 35.687, lon: -105.9378},
    {name: 'Boise', region: 'Idaho, United States', lat: 43.615, lon: -116.2023},
    {name: 'Omaha', region: 'Nebraska, United States', lat: 41.2565, lon: -95.9345},
    {name: 'Louisville', region: 'Kentucky, United States', lat: 38.2527, lon: -85.7585},
    {name: 'Richmond', region: 'Virginia, United States', lat: 37.5407, lon: -77.436},
    {name: 'Charleston', region: 'South Carolina, United States', lat: 32.7765, lon: -79.9311},
    {name: 'Savannah', region: 'Georgia, United States', lat: 32.0809, lon: -81.0912},
    {name: 'Atlantic City', region: 'New Jersey, United States', lat: 39.3643, lon: -74.4229},
    {name: 'Little Rock', region: 'Arkansas, United States', lat: 34.7465, lon: -92.2896},
    {name: 'Des Moines', region: 'Iowa, United States', lat: 41.5868, lon: -93.625},
    {name: 'Jackson', region: 'Mississippi, United States', lat: 32.2988, lon: -90.1848},
    {name: 'Wichita', region: 'Kansas, United States', lat: 37.6872, lon: -97.3301},
    {name: 'Cheyenne', region: 'Wyoming, United States', lat: 41.14, lon: -104.8202},
    {name: 'Billings', region: 'Montana, United States', lat: 45.7833, lon: -108.5007},
    {name: 'Fargo', region: 'North Dakota, United States', lat: 46.8772, lon: -96.7898},
    {name: 'Sioux Falls', region: 'South Dakota, United States', lat: 43.5446, lon: -96.7311},
    {name: 'Burlington', region: 'Vermont, United States', lat: 44.4759, lon: -73.2121},
    {name: 'Portland', region: 'Maine, United States', lat: 43.6591, lon: -70.2568},
    {name: 'Manchester', region: 'New Hampshire, United States', lat: 42.9956, lon: -71.4548},
    {name: 'Providence', region: 'Rhode Island, United States', lat: 41.824, lon: -71.4128},
    {name: 'Hartford', region: 'Connecticut, United States', lat: 41.7658, lon: -72.6734},
    {name: 'Wilmington', region: 'Delaware, United States', lat: 39.7391, lon: -75.5398},
    {name: 'Albuquerque', region: 'New Mexico, United States', lat: 35.0844, lon: -106.6504},
    {name: 'Tucson', region: 'Arizona, United States', lat: 32.2226, lon: -110.9747},
    {name: 'Sacramento', region: 'California, United States', lat: 38.5816, lon: -121.4944},
    {name: 'Colorado Springs', region: 'Colorado, United States', lat: 38.8339, lon: -104.8214},
    {name: 'Raleigh', region: 'North Carolina, United States', lat: 35.7796, lon: -78.6382},
    {name: 'Virginia Beach', region: 'Virginia, United States', lat: 36.8529, lon: -75.978},
    {name: 'Tulsa', region: 'Oklahoma, United States', lat: 36.154, lon: -95.9928},
    {name: 'Cincinnati', region: 'Ohio, United States', lat: 39.1031, lon: -84.512},
    {name: 'Lexington', region: 'Kentucky, United States', lat: 38.0406, lon: -84.5037},
    {name: 'Reno', region: 'Nevada, United States', lat: 39.5296, lon: -119.8138},
    {name: 'Madison', region: 'Wisconsin, United States', lat: 43.0731, lon: -89.4012},
    {name: 'Spokane', region: 'Washington, United States', lat: 47.6588, lon: -117.426},
    {name: 'Toledo', region: 'Ohio, United States', lat: 41.6528, lon: -83.5379},
    {name: 'Greensboro', region: 'North Carolina, United States', lat: 36.0726, lon: -79.792},
    {name: 'Lincoln', region: 'Nebraska, United States', lat: 40.8136, lon: -96.7026},
    {name: 'Fort Wayne', region: 'Indiana, United States', lat: 41.0793, lon: -85.1394},
    {name: 'Tacoma', region: 'Washington, United States', lat: 47.2529, lon: -122.4443},
    {name: 'Grand Rapids', region: 'Michigan, United States', lat: 42.9634, lon: -85.6681},
    {name: 'Rochester', region: 'New York, United States', lat: 43.1566, lon: -77.6088},
    {name: 'Albany', region: 'New York, United States', lat: 42.6526, lon: -73.7562},
    {name: 'Baton Rouge', region: 'Louisiana, United States', lat: 30.4515, lon: -91.1871},
    {name: 'Shreveport', region: 'Louisiana, United States', lat: 32.5252, lon: -93.7502},
    {name: 'Montgomery', region: 'Alabama, United States', lat: 32.3792, lon: -86.3077},
    {name: 'Mobile', region: 'Alabama, United States', lat: 30.6954, lon: -88.0399},
    {name: 'Huntsville', region: 'Alabama, United States', lat: 34.7304, lon: -86.5861},
    {name: 'Knoxville', region: 'Tennessee, United States', lat: 35.9606, lon: -83.9207},
    {name: 'Chattanooga', region: 'Tennessee, United States', lat: 35.0456, lon: -85.3097},
    {name: 'Columbia', region: 'South Carolina, United States', lat: 34.0007, lon: -81.0348},
    {name: 'Augusta', region: 'Georgia, United States', lat: 33.4735, lon: -82.0105},
    {name: 'Macon', region: 'Georgia, United States', lat: 32.8407, lon: -83.6324},
    {name: 'Springfield', region: 'Illinois, United States', lat: 39.7817, lon: -89.6501},
    {name: 'Peoria', region: 'Illinois, United States', lat: 40.6936, lon: -89.589},
    {name: 'Springfield', region: 'Missouri, United States', lat: 37.2089, lon: -93.2923},
    {name: 'Green Bay', region: 'Wisconsin, United States', lat: 44.5133, lon: -88.0133},
    {name: 'Duluth', region: 'Minnesota, United States', lat: 46.7867, lon: -92.1005},
    {name: 'Cedar Rapids', region: 'Iowa, United States', lat: 41.9779, lon: -91.6656},
    {name: 'Davenport', region: 'Iowa, United States', lat: 41.5236, lon: -90.5776},
    {name: 'Sioux City', region: 'Iowa, United States', lat: 42.4999, lon: -96.4003},
    {name: 'Topeka', region: 'Kansas, United States', lat: 39.0473, lon: -95.6752},
    {name: 'Bismarck', region: 'North Dakota, United States', lat: 46.8083, lon: -100.7837},
    {name: 'Rapid City', region: 'South Dakota, United States', lat: 44.0805, lon: -103.231},
    {name: 'Pierre', region: 'South Dakota, United States', lat: 44.3683, lon: -100.351},
    {name: 'Helena', region: 'Montana, United States', lat: 46.5891, lon: -112.0391},
    {name: 'Missoula', region: 'Montana, United States', lat: 46.8721, lon: -113.994},
    {name: 'Bozeman', region: 'Montana, United States', lat: 45.677, lon: -111.0429},
    {name: 'Casper', region: 'Wyoming, United States', lat: 42.8501, lon: -106.3252},
    {name: 'Provo', region: 'Utah, United States', lat: 40.2338, lon: -111.6585},
    {name: 'Las Cruces', region: 'New Mexico, United States', lat: 32.3199, lon: -106.7637},
    {name: 'Flagstaff', region: 'Arizona, United States', lat: 35.1983, lon: -111.6513},
    {name: 'Yuma', region: 'Arizona, United States', lat: 32.6927, lon: -114.6277},
    {name: 'Carson City', region: 'Nevada, United States', lat: 39.1638, lon: -119.7674},
    {name: 'Eugene', region: 'Oregon, United States', lat: 44.0521, lon: -123.0868},
    {name: 'Salem', region: 'Oregon, United States', lat: 44.9429, lon: -123.0351},
    {name: 'Olympia', region: 'Washington, United States', lat: 47.0379, lon: -122.9007},
    {name: 'Fairbanks', region: 'Alaska, United States', lat: 64.8378, lon: -147.7164},
    {name: 'Juneau', region: 'Alaska, United States', lat: 58.3005, lon: -134.4197},
    {name: 'Hilo', region: 'Hawaii, United States', lat: 19.7297, lon: -155.09},
    {name: 'Fort Collins', region: 'Colorado, United States', lat: 40.5853, lon: -105.0844},
    {name: 'Boulder', region: 'Colorado, United States', lat: 40.015, lon: -105.2705},
    {name: 'Charleston', region: 'West Virginia, United States', lat: 38.3498, lon: -81.6326},
    {name: 'Worcester', region: 'Massachusetts, United States', lat: 42.2626, lon: -71.8023},
    {name: 'Springfield', region: 'Massachusetts, United States', lat: 42.1015, lon: -72.5898},
    {name: 'New Haven', region: 'Connecticut, United States', lat: 41.3083, lon: -72.9279},
    {name: 'Concord', region: 'New Hampshire, United States', lat: 43.2081, lon: -71.5376},
    {name: 'Bangor', region: 'Maine, United States', lat: 44.8016, lon: -68.7712},
    {name: 'Trenton', region: 'New Jersey, United States', lat: 40.2206, lon: -74.7597},
    {name: 'Dover', region: 'Delaware, United States', lat: 39.1582, lon: -75.5244},
    {name: 'Annapolis', region: 'Maryland, United States', lat: 38.9784, lon: -76.4922},
    {name: 'Scranton', region: 'Pennsylvania, United States', lat: 41.4089, lon: -75.6624},
    {name: 'Harrisburg', region: 'Pennsylvania, United States', lat: 40.2732, lon: -76.8867},
    {name: 'Lansing', region: 'Michigan, United States', lat: 42.7325, lon: -84.5555},
    {name: 'Ann Arbor', region: 'Michigan, United States', lat: 42.2808, lon: -83.743},
    {name: 'South Bend', region: 'Indiana, United States', lat: 41.6764, lon: -86.252},
    {name: 'Evansville', region: 'Indiana, United States', lat: 37.9716, lon: -87.5711},
    {name: 'Asheville', region: 'North Carolina, United States', lat: 35.5951, lon: -82.5515},
    {name: 'Myrtle Beach', region: 'South Carolina, United States', lat: 33.6891, lon: -78.8867},
    {name: 'Fayetteville', region: 'Arkansas, United States', lat: 36.0626, lon: -94.1574},
    {name: 'Biloxi', region: 'Mississippi, United States', lat: 30.396, lon: -88.8853},
    {name: 'Halifax', region: 'Nova Scotia, Canada', lat: 44.6488, lon: -63.5752},
    {name: "Sana'a", region: 'Yemen', lat: 15.3694, lon: 44.191},
    {name: 'Dubrovnik', region: 'Croatia', lat: 42.6507, lon: 18.0944},
    {name: 'Phuket', region: 'Thailand', lat: 7.8804, lon: 98.3923},
    {name: 'Jaipur', region: 'Rajasthan, India', lat: 26.9124, lon: 75.7873},
    {name: 'Agra', region: 'Uttar Pradesh, India', lat: 27.1767, lon: 78.0081},
    {name: "Xi'an", region: 'Shaanxi, China', lat: 34.3416, lon: 108.9398},
    {name: 'Lhasa', region: 'Tibet, China', lat: 29.6525, lon: 91.1721},
    {name: 'Bruges', region: 'Belgium', lat: 51.2093, lon: 3.2247},
    {name: 'Pisa', region: 'Italy', lat: 43.7228, lon: 10.4017},
    {name: 'Verona', region: 'Italy', lat: 45.4384, lon: 10.9916},
    {name: 'Toledo', region: 'Spain', lat: 39.8628, lon: -4.0273},
    {name: 'Córdoba', region: 'Spain', lat: 37.8882, lon: -4.7794},
    {name: 'Palma', region: 'Mallorca, Spain', lat: 39.5696, lon: 2.6502},
    {name: 'Cambridge', region: 'England', lat: 52.2053, lon: 0.1218},
    {name: 'York', region: 'England', lat: 53.96, lon: -1.0873},
    {name: 'Newcastle', region: 'England', lat: 54.9783, lon: -1.6178},
    {name: 'Cannes', region: 'France', lat: 43.5528, lon: 7.0174},
    {name: 'Innsbruck', region: 'Austria', lat: 47.2692, lon: 11.4041},
    {name: 'Lucerne', region: 'Switzerland', lat: 47.0502, lon: 8.3093},
    {name: 'Galway', region: 'Ireland', lat: 53.2707, lon: -9.0568},
    {name: 'Hobart', region: 'Tasmania, Australia', lat: -42.8821, lon: 147.3272},
    {name: 'Dar es Salaam', region: 'Tanzania', lat: -6.7924, lon: 39.2083},
    {name: 'London', region: 'Ontario, Canada', lat: 42.9849, lon: -81.2453},
    {name: 'Rosario', region: 'Santa Fe, Argentina', lat: -32.9468, lon: -60.6393},
    {name: 'Gdańsk', region: 'Poland', lat: 54.352, lon: 18.6466},
    {name: 'Nanjing', region: 'Jiangsu, China', lat: 32.0603, lon: 118.7969},
    {name: 'Derry', region: 'Northern Ireland', lat: 54.9971, lon: -7.3092},
    {name: 'Hangzhou', region: 'Zhejiang, China', lat: 30.2741, lon: 120.1551},
    {name: 'Tianjin', region: 'Tianjin, China', lat: 39.1336, lon: 117.2054},
    {name: 'Hamilton', region: 'Ontario, Canada', lat: 43.2557, lon: -79.8711},
    {name: 'Belo Horizonte', region: 'Minas Gerais, Brazil', lat: -19.9167, lon: -43.9345},
    {name: 'Izmir', region: 'Turkey', lat: 38.4237, lon: 27.1428},
    {name: 'Rouen', region: 'France', lat: 49.4432, lon: 1.0993},
    {name: 'Lille', region: 'France', lat: 50.6292, lon: 3.0573},
    {name: 'Lausanne', region: 'Switzerland', lat: 46.5197, lon: 6.6323},
    {name: 'Montpellier', region: 'France', lat: 43.6108, lon: 3.8767},
    {name: 'Brno', region: 'Czechia', lat: 49.1951, lon: 16.6068},
    {name: 'Cali', region: 'Colombia', lat: 3.4516, lon: -76.532},
    {name: 'Liège', region: 'Belgium', lat: 50.6326, lon: 5.5797},
    {name: 'Aarhus', region: 'Denmark', lat: 56.1629, lon: 10.2039},
    {name: 'Erbil', region: 'Iraq', lat: 36.1912, lon: 44.0094},
    {name: 'Esfahan', region: 'Iran', lat: 32.6546, lon: 51.668},
    {name: 'Mérida', region: 'Yucatán, Mexico', lat: 20.9674, lon: -89.5926},
    {name: 'Valparaíso', region: 'Chile', lat: -33.0458, lon: -71.6197},
    {name: 'Victoria', region: 'British Columbia, Canada', lat: 48.4284, lon: -123.3656},
    {name: 'Pune', region: 'Maharashtra, India', lat: 18.5204, lon: 73.8567},
    {name: 'Curitiba', region: 'Paraná, Brazil', lat: -25.4284, lon: -49.2733},
    {name: 'Siena', region: 'Italy', lat: 43.3188, lon: 11.3308},
    {name: 'Bari', region: 'Italy', lat: 41.1171, lon: 16.8719},
    {name: 'Salamanca', region: 'Spain', lat: 40.9701, lon: -5.6635},
    {name: 'Aberdeen', region: 'Scotland', lat: 57.1497, lon: -2.0943},
    {name: 'Inverness', region: 'Scotland', lat: 57.4778, lon: -4.2247},
    {name: 'Avignon', region: 'France', lat: 43.9493, lon: 4.8055},
    {name: 'Reims', region: 'France', lat: 49.2583, lon: 4.0317},
    {name: 'Graz', region: 'Austria', lat: 47.0707, lon: 15.4395},
    {name: 'Bremen', region: 'Germany', lat: 53.0793, lon: 8.8017},
    {name: 'Faro', region: 'Portugal', lat: 37.0194, lon: -7.9322},
    {name: 'Odense', region: 'Denmark', lat: 55.4038, lon: 10.4024},
    {name: 'Heraklion', region: 'Crete, Greece', lat: 35.3387, lon: 25.1442},
    {name: 'Rotorua', region: 'New Zealand', lat: -38.1368, lon: 176.2497},
    {name: 'Puebla', region: 'Puebla, Mexico', lat: 19.0414, lon: -98.2063},
    {name: 'Sparta', region: 'Greece', lat: 37.0745, lon: 22.4301},
    {name: 'Lodz', region: 'Poland', lat: 51.7594, lon: 19.4572},
    {name: 'Uppsala', region: 'Sweden', lat: 59.8586, lon: 17.6389},
    {name: 'Bursa', region: 'Turkey', lat: 40.1885, lon: 29.061},
    {name: 'Trinidad', region: 'Cuba', lat: 21.8013, lon: -79.9848},
    {name: 'Turku', region: 'Finland', lat: 60.4518, lon: 22.2666},
    {name: 'Kaesong', region: 'North Korea', lat: 37.971, lon: 126.5547},
    {name: 'Kaohsiung', region: 'Taiwan', lat: 22.6273, lon: 120.3014},
    {name: 'La Plata', region: 'Buenos Aires, Argentina', lat: -34.9215, lon: -57.9545},
    {name: 'Malacca', region: 'Malaysia', lat: 2.1917, lon: 102.2551},
    {name: 'Tampere', region: 'Finland', lat: 61.4978, lon: 23.761},
    {name: 'George Town', region: 'Penang, Malaysia', lat: 5.4141, lon: 100.3288},
    {name: 'Johor Bahru', region: 'Malaysia', lat: 1.4927, lon: 103.7414},
    {name: 'Bandung', region: 'West Java, Indonesia', lat: -6.9175, lon: 107.6191},
    {name: 'Querétaro', region: 'Querétaro, Mexico', lat: 20.5881, lon: -100.3899},
    {name: 'Ibadan', region: 'Nigeria', lat: 7.3775, lon: 3.947},
    {name: 'Debrecen', region: 'Hungary', lat: 47.5316, lon: 21.6273},
    {name: 'Tainan', region: 'Taiwan', lat: 22.9997, lon: 120.227},
    {name: 'Taichung', region: 'Taiwan', lat: 24.1477, lon: 120.6736},
    {name: 'Pécs', region: 'Hungary', lat: 46.0727, lon: 18.2323},
    {name: 'Hamhung', region: 'North Korea', lat: 39.9184, lon: 127.5386},
    {name: 'Husavik', region: 'Iceland', lat: 66.0444, lon: -17.3389},
    {name: 'Kirkjubaejarklaustur', region: 'Iceland', lat: 63.7833, lon: -18.05},
    {name: 'Wrocław', region: 'Poland', lat: 51.1079, lon: 17.0385},
    {name: 'Leipzig', region: 'Germany', lat: 51.3397, lon: 12.3731},
    {name: 'Zaragoza', region: 'Spain', lat: 41.6488, lon: -0.8891},
    {name: 'Ghent', region: 'Belgium', lat: 51.0543, lon: 3.7174},
    {name: 'Nantes', region: 'France', lat: 47.2184, lon: -1.5536},
    {name: 'Fez', region: 'Morocco', lat: 34.0181, lon: -5.0078},
    {name: 'Hallstatt', region: 'Austria', lat: 47.5622, lon: 13.6493},
    {name: 'Dijon', region: 'France', lat: 47.322, lon: 5.0415},
    {name: 'Interlaken', region: 'Switzerland', lat: 46.6863, lon: 7.8632},
    {name: 'Limerick', region: 'Ireland', lat: 52.6638, lon: -8.6267},
    {name: 'Heidelberg', region: 'Germany', lat: 49.3988, lon: 8.6724},
    {name: 'Coimbra', region: 'Portugal', lat: 40.2033, lon: -8.4103},
    {name: 'Fukuoka', region: 'Japan', lat: 33.5902, lon: 130.4017},
    {name: 'Okayama', region: 'Japan', lat: 34.6551, lon: 133.9195},
    {name: 'Daegu', region: 'South Korea', lat: 35.8714, lon: 128.6014},
    {name: 'Gwangju', region: 'South Korea', lat: 35.1547, lon: 126.9156},
    {name: 'Daejeon', region: 'South Korea', lat: 36.3491, lon: 127.3849},
    {name: 'Chefchaouen', region: 'Morocco', lat: 35.1688, lon: -5.2636},
    {name: 'Athlone', region: 'Ireland', lat: 53.4239, lon: -7.9407},
    {name: 'León', region: 'Guanajuato, Mexico', lat: 21.1221, lon: -101.6828},
    {name: 'Silkeborg', region: 'Denmark', lat: 56.1764, lon: 9.5549},
    {name: 'Neapoli', region: 'Greece', lat: 35.2583, lon: 25.6508},
    {name: 'Poznań', region: 'Poland', lat: 52.4064, lon: 16.9252},
    {name: 'Nicosia', region: 'Cyprus', lat: 35.1264, lon: 33.4299},
    {name: 'Limassol', region: 'Cyprus', lat: 34.6786, lon: 33.0413},
    {name: 'Paphos', region: 'Cyprus', lat: 34.7754, lon: 32.4244},
    {name: 'Ocho Rios', region: 'Jamaica', lat: 18.4025, lon: -77.1048},
    {name: 'Kandy', region: 'Sri Lanka', lat: 7.2906, lon: 80.6337},
    {name: 'Cap-Haïtien', region: 'Haiti', lat: 19.7595, lon: -72.1982},
    {name: 'Santiago de los Caballeros', region: 'Dominican Republic', lat: 19.4504, lon: -70.6908},
    {name: 'Port of Spain', region: 'Trinidad and Tobago', lat: 10.6549, lon: -61.5019},
    {name: 'Bridgetown', region: 'Barbados', lat: 13.0975, lon: -59.6167},
    {name: 'Hamilton', region: 'Bermuda', note: 'British Overseas Territory', lat: 32.2942, lon: -64.7839},
    {name: 'Monaco', region: 'Monaco', note: 'sovereign city-state', lat: 43.7384, lon: 7.4246},
    {name: 'Gibraltar', region: 'United Kingdom', note: 'British Overseas Territory', lat: 36.1408, lon: -5.3536},
    {name: 'Luxembourg', region: 'Luxembourg', lat: 49.61, lon: 6.1296},
    {name: 'Macau', region: 'Macau, China', lat: 22.2109, lon: 113.553},
    {name: 'Vaduz', region: 'Liechtenstein', lat: 47.1416, lon: 9.5215},
    {name: 'Andorra la Vella', region: 'Andorra', lat: 42.5064, lon: 1.5218},
    {name: 'Malmö', region: 'Sweden', lat: 55.605, lon: 13.0038},
    {name: 'Vilnius', region: 'Lithuania', lat: 54.6872, lon: 25.2797},
    {name: 'Kaunas', region: 'Lithuania', lat: 54.8985, lon: 23.9036},
    {name: 'Tartu', region: 'Estonia', lat: 58.378, lon: 26.729},
    {name: 'Daugavpils', region: 'Latvia', lat: 55.8747, lon: 26.5361},
    {name: 'Maribor', region: 'Slovenia', lat: 46.5547, lon: 15.6459},
    {name: 'Split', region: 'Croatia', lat: 43.5081, lon: 16.4402},
    {name: 'Mostar', region: 'Bosnia and Herzegovina', lat: 43.3438, lon: 17.8078},
    {name: 'Banja Luka', region: 'Bosnia and Herzegovina', lat: 44.7722, lon: 17.191},
    {name: 'Novi Sad', region: 'Serbia', lat: 45.2671, lon: 19.8335},
    {name: 'Niš', region: 'Serbia', lat: 43.3209, lon: 21.8958},
    {name: 'Plovdiv', region: 'Bulgaria', lat: 42.1354, lon: 24.7453},
    {name: 'Varna', region: 'Bulgaria', lat: 43.2141, lon: 27.9147},
    {name: 'Košice', region: 'Slovakia', lat: 48.7164, lon: 21.2611},
    {name: 'Prešov', region: 'Slovakia', lat: 48.9986, lon: 21.2397},
    {name: 'Targoviste', region: 'Romania', lat: 44.925, lon: 25.456},
    {name: 'Tripoli', region: 'Lebanon', lat: 34.4335, lon: 35.8442},
    {name: 'Aqaba', region: 'Jordan', lat: 29.5328, lon: 35.006},
    {name: 'Nablus', region: 'West Bank, Palestine', lat: 31.939, lon: 35.2736},
    {name: 'Bizerte', region: 'Tunisia', lat: 37.2746, lon: 9.8739},
    {name: 'Pokhara', region: 'Nepal', lat: 28.2096, lon: 83.9856},
    {name: 'Manuel Antonio', region: 'Costa Rica', lat: 9.372, lon: -84.1348},
    {name: 'Santa Ana', region: 'El Salvador', lat: 13.9942, lon: -89.5597},
    {name: 'Punta del Este', region: 'Uruguay', lat: -34.9608, lon: -54.944},
    {name: 'Salto', region: 'Uruguay', lat: -31.3833, lon: -57.9667},
    {name: 'Manama', region: 'Bahrain', lat: 26.2285, lon: 50.5861},
  ],
  // round 4 -- 182 places: needs real geography, but a fair ask
  [
    {name: 'Sydney', region: 'Nova Scotia, Canada', lat: 46.1364, lon: -60.1956},
    {name: 'Batman', region: 'Turkey', lat: 37.8812, lon: 41.1351},
    {name: 'Djibouti', region: 'Djibouti', lat: 11.5721, lon: 43.1456},
    {name: 'Funchal', region: 'Madeira, Portugal', lat: 32.6669, lon: -16.9241},
    {name: 'Kaliningrad', region: 'Kaliningrad, Russia', lat: 54.7104, lon: 20.4522},
    {name: 'Valencia', region: 'Venezuela', lat: 10.162, lon: -67.9993},
    {name: 'Stanley', region: 'Falkland Islands', note: 'British Overseas Territory, claimed by Argentina', lat: -51.6977, lon: -57.8517},
    {name: 'Asunción', region: 'Paraguay', lat: -25.2637, lon: -57.5759},
    {name: 'Tbilisi', region: 'Georgia', lat: 41.7151, lon: 44.8271},
    {name: 'Baku', region: 'Azerbaijan', lat: 40.4093, lon: 49.8671},
    {name: 'Las Palmas', region: 'Canary Islands, Spain', lat: 28.1235, lon: -15.4363},
    {name: 'Almaty', region: 'Kazakhstan', lat: 43.222, lon: 76.8512},
    {name: 'Chengdu', region: 'Sichuan, China', lat: 30.5728, lon: 104.0668},
    {name: 'Timbuktu', region: 'Mali', lat: 16.7735, lon: -3.0074},
    {name: 'Tashkent', region: 'Uzbekistan', lat: 41.2995, lon: 69.2401},
    {name: 'Kampala', region: 'Uganda', lat: 0.3476, lon: 32.5825},
    {name: 'Barranquilla', region: 'Colombia', lat: 10.9685, lon: -74.7813},
    {name: 'Volgograd', region: 'Volgograd, Russia', lat: 48.708, lon: 44.5133},
    {name: 'Astana', region: 'Kazakhstan', lat: 51.1694, lon: 71.4491},
    {name: 'Samarkand', region: 'Uzbekistan', lat: 39.627, lon: 66.975},
    {name: 'Yekaterinburg', region: 'Sverdlovsk Oblast, Russia', lat: 56.8389, lon: 60.6057},
    {name: 'Dakar', region: 'Senegal', lat: 14.7167, lon: -17.4677},
    {name: 'Yerevan', region: 'Armenia', lat: 40.1792, lon: 44.4991},
    {name: 'Abidjan', region: 'Ivory Coast', lat: 5.3453, lon: -4.0244},
    {name: 'Sevastopol', region: 'Crimea, Ukraine', note: 'occupied by Russia since 2014; recognized as part of Ukraine', lat: 44.6167, lon: 33.5254},
    {name: 'Skopje', region: 'North Macedonia', lat: 41.9981, lon: 21.4254},
    {name: 'Kazan', region: 'Tatarstan, Russia', lat: 55.8304, lon: 49.0661},
    {name: 'Harare', region: 'Zimbabwe', lat: -17.8292, lon: 31.0522},
    {name: 'Accra', region: 'Ghana', lat: 5.6037, lon: -0.187},
    {name: 'Muscat', region: 'Oman', lat: 23.588, lon: 58.3829},
    {name: 'Ushuaia', region: 'Tierra del Fuego, Argentina', lat: -54.8019, lon: -68.303},
    {name: 'Cusco', region: 'Peru', lat: -13.532, lon: -71.9675},
    {name: 'Bloemfontein', region: 'South Africa', lat: -29.1193, lon: 26.2249},
    {name: 'Harbin', region: 'Heilongjiang, China', lat: 45.8038, lon: 126.534},
    {name: 'Tirana', region: 'Albania', lat: 41.3275, lon: 19.8189},
    {name: 'Iqaluit', region: 'Nunavut, Canada', lat: 63.7467, lon: -68.517},
    {name: 'Lviv', region: 'Ukraine', lat: 49.8397, lon: 24.0297},
    {name: 'Port Moresby', region: 'Papua New Guinea', lat: -9.4438, lon: 147.1803},
    {name: 'Chișinău', region: 'Moldova', lat: 47.0037, lon: 28.9071},
    {name: 'Saskatoon', region: 'Saskatchewan, Canada', lat: 52.1579, lon: -106.6702},
    {name: 'Tromsø', region: 'Norway', lat: 69.6492, lon: 18.9553},
    {name: 'Pristina', region: 'Kosovo', lat: 42.6629, lon: 21.1655},
    {name: 'Longyearbyen', region: 'Svalbard, Norway', note: 'Norway, under the Svalbard Treaty', lat: 78.2232, lon: 15.6469},
    {name: 'Oaxaca', region: 'Oaxaca, Mexico', lat: 17.0542, lon: -96.7132},
    {name: 'Abuja', region: 'Nigeria', lat: 9.0579, lon: 7.4951},
    {name: 'Luanda', region: 'Angola', lat: -8.839, lon: 13.2894},
    {name: 'Antalya', region: 'Turkey', lat: 36.8969, lon: 30.7133},
    {name: 'Da Nang', region: 'Vietnam', lat: 16.0678, lon: 108.2208},
    {name: 'Cartagena', region: 'Colombia', lat: 10.391, lon: -75.4794},
    {name: 'Windhoek', region: 'Namibia', lat: -22.5597, lon: 17.0832},
    {name: 'Córdoba', region: 'Córdoba, Argentina', lat: -31.4201, lon: -64.1888},
    {name: 'Aden', region: 'Yemen', lat: 12.8, lon: 45},
    {name: 'Chiang Mai', region: 'Thailand', lat: 18.7883, lon: 98.9853},
    {name: 'Monrovia', region: 'Liberia', lat: 6.2907, lon: -10.7605},
    {name: 'Kandahar', region: 'Afghanistan', lat: 31.6289, lon: 65.7372},
    {name: 'Peshawar', region: 'Pakistan', lat: 34.0151, lon: 71.5249},
    {name: 'Bishkek', region: 'Kyrgyzstan', lat: 42.8746, lon: 74.5698},
    {name: 'Trondheim', region: 'Norway', lat: 63.4305, lon: 10.3951},
    {name: 'Podgorica', region: 'Montenegro', lat: 42.4304, lon: 19.2594},
    {name: 'Mombasa', region: 'Kenya', lat: -4.0435, lon: 39.6682},
    {name: 'Guayaquil', region: 'Ecuador', lat: -2.1894, lon: -79.8891},
    {name: 'Aleppo', region: 'Syria', lat: 36.2167, lon: 37.1667},
    {name: 'Brazzaville', region: 'Republic of the Congo', lat: -4.2634, lon: 15.2429},
    {name: 'Porto Alegre', region: 'Rio Grande do Sul, Brazil', lat: -30.0346, lon: -51.2177},
    {name: 'Georgetown', region: 'Guyana', lat: 6.8013, lon: -58.1551},
    {name: 'Chihuahua', region: 'Chihuahua, Mexico', lat: 28.6353, lon: -106.0889},
    {name: 'Salvador', region: 'Bahia, Brazil', lat: -12.9714, lon: -38.5014},
    {name: 'Puerto Vallarta', region: 'Jalisco, Mexico', lat: 20.6534, lon: -105.2253},
    {name: 'Naypyidaw', region: 'Myanmar', lat: 19.7633, lon: 96.0785},
    {name: 'Vientiane', region: 'Laos', lat: 17.9757, lon: 102.6331},
    {name: 'Mosul', region: 'Iraq', lat: 36.3456, lon: 43.157},
    {name: 'Malé', region: 'Maldives', lat: 4.1755, lon: 73.5093},
    {name: 'Kigali', region: 'Rwanda', lat: -1.9441, lon: 30.0619},
    {name: 'Bamako', region: 'Mali', lat: 12.6392, lon: -8.0029},
    {name: 'Willemstad', region: 'Curaçao', note: 'constituent country of the Kingdom of the Netherlands', lat: 12.1091, lon: -68.9316},
    {name: 'Mar del Plata', region: 'Buenos Aires, Argentina', lat: -38.0023, lon: -57.5575},
    {name: 'Basra', region: 'Iraq', lat: 30.5085, lon: 47.7804},
    {name: 'Cebu City', region: 'Philippines', lat: 10.3157, lon: 123.8854},
    {name: 'Maputo', region: 'Mozambique', lat: -25.9653, lon: 32.5892},
    {name: 'Chittagong', region: 'Bangladesh', lat: 22.3569, lon: 91.7832},
    {name: 'Tegucigalpa', region: 'Honduras', lat: 14.0723, lon: -87.1921},
    {name: 'Benghazi', region: 'Libya', lat: 32.1149, lon: 20.0686},
    {name: 'Thimphu', region: 'Bhutan', lat: 27.4728, lon: 89.6393},
    {name: 'Aswan', region: 'Egypt', lat: 24.0889, lon: 32.8998},
    {name: 'Lusaka', region: 'Zambia', lat: -15.3875, lon: 28.3228},
    {name: 'Papeete', region: 'French Polynesia', note: 'overseas collectivity of France', lat: -17.5516, lon: -149.5585},
    {name: 'Managua', region: 'Nicaragua', lat: 12.1364, lon: -86.2514},
    {name: 'Queenstown', region: 'New Zealand', lat: -45.0312, lon: 168.6626},
    {name: 'Suva', region: 'Fiji', lat: -18.1416, lon: 178.4415},
    {name: 'Mendoza', region: 'Mendoza, Argentina', lat: -32.8908, lon: -68.8272},
    {name: 'Denpasar', region: 'Bali, Indonesia', lat: -8.6705, lon: 115.2126},
    {name: 'Zanzibar City', region: 'Zanzibar Archipelago, Tanzania', lat: -6.1659, lon: 39.2026},
    {name: 'Belize City', region: 'Belize', lat: 17.5046, lon: -88.1962},
    {name: 'Puerto Baquerizo Moreno', region: 'Galapagos Islands, Ecuador', lat: -0.9017, lon: -89.6102},
    {name: 'Siem Reap', region: 'Cambodia', lat: 13.3671, lon: 103.8448},
    {name: 'Kharkiv', region: 'Ukraine', lat: 49.9935, lon: 36.2304},
    {name: 'Mariupol', region: 'Ukraine', lat: 47.0971, lon: 37.5434},
    {name: 'Mandalay', region: 'Myanmar', lat: 21.9588, lon: 96.0891},
    {name: 'Arusha', region: 'Tanzania', lat: -3.3869, lon: 36.683},
    {name: 'Ahmedabad', region: 'Gujarat, India', lat: 23.0225, lon: 72.5714},
    {name: 'Varanasi', region: 'Uttar Pradesh, India', lat: 25.3176, lon: 82.9739},
    {name: 'Amritsar', region: 'Punjab, India', lat: 31.634, lon: 74.8723},
    {name: 'Panaji', region: 'Goa, India', lat: 15.4909, lon: 73.8278},
    {name: 'Qingdao', region: 'Shandong, China', lat: 36.0671, lon: 120.3826},
    {name: 'Ürümqi', region: 'Xinjiang, China', lat: 43.8256, lon: 87.6168},
    {name: 'Fortaleza', region: 'Ceará, Brazil', lat: -3.7319, lon: -38.5267},
    {name: 'Recife', region: 'Pernambuco, Brazil', lat: -8.0476, lon: -34.877},
    {name: 'Belém', region: 'Pará, Brazil', lat: -1.4558, lon: -48.4902},
    {name: 'Novosibirsk', region: 'Russia', lat: 55.0084, lon: 82.9357},
    {name: 'Sochi', region: 'Russia', lat: 43.6028, lon: 39.7342},
    {name: 'Murmansk', region: 'Russia', lat: 68.9585, lon: 33.0827},
    {name: 'Shiraz', region: 'Iran', lat: 29.5918, lon: 52.5837},
    {name: 'Bukhara', region: 'Uzbekistan', lat: 39.7747, lon: 64.4286},
    {name: 'San Sebastián', region: 'Spain', lat: 43.3183, lon: -1.9812},
    {name: 'Rovaniemi', region: 'Finland', lat: 66.5039, lon: 25.7294},
    {name: 'Cluj-Napoca', region: 'Romania', lat: 46.7712, lon: 23.6236},
    {name: 'Constanța', region: 'Romania', lat: 44.1598, lon: 28.6348},
    {name: 'Rhodes', region: 'Greece', lat: 36.4341, lon: 28.2176},
    {name: 'Cairns', region: 'Queensland, Australia', lat: -16.9186, lon: 145.7781},
    {name: 'Alice Springs', region: 'Northern Territory, Australia', lat: -23.698, lon: 133.8807},
    {name: 'Santiago de Cuba', region: 'Cuba', lat: 20.0247, lon: -75.8219},
    {name: 'Punta Arenas', region: 'Chile', lat: -53.1638, lon: -70.9171},
    {name: 'Yogyakarta', region: 'Yogyakarta, Indonesia', lat: -7.7956, lon: 110.3695},
    {name: 'Saint John', region: 'New Brunswick, Canada', lat: 45.2733, lon: -66.0633},
    {name: 'Brest', region: 'Belarus', lat: 52.0976, lon: 23.7341},
    {name: 'Grodno', region: 'Belarus', lat: 53.6884, lon: 23.8258},
    {name: 'Jalalabad', region: 'Afghanistan', lat: 34.4341, lon: 70.4477},
    {name: 'Khulna', region: 'Bangladesh', lat: 22.8098, lon: 89.5644},
    {name: 'Erdenet', region: 'Mongolia', lat: 49.0333, lon: 104.0833},
    {name: 'Jimma', region: 'Ethiopia', lat: 7.6667, lon: 36.8333},
    {name: 'Lalibela', region: 'Ethiopia', lat: 12.0317, lon: 39.0411},
    {name: 'Santa Fe', region: 'Santa Fe, Argentina', lat: -31.6333, lon: -60.7},
    {name: 'Mogadishu', region: 'Somalia', lat: 2.0469, lon: 45.3182},
    {name: 'Iași', region: 'Romania', lat: 47.1585, lon: 27.6014},
    {name: 'Barquisimeto', region: 'Venezuela', lat: 10.0678, lon: -69.3474},
    {name: 'Charlotte Amalie', region: 'St. Thomas, US Virgin Islands', note: 'unincorporated territory of the United States', lat: 18.3419, lon: -64.9307},
    {name: 'Simpson Bay', region: 'Sint Maarten', note: 'constituent country of the Kingdom of the Netherlands', lat: 18.0401, lon: -63.1089},
    {name: 'Basse-Terre', region: 'Guadeloupe, France', lat: 16.01, lon: -61.705},
    {name: 'Basseterre', region: 'Saint Kitts and Nevis', lat: 17.3, lon: -62.7333},
    {name: 'St. John’s', region: 'Antigua and Barbuda', lat: 17.1217, lon: -61.8436},
    {name: 'Roseau', region: 'Dominica', lat: 15.301, lon: -61.3881},
    {name: 'Castries', region: 'Saint Lucia', lat: 14.0101, lon: -60.9875},
    {name: 'Kingstown', region: 'Saint Vincent and the Grenadines', lat: 13.1553, lon: -61.227},
    {name: 'Port Louis', region: 'Mauritius', lat: -20.1619, lon: 57.4989},
    {name: 'Unalaska', region: 'Alaska, United States', lat: 53.8826, lon: -166.5313},
    {name: 'Surabaya', region: 'East Java, Indonesia', lat: -7.2575, lon: 112.7521},
    {name: 'Nuuk', region: 'Greenland', note: 'self-governing within the Kingdom of Denmark', lat: 64.1835, lon: -51.7216},
    {name: 'Trabzon', region: 'Turkey', lat: 41.0027, lon: 39.7168},
    {name: 'Diyarbakir', region: 'Turkey', lat: 37.9136, lon: 40.2172},
    {name: 'Mashhad', region: 'Iran', lat: 36.2605, lon: 59.6168},
    {name: 'Tabriz', region: 'Iran', lat: 38.0962, lon: 46.2738},
    {name: 'Oran', region: 'Algeria', lat: 35.6969, lon: -0.6331},
    {name: 'Annaba', region: 'Algeria', lat: 36.8982, lon: 7.7549},
    {name: 'Kano', region: 'Nigeria', lat: 12.0022, lon: 8.592},
    {name: 'Port Harcourt', region: 'Nigeria', lat: 4.8156, lon: 7.0498},
    {name: 'Bandar Seri Begawan', region: 'Brunei', lat: 4.8904, lon: 114.94},
    {name: 'Dammam', region: 'Saudi Arabia', lat: 26.4344, lon: 50.1033},
    {name: 'Dodoma', region: 'Tanzania', lat: -6.1731, lon: 35.7419},
    {name: 'Durrës', region: 'Albania', lat: 41.3233, lon: 19.4414},
    {name: 'Kotor', region: 'Montenegro', lat: 42.4247, lon: 18.7712},
    {name: 'Tiraspol', region: 'Moldova', lat: 46.8403, lon: 29.6433},
    {name: 'Prizren', region: 'Kosovo', lat: 42.2139, lon: 20.7397},
    {name: 'Sumgayit', region: 'Azerbaijan', lat: 40.5855, lon: 49.6317},
    {name: 'Gyumri', region: 'Armenia', lat: 40.7894, lon: 43.8475},
    {name: 'Vanadzor', region: 'Armenia', lat: 40.8128, lon: 44.4883},
    {name: 'Entebbe', region: 'Uganda', lat: 0.0517, lon: 32.4633},
    {name: 'Jinja', region: 'Uganda', lat: 0.4244, lon: 33.2041},
    {name: 'Hue', region: 'Vietnam', lat: 16.4637, lon: 107.5909},
    {name: 'Granada', region: 'Nicaragua', lat: 11.9293, lon: -85.956},
    {name: 'Belmopan', region: 'Belize', lat: 17.2534, lon: -88.7713},
    {name: 'San Pedro Sula', region: 'Honduras', lat: 15.5, lon: -88.0333},
    {name: 'Paramaribo', region: 'Suriname', lat: 5.852, lon: -55.2038},
    {name: 'Oulu', region: 'Finland', lat: 65.0121, lon: 25.4651},
    {name: 'Timișoara', region: 'Romania', lat: 45.7607, lon: 21.2268},
    {name: 'Culiacán', region: 'Sinaloa, Mexico', lat: 24.8091, lon: -107.394},
    {name: 'Tuxtla Gutiérrez', region: 'Chiapas, Mexico', lat: 16.7521, lon: -93.1152},
    {name: 'Davao City', region: 'Philippines', lat: 7.1907, lon: 125.4553},
    {name: 'Irkutsk', region: 'Russia', lat: 52.2978, lon: 104.2964},
    {name: 'Salta', region: 'Salta, Argentina', lat: -24.7821, lon: -65.4232},
    {name: 'Tucumán', region: 'Tucumán, Argentina', lat: -26.8083, lon: -65.2176},
    {name: 'Antofagasta', region: 'Chile', lat: -23.6509, lon: -70.3975},
    {name: 'Arequipa', region: 'Peru', lat: -16.409, lon: -71.5375},
  ],
  // round 5 -- 94 places: brutal -- only a local or a specialist would know
  [
    {name: 'Praia', region: 'Cape Verde', lat: 14.933, lon: -23.5133},
    {name: 'Ouagadougou', region: 'Burkina Faso', lat: 12.3714, lon: -1.5197},
    {name: 'Ashgabat', region: 'Turkmenistan', lat: 37.9601, lon: 58.3261},
    {name: 'Nouakchott', region: 'Mauritania', lat: 18.0858, lon: -15.9785},
    {name: 'Ciudad de la Paz', region: 'Equatorial Guinea', lat: 1.5917, lon: 10.8222},
    {name: 'Dushanbe', region: 'Tajikistan', lat: 38.5358, lon: 68.7791},
    {name: 'Batumi', region: 'Georgia', lat: 41.6168, lon: 41.6367},
    {name: 'Douala', region: 'Cameroon', lat: 4.0511, lon: 9.7679},
    {name: 'Yaoundé', region: 'Cameroon', lat: 3.848, lon: 11.5021},
    {name: 'Asmara', region: 'Eritrea', lat: 15.3229, lon: 38.9251},
    {name: 'Swakopmund', region: 'Namibia', lat: -22.6784, lon: 14.5272},
    {name: 'Gaborone', region: 'Botswana', lat: -24.6282, lon: 25.9231},
    {name: 'Bangui', region: 'Central African Republic', lat: 4.3947, lon: 18.5582},
    {name: 'Freetown', region: 'Sierra Leone', lat: 8.4844, lon: -13.2344},
    {name: 'Juba', region: 'South Sudan', lat: 4.8517, lon: 31.5825},
    {name: 'Conakry', region: 'Guinea', lat: 9.6412, lon: -13.5784},
    {name: 'Yamoussoukro', region: 'Ivory Coast', lat: 6.8276, lon: -5.2893},
    {name: 'Santa Cruz de la Sierra', region: 'Bolivia', lat: -17.7863, lon: -63.1812},
    {name: 'Malabo', region: 'Equatorial Guinea', lat: 3.7504, lon: 8.7371},
    {name: 'Ngerulmud', region: 'Palau', lat: 7.5, lon: 134.6242},
    {name: 'Niamey', region: 'Niger', lat: 13.5137, lon: 2.1098},
    {name: 'Dili', region: 'East Timor', lat: -8.5584, lon: 125.5795},
    {name: 'Majuro', region: 'Marshall Islands', lat: 7.1164, lon: 171.1858},
    {name: 'Banjul', region: 'The Gambia', lat: 13.4549, lon: -16.579},
    {name: 'Bulawayo', region: 'Zimbabwe', lat: -20.1325, lon: 28.6268},
    {name: 'Hargeisa', region: 'Somalia', note: 'de facto independent; recognized as part of Somalia', lat: 9.56, lon: 44.065},
    {name: 'Mbabane', region: 'Eswatini', lat: -26.3054, lon: 31.1367},
    {name: 'Jayapura', region: 'Papua, Indonesia', lat: -2.5916, lon: 140.669},
    {name: 'Kutaisi', region: 'Georgia', lat: 42.2679, lon: 42.6946},
    {name: 'São Tomé', region: 'São Tomé and Príncipe', lat: 0.3233, lon: 6.725},
    {name: 'Lubumbashi', region: 'Democratic Republic of the Congo', lat: -11.6876, lon: 27.5026},
    {name: 'Medan', region: 'North Sumatra, Indonesia', lat: 3.5952, lon: 98.6722},
    {name: 'Cotonou', region: 'Benin', lat: 6.3703, lon: 2.3912},
    {name: 'Bujumbura', region: 'Burundi', lat: -3.3614, lon: 29.3599},
    {name: 'Apia', region: 'Samoa', lat: -13.8333, lon: -171.7667},
    {name: 'Bissau', region: 'Guinea-Bissau', lat: 11.8817, lon: -15.617},
    {name: 'Libreville', region: 'Gabon', lat: 0.4162, lon: 9.4673},
    {name: 'Lomé', region: 'Togo', lat: 6.1319, lon: 1.2228},
    {name: 'Luang Prabang', region: 'Laos', lat: 19.886, lon: 102.1347},
    {name: 'Kumasi', region: 'Ghana', lat: 6.6885, lon: -1.6244},
    {name: 'Makassar', region: 'South Sulawesi, Indonesia', lat: -5.1486, lon: 119.4319},
    {name: 'Bitola', region: 'North Macedonia', lat: 41.0297, lon: 21.3292},
    {name: 'Maseru', region: 'Lesotho', lat: -29.3142, lon: 27.4833},
    {name: 'Lilongwe', region: 'Malawi', lat: -13.9626, lon: 33.7741},
    {name: 'Nukuʻalofa', region: 'Tonga', lat: -21.1333, lon: -175.2},
    {name: 'Honiara', region: 'Solomon Islands', lat: -9.4319, lon: 159.9565},
    {name: 'Goma', region: 'Democratic Republic of the Congo', lat: -1.674, lon: 29.218},
    {name: 'Maracaibo', region: 'Venezuela', lat: 10.6427, lon: -71.6125},
    {name: 'Port Vila', region: 'Vanuatu', lat: -17.7333, lon: 168.3167},
    {name: 'Kisangani', region: 'Democratic Republic of the Congo', lat: 0.5153, lon: 25.191},
    {name: 'Funafuti', region: 'Tuvalu', lat: -8.5167, lon: 179.2167},
    {name: 'Moroni', region: 'Comoros', lat: -11.7172, lon: 43.2473},
    {name: 'Yaren', region: 'Nauru', lat: -0.5477, lon: 166.9209},
    {name: 'Saint-Louis', region: 'Senegal', lat: 16.0326, lon: -16.4892},
    {name: 'Hagåtña', region: 'Guam', note: 'unincorporated territory of the United States', lat: 13.4757, lon: 144.7489},
    {name: 'Shymkent', region: 'Kazakhstan', lat: 42.3099, lon: 69.6004},
    {name: 'Ouahigouya', region: 'Burkina Faso', lat: 13.5828, lon: -2.4216},
    {name: 'Gitega', region: 'Burundi', lat: -3.4264, lon: 29.9246},
    {name: 'Osh', region: 'Kyrgyzstan', lat: 40.5283, lon: 72.7985},
    {name: 'Ganja', region: 'Azerbaijan', lat: 40.6828, lon: 46.3606},
    {name: 'Palikir', region: 'Federated States of Micronesia', lat: 6.9248, lon: 158.1611},
    {name: 'Karaganda', region: 'Kazakhstan', lat: 49.8067, lon: 73.0854},
    {name: 'Khujand', region: 'Tajikistan', lat: 40.2826, lon: 69.6222},
    {name: 'Port Sudan', region: 'Sudan', lat: 19.6158, lon: 37.2164},
    {name: 'Livingstone', region: 'Zambia', lat: -17.8419, lon: 25.8544},
    {name: 'Agadez', region: 'Niger', lat: 16.9734, lon: 7.991},
    {name: 'Cockburn Town', region: 'Grand Turk Island, Turks & Caicos', note: 'British Overseas Territory', lat: 21.4675, lon: -71.1389},
    {name: 'Lae', region: 'Papua New Guinea', lat: -6.7221, lon: 146.9847},
    {name: 'Massawa', region: 'Eritrea', lat: 15.61, lon: 39.45},
    {name: 'Mary', region: 'Turkmenistan', lat: 37.5994, lon: 61.8306},
    {name: 'Mbuji-Mayi', region: 'Democratic Republic of the Congo', lat: -6.15, lon: 23.6},
    {name: 'Blantyre', region: 'Malawi', lat: -15.7667, lon: 35.0168},
    {name: 'Victoria', region: 'Seychelles', lat: -4.6167, lon: 55.45},
    {name: 'South Tarawa', region: 'Kiribati', lat: 1.3278, lon: 172.977},
    {name: 'Theth', region: 'Albania', lat: 42.4046, lon: 19.768},
    {name: 'Nukus', region: 'Uzbekistan', lat: 42.56, lon: 59.61},
    {name: 'Malindi', region: 'Kenya', lat: -3.2192, lon: 40.1169},
    {name: 'Miri', region: 'Malaysia', lat: 4.3995, lon: 114.0089},
    {name: 'Kismayo', region: 'Somalia', lat: -0.3522, lon: 42.5428},
    {name: 'Bouaké', region: 'Ivory Coast', lat: 7.6939, lon: -5.0308},
    {name: 'Ndola', region: 'Zambia', lat: -12.9587, lon: 28.6366},
    {name: 'Benguela', region: 'Angola', lat: -12.5763, lon: 13.4055},
    {name: 'Takoradi', region: 'Ghana', lat: 4.9016, lon: -1.7831},
    {name: 'Maun', region: 'Botswana', lat: -19.9833, lon: 23.4167},
    {name: 'Bo', region: 'Sierra Leone', lat: 7.9647, lon: -11.7383},
    {name: 'Touba', region: 'Senegal', lat: 14.8623, lon: -15.8753},
    {name: 'Wau', region: 'South Sudan', lat: 7.7027, lon: 28.0032},
    {name: 'Kananga', region: 'Democratic Republic of the Congo', lat: -5.8962, lon: 22.4166},
    {name: 'Linden', region: 'Guyana', lat: 6.0019, lon: -58.2989},
    {name: 'Kankan', region: 'Guinea', lat: 10.3854, lon: -9.3055},
    {name: 'Port-Gentil', region: 'Gabon', lat: -0.7193, lon: 8.7815},
    {name: 'Buchanan', region: 'Liberia', lat: 5.8808, lon: -10.0467},
    {name: 'Moundou', region: 'Chad', lat: 8.5667, lon: 16.0833},
    {name: 'Sokodé', region: 'Togo', lat: 8.9833, lon: 1.1333},
  ],
]

export const ROUNDS_PER_GAME = TIERS.length

// Every place in the pool, tiers flattened away. Study mode asks for a
// country's cities rather than for a round's, so the difficulty banding that
// TIERS exists to express is exactly what it does not want.
export const ALL_PLACES = TIERS.flat()

// The round a place would be asked in, zero-based. A study run flattens the
// tiers away but still says which one a city came from, since that is what
// tells the player whether it was one to know. Keyed by label rather than by
// object, because the place that comes back out of Vue's state is a reactive
// proxy of the one that went in, and a Map does not know them for the same.
const ROUND_OF = new Map(TIERS.flatMap((tier, i) => tier.map((place) => [labelOf(place), i])))

export function roundOf(place) {
  return ROUND_OF.get(labelOf(place))
}

// Drawing uniformly at random felt far more repetitive than it should have:
// with one place taken per round, a pool of N collides with itself after
// roughly sqrt(N) games. Keeping a recent list per round and drawing only from
// what isn't on it turns "unlikely to repeat" into "cannot repeat for a while".
const RECENT_MAX = 30
const RECENT_KEY = 'cartographyclick.recent.v4'

// Two targets this close would take the same click, so one game never uses
// both. Covers same-name pairs the source keeps apart (Tripoli in Libya and in
// Lebanon are fine; two spellings of one city are not).
const MIN_SEPARATION_KM = 25

// One game also never asks for two cities of one country: Berlin and then
// Munich is a game about Germany, not the world. The country is read off the
// label, whose last part is the country wherever the source named a
// subdivision -- "Guangdong, China". Two exceptions each way.
//
// Overseas pieces labeled by their parent are their own thing here, since
// Hong Kong alongside Shanghai is not the repetition the rule is for. The
// rest of the territories -- Puerto Rico, Greenland, Curaçao -- already carry
// their own label and need no help.
const APART = new Set(['Hong Kong', 'Macau', 'Svalbard', 'Guadeloupe', 'Madeira'])
// The home nations are labeled apart because "Aberdeen, Scotland" is the
// better prompt, but London and then Glasgow is exactly the pair to stop.
const HOME_NATIONS = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland'])

function countryOf(place) {
  const parts = place.region.split(', ')
  if (parts.length > 1 && APART.has(parts[0])) return parts[0]
  const last = parts[parts.length - 1]
  return HOME_NATIONS.has(last) ? 'United Kingdom' : last
}

// Nor is a game most of one continent: four European capitals and Lagos is
// a game about Europe. Two per continent leaves a five-round game at least
// three, and the fifth round, which is largely African, somewhere to go.
// The table is game/continents', keyed by the names countryOf() yields and
// checked against the pool below, so a relabeled entry cannot quietly fall
// out of the rule.
const MAX_PER_CONTINENT = 2

function continentOfPlace(place) {
  return continentOf(countryOf(place))
}

// A country missing from the table would be its own continent to the cap
// and never trip anything at runtime, so it is caught here instead.
if (import.meta.env?.DEV) {
  for (const place of ALL_PLACES) {
    if (!continentOfPlace(place)) console.warn(`No continent for ${place.name}, ${place.region}`)
  }
}

// Labels, not objects: this has to survive a reload. The full label rather
// than the name, since round 3 has three Springfields and playing one should
// not hide the other two.
function labelOf(place) {
  return `${place.name}, ${place.region}`
}

function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY))
    if (Array.isArray(saved) && saved.length === TIERS.length) {
      return saved.map((names) => (Array.isArray(names) ? names.filter((n) => typeof n === 'string') : []))
    }
  } catch {
    // Private mode, cleared storage, a webview that denies access -- all just
    // mean we start the session with no history.
  }
  return TIERS.map(() => [])
}

const recent = loadRecent()

function remember(roundIndex, place) {
  const seen = recent[roundIndex]
  seen.push(labelOf(place))
  while (seen.length > Math.min(RECENT_MAX, Math.floor(TIERS[roundIndex].length * 0.4))) {
    seen.shift()
  }
}

// Pool share is not draw share. A country weighs its open places to this
// power when a round is drawn, so the draw still leans toward the countries
// with the most to ask about, but less than their counts alone would have
// it: a hundred places weigh about as much as thirty-two, ten as much as six.
// Simulated over the pool as it stands, the United States comes up in some
// 16% of round 1, 20% of round 2 and 11% of round 3, and in about half of
// all games -- each time a different city. A flat cap of eight was tried
// first and starved round 3, where the US is a third of the tier: weighed as
// eight against a hundred-odd countries, and blocked by the one-country rule
// whenever an earlier round had drawn it, it came up in one game in forty.
const WEIGHT_POWER = 0.75

function weightOf(places) {
  return Math.pow(places.length, WEIGHT_POWER)
}

// One place from the pool: a country by weight, then one of its places
// uniformly. Empty pools are the caller's problem.
function draw(pool) {
  const byCountry = new Map()
  for (const place of pool) {
    const country = countryOf(place)
    if (!byCountry.has(country)) byCountry.set(country, [])
    byCountry.get(country).push(place)
  }
  const groups = [...byCountry.values()]
  const weights = groups.map(weightOf)
  let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < groups.length; i++) {
    roll -= weights[i]
    if (roll < 0) return groups[i][Math.floor(Math.random() * groups[i].length)]
  }
  // Floating-point slack on the last boundary.
  const last = groups[groups.length - 1]
  return last[last.length - 1]
}

// Whether a place cannot join a game given what is in it already: a repeat,
// a second city of one country, a third of one continent, or a spot the same
// click would cover.
function clashes(place, chosen) {
  const R = 6371.0088
  const rad = Math.PI / 180
  const country = countryOf(place)
  const continent = continentOfPlace(place)
  if (chosen.filter((other) => continentOfPlace(other) === continent).length >= MAX_PER_CONTINENT) {
    return true
  }
  return chosen.some((other) => {
    if (other.name === place.name || countryOf(other) === country) return true
    const dLat = (other.lat - place.lat) * rad
    const dLon = (other.lon - place.lon) * rad
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(place.lat * rad) * Math.cos(other.lat * rad) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) < MIN_SEPARATION_KM
  })
}

// A game is named by a share code: the draw itself, written down. The five
// cities are their positions in their tiers, packed as one mixed-radix
// number -- round 5's index in the units place, round 1's at the top -- and
// written in base 36, digits and lower-case letters. The tiers multiply out
// to some fourteen billion games, and 36^7 is the first power past that, so
// a code is seven characters and every draw has exactly one. Codes are only
// as stable as the pool's order: re-tiering or inserting a city silently
// turns every code that was ever shared into a different game.
const SIZES = TIERS.map((tier) => tier.length)
const GAMES = SIZES.reduce((product, size) => product * size, 1)
export const CODE_LENGTH = Math.ceil(Math.log(GAMES) / Math.log(36))

function encode(cities) {
  let value = 0
  cities.forEach((place, i) => {
    value = value * SIZES[i] + TIERS[i].indexOf(place)
  })
  return value.toString(36).padStart(CODE_LENGTH, '0')
}

function decode(code) {
  let value = parseInt(code, 36)
  const cities = []
  for (let i = SIZES.length - 1; i >= 0; i--) {
    cities.unshift(TIERS[i][value % SIZES[i]])
    value = Math.floor(value / SIZES[i])
  }
  return cities
}

function keep(cities) {
  cities.forEach((place, i) => remember(i, place))
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    // Not persisting is survivable; the in-memory list still works this session.
  }
  return {code: encode(cities), cities}
}

// A fresh game, as {code, cities}: one place per round, most recognizable
// first, skipping whatever came up recently and anything that clashes with
// what this game already asks for, then a country before a city.
export function pickRound() {
  const chosen = []
  TIERS.forEach((tier, i) => {
    const fresh = tier.filter((place) => !recent[i].includes(labelOf(place)))
    // `fresh` only empties if a round's pool is smaller than its own window,
    // which the cap in remember() prevents -- but fall back rather than fail.
    const pool = fresh.length ? fresh : tier
    // Filtered rather than redrawn on a clash: a fifth of round 1 is the
    // United States, so a bounded retry could give up and let a pair
    // through, and five passes over a pool this size cost nothing.
    const open = pool.filter((place) => !clashes(place, chosen))
    const from = open.length ? open : pool
    chosen.push(draw(from))
  })
  return keep(chosen)
}

// The game a typed or linked code names, or null if it is not one: not
// digits and letters, or a number past the last game. Lenient about case,
// whitespace and dropped leading zeros, since it will have been read off a
// screen or a phone. Any five cities the code spells are accepted, clashing
// or not -- a code is a game someone was given, not a draw to be vetted.
export function gameFromCode(text) {
  const code = String(text ?? '').trim().toLowerCase()
  if (!/^[0-9a-z]+$/.test(code) || code.length > CODE_LENGTH) return null
  if (parseInt(code, 36) >= GAMES) return null
  return keep(decode(code))
}
