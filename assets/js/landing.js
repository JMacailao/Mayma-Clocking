// Landing page: draws the winding "How it works" line through the numbered step dots.
const snake = document.querySelector('[data-snake]');
if (snake) {
  const svg = snake.querySelector('svg');
  const paths = svg.querySelectorAll('path');
  const draw = () => {
    const box = snake.getBoundingClientRect();
    const dots = [...snake.querySelectorAll('.lp-dot')].map(dot => {
      const r = dot.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    });
    if (dots.length < 2) return;
    // Each segment swings out to one side, alternating, so the line winds like a snake.
    const swing = Math.min(70, box.width * 0.06);
    let d = `M${dots[0][0]} ${dots[0][1]}`;
    for (let i = 1; i < dots.length; i++) {
      const [x0, y0] = dots[i - 1], [x1, y1] = dots[i];
      const side = i % 2 ? 1 : -1, bend = (y1 - y0) * 0.45;
      d += ` C${x0 + side * swing} ${y0 + bend} ${x1 + side * swing} ${y1 - bend} ${x1} ${y1}`;
    }
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    paths.forEach(path => path.setAttribute('d', d));
  };
  new ResizeObserver(draw).observe(snake);
  draw();
}
