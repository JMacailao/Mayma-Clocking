import numpy as np
# Same steps as pages/admin/entries/digit-reader.js: ink weights -> crop -> fit 20px -> centre of mass in 28x28.
def area_resize(a, nh, nw):
    h, w = a.shape
    ys = np.linspace(0, h, nh + 1); xs = np.linspace(0, w, nw + 1)
    out = np.zeros((nh, nw))
    for i in range(nh):
        for j in range(nw):
            y0, y1, x0, x1 = ys[i], ys[i+1], xs[j], xs[j+1]
            acc = 0; area = 0
            for y in range(int(np.floor(y0)), int(np.ceil(y1))):
                fy = min(y1, y + 1) - max(y0, y)
                if fy <= 0: continue
                for x in range(int(np.floor(x0)), int(np.ceil(x1))):
                    fx = min(x1, x + 1) - max(x0, x)
                    if fx <= 0: continue
                    acc += a[y, x] * fx * fy; area += fx * fy
            out[i, j] = acc / area if area else 0
    return out
def to28(ink):
    """ink: 2-D array 0..1 (1 = ink). Returns 28x28 or None."""
    mask = ink > 0.35
    if mask.sum() < 3: return None
    ys, xs = np.nonzero(mask)
    a = ink[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = a.shape; s = 20 / max(h, w)
    nh, nw = max(1, round(h * s)), max(1, round(w * s))
    small = area_resize(a, nh, nw)
    m = small.sum()
    cy = (small.sum(1) * np.arange(nh)).sum() / m; cx = (small.sum(0) * np.arange(nw)).sum() / m
    oy = int(round(13.5 - cy)); ox = int(round(13.5 - cx))
    oy = min(max(oy, 0), 28 - nh); ox = min(max(ox, 0), 28 - nw)
    out = np.zeros((28, 28)); out[oy:oy+nh, ox:ox+nw] = small
    return np.clip(out, 0, 1)
def box_ink(gray):
    """gray: 2-D 0..255 crop of one box (border included). Inner part, ink weights."""
    h, w = gray.shape
    g = gray[int(h*.12):h-int(h*.12), int(w*.15):w-int(w*.15)].astype(float)
    paper = np.percentile(g, 80)
    ink = np.clip((paper*.8 - g) / (paper*.35), 0, 1)
    return ink
