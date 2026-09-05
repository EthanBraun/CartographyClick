// Which continent a country is on. Two things ask: the city sampler, which
// caps how much of one continent a game can be, and the scoring floor, which
// pays for a guess on the target's continent -- see sharedGround() in
// game/borders.
//
// Keyed by name rather than by code because the two callers name countries
// differently and only one of them has codes. The city pool labels its places
// -- "Guangdong, China", plain "France" -- and draws a game from those labels
// before the borders have loaded, so it cannot ask the polygons. A guess can
// ask the polygons, and gets the Natural Earth name as game/borders shortens
// it. The two vocabularies agree almost everywhere; where they differ, both
// spellings are listed, and the few overseas pieces the pool labels by their
// own name are placed where they physically are.
//
// Six continents, the school-atlas split with the Americas apart. The line
// cases go by convention rather than by plate: Russia and Turkey's European
// cities are the ones anyone plays, Cyprus goes with the EU, the Caucasus
// with the Middle East, and Central America and the Caribbean are North
// America. Antarctica is listed so a tap there resolves to something, and it
// never matches a city.

const CONTINENTS = {
  Africa: [
    'Algeria', 'Angola', 'Benin', 'Bir Tawil', 'Botswana', 'Burkina Faso',
    'Burundi', 'Cameroon', 'Cape Verde', 'Central African Republic', 'Chad',
    'Comoros', 'Congo', 'DR Congo', 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea',
    'Eswatini', 'Ethiopia', 'Gabon', 'Ghana', 'Guinea', 'Guinea-Bissau',
    'Ivory Coast', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar',
    'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique',
    'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'Saint Helena',
    'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone',
    'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania',
    'The Gambia', 'Togo', 'Tunisia', 'Uganda', 'Western Sahara', 'Zambia',
    'Zimbabwe',
  ],
  Asia: [
    'Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan',
    'British Indian Ocean Territory', 'Brunei', 'Cambodia', 'China',
    'East Timor', 'Georgia', 'Hong Kong', 'India', 'Indonesia', 'Iran',
    'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan',
    'Laos', 'Lebanon', 'Macau', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar',
    'Nepal', 'North Korea', 'Oman', 'Pakistan', 'Palestine', 'Philippines',
    'Qatar', 'Saudi Arabia', 'Scarborough Shoal', 'Siachen Glacier',
    'Singapore', 'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan',
    'Thailand', 'Turkey', 'Turkmenistan', 'UAE', 'United Arab Emirates',
    'Uzbekistan', 'Vietnam', 'West Bank', 'Yemen',
  ],
  Europe: [
    'Akrotiri Sovereign Base Area', 'Albania', 'Andorra', 'Austria', 'Belarus',
    'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Crimea', 'Croatia',
    'Cyprus', 'Czechia', 'Denmark', 'Dhekelia Cantonment', 'Estonia',
    'Faroe Islands', 'Finland', 'France', 'Germany', 'Gibraltar', 'Greece',
    'Guernsey', 'Hungary', 'Iceland', 'Ireland', 'Isle of Man', 'Italy',
    'Jersey', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg',
    'Madeira', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands',
    'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia',
    'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Svalbard',
    'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'Vatican City',
    'Åland',
  ],
  'North America': [
    'Anguilla', 'Antigua and Barbuda', 'Aruba', 'Bahamas', 'Bajo Nuevo Bank',
    'Barbados', 'Belize', 'Bermuda', 'British Virgin Islands', 'Canada',
    'Cayman Islands', 'Clipperton Island', 'Costa Rica', 'Cuba', 'Curaçao',
    'Dominica', 'Dominican Republic', 'El Salvador', 'Greenland', 'Grenada',
    'Guadeloupe', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico',
    'Montserrat', 'Nicaragua', 'Panama', 'Puerto Rico', 'Saint Barthélemy',
    'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin',
    'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines',
    'Serranilla Bank', 'Sint Maarten', 'The Bahamas', 'Trinidad and Tobago',
    'Turks & Caicos', 'Turks and Caicos Islands', 'US Virgin Islands',
    'United States',
  ],
  'South America': [
    'Argentina', 'Bolivia', 'Brazil', 'Brazilian Island', 'Chile', 'Colombia',
    'Ecuador', 'Falkland Islands', 'Guyana', 'Paraguay', 'Peru',
    'South Georgia and the South Sandwich Islands',
    'Southern Patagonian Ice Field', 'Suriname', 'Uruguay', 'Venezuela',
  ],
  Oceania: [
    'American Samoa', 'Ashmore and Cartier Islands', 'Australia',
    'Australian Indian Ocean Territories', 'Cook Islands', 'Coral Sea Islands',
    'Fiji', 'French Polynesia', 'Guam', 'Kiribati', 'Marshall Islands',
    'Micronesia', 'Nauru', 'New Caledonia', 'New Zealand', 'Niue',
    'Norfolk Island', 'Northern Mariana Islands', 'Palau', 'Papua New Guinea',
    'Pitcairn Islands', 'Samoa', 'Solomon Islands', 'Tonga', 'Tuvalu',
    'United States Minor Outlying Islands', 'Vanuatu', 'Wake Island',
    'Wallis and Futuna',
  ],
  Antarctica: [
    'Antarctica', 'French Southern and Antarctic Lands',
    'Heard Island and McDonald Islands',
  ],
}

const byCountry = new Map()
for (const [continent, countries] of Object.entries(CONTINENTS)) {
  for (const country of countries) byCountry.set(country, continent)
}

// The continent a country sits on, or undefined for a name not listed.
export function continentOf(country) {
  return byCountry.get(country)
}
