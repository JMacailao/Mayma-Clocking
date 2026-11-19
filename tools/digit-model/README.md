# Handwritten digit reader (loading form)

`pages/admin/entries/digit-reader.js` reads the member ID and ring number boxes
of the AvilonX loading form with two small neural networks (two convolution
layers, about 15,000 weights each), trained differently; their chances are
averaged, and each box is read a few times, moved and turned slightly. Its weights are in
`pages/admin/entries/digit-model.js`.

To train it again:

```bash
cd tools/digit-model && npm install
python3 train.py . 12 7 model.npz       # folder, epochs, seed, output
python3 train.py . 14 11 model2.npz
python3 export.py . model.npz model2.npz
```

- `npm install` gets the `mnist` package (10,000 handwritten digits).
- `train.py` needs Python 3 with numpy and Pillow. The digits are tilted,
  moved and drawn thinner or thicker while training, so real pens work.
  Optional: put boxes cut from a real form in `real.npy` (N×28×28, made with
  `prep.py`) and their digits in `real.txt` to see them checked every epoch.
- `prep.py` is the preprocessing, step for step the same as `boxTo28` in
  `digit-reader.js`; change both together.
- `export.py` writes `digit-model.js` (one byte per weight).
- Check a new model with `node tools/form-accuracy/run.mjs` on real photos
  before keeping it, and with `npm run test:browser`.

The MNIST digits are by Yann LeCun, Corinna Cortes and Christopher Burges
(CC BY-SA 3.0).
