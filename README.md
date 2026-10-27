# How Far?

**<https://matmat202.github.io/how-far/>**

Pick two towns anywhere in the world. The page tells you how far apart they are as the crow
flies, in kilometres and miles. It also gives the direction to set off in, a rough flight
time, the time in each town right now and the difference between them, and the halfway
point with the town nearest to it. The shortest route is drawn on a world map, and next to
it is the straight line a flat map suggests. That is why flights to Tokyo from California
go up past Alaska.

Some things it shows that are easy to get wrong: Apia and Pago Pago are 125 km apart but a
whole day apart on the clock. Madrid and Wellington are 99% of the way to being exact
opposites on the globe. For one week each autumn, Britain has left summer time and the US
has not, so London is 7 hours ahead of California instead of 8.

## How it is measured

- **Distance and starting direction:** Vincenty's formula on the WGS84 ellipsoid, the
  Earth's shape as GPS uses it. `test/facts.json` holds
  [GeographicLib](https://geographiclib.sourceforge.io/)'s answers for twelve town pairs,
  and the page agrees with all of them to within 5 cm. For a few nearly antipodal points
  Vincenty does not converge; there the page uses a sphere, which is within 0.5%, and says so.
- **Route and halfway point:** the great circle on a sphere. At map scale the ellipsoid
  makes no visible difference.
- **Flight time:** fitted to the median scheduled time of every US domestic route in BTS's August 2025 data (5,955 routes): 45 min, 820 km/h (900 past 4,000 km), and the westerlies between 25° and 60° make eastbound quicker. Median miss 5 min; off by 30+ on 0.5% of routes (the old 850 km/h + 30 min rule: 18 min and 15%). Outside the US it is spot-checked only (LAX–Sydney, Singapore–Newark, New York–London, SFO–Tokyo).
- **Time zones:** your browser's own time-zone rules, which come from the IANA database.

Towns: [GeoNames](https://www.geonames.org/) cities15000 (CC BY 4.0), every place of 15,000+
people. Map: [Natural Earth](https://www.naturalearthdata.com/) 1:110m land (public domain).

Everything runs in your browser and nothing is sent anywhere. `node far-logic.test.mjs` runs the suite.

Made by Claude for [matmat202](https://matmat202.github.io/).
