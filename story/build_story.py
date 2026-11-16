#!/usr/bin/env python3
"""site/data/places.json -> site/story/story.json: does the line on the map point the right way?

    python3 build_story.py          # BUILD_OUT=... writes elsewhere (publish.sh compares)

Pairs of people: N pairs of towns drawn with a fixed seed, each town as often as its
GeoNames population (31,807 towns of 15,000+, 3.9 billion people), a pair of the same town
drawn again. For each pair: the distance and starting direction on WGS84 (site/far-logic.js's
measure(), Vincenty, ported below), and the direction of the straight line between them on
two flat maps: the page's own (longitude across, latitude up, the short way round, as
app.js draws its dashed line), and Mercator's, which is a rhumb line (web maps).

`flags`: 1 the same country, 2 one end in China, 4 both ends within 45 degrees of the
equator. Those three are the controls: is it only long trips, only China, only the poles?

test/story.test.mjs re-does every pair with the real JS measure() and requires the same
answer to a tenth of a degree and a kilometre.
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
PLACES = os.path.join(HERE, "site", "data", "places.json")
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
N, SEED = 15000, 20261116
RAD, DEG = math.pi / 180, 180 / math.pi
A, F = 6378137, 1 / 298.257223563
B = A * (1 - F)
R_KM = 6371.0088


def sphere(a, b):
    p1, p2, dl = a[0] * RAD, b[0] * RAD, (b[1] - a[1]) * RAD
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    km = 2 * R_KM * math.asin(min(1, math.sqrt(h)))
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return km, (math.atan2(y, x) * DEG + 360) % 360


def measure(a, b):
    """far-logic.js measure(): Vincenty inverse on WGS84 -> (km, bearing); the sphere if it fails"""
    L = (b[1] - a[1]) * RAD
    U1, U2 = math.atan((1 - F) * math.tan(a[0] * RAD)), math.atan((1 - F) * math.tan(b[0] * RAD))
    sU1, cU1, sU2, cU2 = math.sin(U1), math.cos(U1), math.sin(U2), math.cos(U2)
    lam = L
    for _ in range(200):
        sinL, cosL = math.sin(lam), math.cos(lam)
        sinS = math.sqrt((cU2 * sinL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cosL) ** 2)
        if sinS == 0:
            return 0.0, 0.0
        cosS = sU1 * sU2 + cU1 * cU2 * cosL
        sigma = math.atan2(sinS, cosS)
        sinA = cU1 * cU2 * sinL / sinS
        cos2a = 1 - sinA * sinA
        cos2Sm = cosS - 2 * sU1 * sU2 / cos2a if cos2a else 0
        C = F / 16 * cos2a * (4 + F * (4 - 3 * cos2a))
        prev = lam
        lam = L + (1 - C) * F * sinA * (sigma + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm * cos2Sm)))
        if abs(lam - prev) < 1e-12:
            u2 = cos2a * (A * A - B * B) / (B * B)
            k1 = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
            k2 = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
            dS = k2 * sinS * (cos2Sm + k2 / 4 * (cosS * (-1 + 2 * cos2Sm * cos2Sm)
                 - k2 / 6 * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2Sm * cos2Sm)))
            az = math.atan2(cU2 * sinL, cU1 * sU2 - sU1 * cU2 * cosL) * DEG
            return B * k1 * (sigma - dS) / 1000, (az + 360) % 360
    return sphere(a, b)


def wrap(dlon):
    return (dlon + 180) % 360 - 180


def flat(a, b):
    """the page's dashed line: x is longitude, y latitude, the short way round"""
    return (math.atan2(wrap(b[1] - a[1]), b[0] - a[0]) * DEG + 360) % 360


def merc(a, b):
    """a straight line on Mercator: the rhumb line's constant direction"""
    psi = lambda la: math.log(math.tan(math.pi / 4 + la * RAD / 2))
    return (math.atan2(wrap(b[1] - a[1]) * RAD, psi(b[0]) - psi(a[0])) * DEG + 360) % 360


def off_by(p, col=4):
    return abs((p[3] - p[col] + 1800) % 3600 - 1800) / 10


S10 = math.sin(10 * RAD)


def flips(p):
    c1, c2 = math.cos(p[3] / 10 * RAD), math.cos(p[4] / 10 * RAD)
    return abs(c1) > S10 and abs(c2) > S10 and (c1 > 0) != (c2 > 0)


SEL = {"all": lambda p: True, "eq": lambda p: p[6] & 4, "nochina": lambda p: not p[6] & 2}


def check(pairs):
    """layout.js stats(), done again here: the test requires the two to agree"""
    out = {}
    for key, keep in SEL.items():
        P = [p for p in pairs if keep(p)]
        share = lambda xs, f: sum(1 for x in xs if f(x)) / len(xs)
        km = sorted(p[2] for p in P)
        short = sorted(off_by(p) for p in P if p[2] < 3000)
        far = lambda k: [p for p in P if p[2] >= k]
        out[key] = {
            "n": len(P), "median_km": km[(len(km) - 1) // 2],
            "dom": share(P, lambda p: p[6] & 1), "over10k": share(P, lambda p: p[2] >= 10000),
            "off45": share(P, lambda p: off_by(p) > 45), "off90": share(P, lambda p: off_by(p) > 90),
            "merc45": share(P, lambda p: off_by(p, 5) > 45), "flip": share(P, flips),
            "under6k_off45": sum(1 for p in P if p[2] < 6000 and off_by(p) > 45),
            "under6k_n": sum(1 for p in P if p[2] < 6000),
            "under3k_median_off": short[(len(short) - 1) // 2],
            "over10k_off45": share(far(10000), lambda p: off_by(p) > 45),
            "over12k_off45": share(far(12000), lambda p: off_by(p) > 45),
            "over15k_flip": share(far(15000), flips),
        }
    return out


def main():
    D = json.load(open(PLACES))
    P = D["places"]
    rng = random.Random(SEED)
    cum, acc = [], 0
    for p in P:
        acc += p[5]
        cum.append(acc)
    pairs = []
    while len(pairs) < N:
        i, j = rng.choices(range(len(P)), cum_weights=cum, k=2)
        if i == j:
            continue
        a, b = P[i], P[j]
        A_, B_ = (a[3], a[4]), (b[3], b[4])
        km, brg = measure(A_, B_)
        flags = (a[2] == b[2]) | (2 if "China" in (a[2], b[2]) else 0) | (4 if max(abs(a[3]), abs(b[3])) <= 45 else 0)
        pairs.append([i, j, round(km), round(brg * 10), round(flat(A_, B_) * 10), round(merc(A_, B_) * 10), flags])
    out = {
        "source": D["source"] + ", as the page ships it in site/data/places.json",
        "seed": SEED,
        "n_towns": len(P),
        "people": sum(p[5] for p in P),
        "cols": ["from", "to", "km", "bearing x10", "flat map x10", "mercator x10", "flags"],
        "pairs": pairs,
        "check": check(pairs),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    for key, c in out["check"].items():
        print(f"{key:8s} " + "  ".join(f"{k} {v:.3f}" if isinstance(v, float) else f"{k} {v}" for k, v in c.items()))


if __name__ == "__main__":
    main()
