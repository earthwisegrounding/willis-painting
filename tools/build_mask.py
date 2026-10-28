"""Builds the color-picker data for assets/img/exterior-visualizer.jpg.

  exterior-visualizer-mask.png   R = stucco walls, G = trim, B = front door
  exterior-visualizer-light.png  smooth lighting (blurred luminance), used to shade
                                 light colors painted over dark surfaces

Region coordinates are specific to this photo (source pixels, 1200x896).
Usage: python build_mask.py <photo.jpg> <mask.png> <light.png>
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SRC, OUT_MASK, OUT_LIGHT = sys.argv[1:4]
SS = 4  # supersampling for smooth shape edges

im = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32) / 255
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
mx, mn = im.max(-1), im.min(-1)
v = mx
s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
d = np.maximum(mx - mn, 1e-6)
hue = np.zeros_like(mx)
hue = np.where(mx == r, ((g - b) / d) % 6, hue)
hue = np.where(mx == g, (b - r) / d + 2, hue)
hue = np.where(mx == b, (r - g) / d + 4, hue)
hue = hue * 60
lum = 0.299 * r + 0.587 * g + 0.114 * b


def shapes(polys=(), rects=(), cut=()):
    """Anti-aliased coverage (0..1) of polygons/rects minus cut-out rects."""
    m = Image.new("L", (W * SS, H * SS), 0)
    dr = ImageDraw.Draw(m)
    for p in polys:
        dr.polygon([(x * SS, y * SS) for x, y in p], fill=255)
    for x0, y0, x1, y1 in rects:
        dr.rectangle([x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1], fill=255)
    for x0, y0, x1, y1 in cut:
        dr.rectangle([x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1], fill=0)
    return np.asarray(m.resize((W, H), Image.BOX)).astype(np.float32) / 255


def box(rs):
    m = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in rs:
        m[y0:y1, x0:x1] = True
    return m


# ---------------------------------------------------------------- geometry
house = shapes(polys=[[(115, 403), (243, 403), (243, 376), (366, 376), (366, 347), (408, 347), (408, 357),
                       (880, 357), (880, 396), (1060, 396), (1060, 411), (1115, 411), (1115, 490), (1158, 490),
                       (1158, 546), (1062, 546), (1062, 565), (785, 565), (785, 615), (582, 615), (582, 555),
                       (437, 555), (437, 627), (115, 627)]]) > 0.5

# Windows: glass + frame. Frames are found inside these.
windows = [(157, 456, 221, 482), (293, 428, 406, 526), (569, 427, 660, 520), (796, 469, 914, 571),
           (1057, 473, 1077, 498), (724, 461, 772, 518),
           (458, 365, 477, 385), (491, 365, 510, 385), (524, 365, 543, 385),  # entry clerestory
           (703, 385, 721, 397), (730, 385, 748, 397), (755, 385, 774, 397), (781, 385, 798, 397),
           (827, 385, 846, 397)]  # east clerestory

# Metal trim: roof fascia, entry canopy, flat-roof cap, shed awning, clerestory headers, small canopy
metal = shapes(
    polys=[[(672, 441), (721, 439), (817, 452), (926, 452), (934, 455), (934, 471.5), (768, 472.5),
            (672, 455.5)],
           [(410, 352), (432, 352), (432, 362), (424, 365), (413, 363)]],  # bracket under the roof
    rects=[(405, 344, 597, 355), (405, 355, 430, 361), (568, 355, 584, 361),
           (408, 399, 593, 413), (592, 400, 672, 410),
           (703, 377, 806, 385), (823, 377, 852, 385), (1059, 459, 1099, 468)])

# Front door slab with its five glass panes cut out
door = shapes(rects=[(479, 463, 521, 550)],
              cut=[(483, 468, 488, 478), (492, 468, 514, 478), (483, 484, 488, 494), (492, 484, 514, 494),
                   (484, 500, 515, 510), (483, 516, 515, 526), (483, 532, 515, 543)])

beam = (420, 412, 578, 440)
stone = (782, 563, 1064, 622)
path = (437, 552, 584, 700)
roof = (404, 326, 596, 346)
door_unit = (458, 438, 539, 555)
sconces = [(432, 476, 445, 503), (553, 475, 566, 502), (727, 474, 741, 500), (765, 475, 779, 500),
           (1098, 478, 1110, 498), (650, 470, 665, 520)]

# ---------------------------------------------------------------- plants
# Sunlit saguaro, ocotillo and prickly pear read as yellow-olive (hue ~38-70); stucco stays ~28-33
plant = (hue > 37) & (hue < 170) & (s > 0.28)
plant = ndi.binary_dilation(ndi.binary_opening(plant, np.ones((2, 2))), iterations=2)

# ---------------------------------------------------------------- walls
win = box(windows)
fixed = box([door_unit, beam, stone, path, roof]) | box(sconces)
not_wall = win | (metal > 0.98) | fixed
stucco = (hue >= 10) & (hue <= 37) & (s >= 0.10) & (s <= 0.78) & (v >= 0.28)
wall = house & ~not_wall & stucco & ~plant
wall = ndi.binary_closing(wall, np.ones((3, 3)))
wall = ndi.binary_opening(wall, np.ones((2, 2)))
lab, n = ndi.label(wall)
sizes = ndi.sum(wall, lab, range(1, n + 1))
wall = np.isin(lab, np.nonzero(sizes >= 150)[0] + 1)
wall &= house & ~not_wall & ~plant
# Stucco right against windows and metal is often in shadow; paint it so those edges stay crisp
ring = ndi.binary_dilation(win | (metal > 0.02), iterations=2) & ~win & house & ~plant & ~fixed
wall |= ring

# ---------------------------------------------------------------- trim
# Painted trim is the metal fascia, canopy, awning and headers. The black windows are
# factory-finished aluminum, so they keep their color. No plants overlap these shapes.
trim = metal

# ---------------------------------------------------------------- write
def feather(m, sigma):
    return np.clip(ndi.gaussian_filter(m.astype(np.float32), sigma), 0, 1)

wall_soft = np.maximum(np.clip(feather(wall, 0.7) * 1.15, 0, 1), ring) * ~win
out = np.stack([wall_soft, trim, door], -1)
Image.fromarray((out * 255).round().astype(np.uint8), "RGB").save(OUT_MASK, optimize=True)

light = ndi.gaussian_filter(lum, 6)
Image.fromarray((np.clip(light, 0, 1) * 255).round().astype(np.uint8), "L").save(OUT_LIGHT, optimize=True)
print("wall px", int(wall.sum()), "trim px", int((trim > 0.5).sum()), "door px", int((door > 0.5).sum()))
