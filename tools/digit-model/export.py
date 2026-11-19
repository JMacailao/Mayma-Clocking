# Packs model.npz into pages/admin/entries/digit-model.js (one byte per weight, a scale per layer).
import numpy as np, base64, sys, os
D = sys.argv[1] if len(sys.argv) > 1 else '.'
P = np.load(os.path.join(D, 'model.npz'))
layers, chunks = [], []
for name in ['w1', 'b1', 'w2', 'b2', 'w3', 'b3']:
    v = P[name].astype(np.float64).ravel()
    scale = float(np.abs(v).max() / 127) or 1.0
    q = np.clip(np.round(v / scale), -127, 127).astype(np.int8)
    layers.append((name, v.size, scale)); chunks.append(q.tobytes())
data = base64.b64encode(b''.join(chunks)).decode()
out = os.path.join(D, '..', '..', 'pages', 'admin', 'entries', 'digit-model.js')
with open(out, 'w') as f:
    f.write('// The handwritten digit reader\'s weights (made by tools/digit-model/export.py; do not edit).\n')
    f.write('// Trained on MNIST handwritten digits (Yann LeCun, Corinna Cortes, Christopher Burges; CC BY-SA 3.0).\n')
    f.write('export const DIGIT_MODEL={channels:[%d,%d],layers:[%s],\n' % (P['w1'].shape[0], P['w2'].shape[0], ','.join("['%s',%d,%r]" % l for l in layers)))
    f.write("data:'%s'};\n" % data)
print('wrote', out, len(data), 'characters')
