// A nonlinear function R^2 -> R^2
export interface Variation {
  // a stand-in until we implement an actual AST
  dataX: string
  dataY: string
}

export interface Color {
  r: number;
  g: number;
  b: number;
}

export function color(r: number, g: number, b: number) {
  return {r, g, b} as Color;
}

// each function has six parameters: a through f
// given a variation V_i, we define F_i(x, y) = V_i(ax + by + c, dx + ey + f)
// each variation also has a weight w
// TODO: blending
export interface Function {
  params: number[]; // should have length at least 6
  weight: number;
  name: string;
  variation: Variation;
  color: Color;
}

// r = sqrt($x^2 + $y^2)

export let Linear: Variation = {
  dataX: "x",
  dataY: "y",
}

export let Sinusoid: Variation = {
  dataX: "sin(x)",
  dataY: "sin(y)",
}

export let Spherical: Variation = {
  dataX: "x * sqrt(1 / (r * r))",
  dataY: "y * sqrt(1 / (r * r))",
}

export let Horseshoe: Variation = {
  dataX: "(x - y) * (x + y) / r",
  dataY: "2 * x * y / r",
}

export let Handkerchief: Variation = {
  dataX: "r * sin(theta + r)",
  dataY: "r * cos(theta - r)",
}

function functionToShader(f: Function) {
  return `
fn ${f.name}(x0: f32, y0: f32, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) -> vec2<f32> {
  let x = x0 * a + y0 * b + c;
  let y = x0 * d + y0 * e + f;
  let r = sqrt(pow(x, 2) + pow(y, 2));
  let theta = atan2(x, y);
  return vec2(${f.variation.dataX}, ${f.variation.dataY});
} `
}

function prefixSums(arr: number[]) {
  let newArr = arr.slice(0);
  for (let i = 1; i < arr.length; i++) {
    newArr[i] = newArr[i - 1] + arr[i];
  }
  return newArr;
}

export function toShader(fs: Function[]) {
  let warmupIterations = 20;
  let totalIterations = 10000;
  let totalWeight = fs.reduce((prev, curr) => prev + curr.weight, 0);
  let scaledWeights = fs.map(f => f.weight / totalWeight);
  let prefixWeights = prefixSums(scaledWeights);
  let flameFunction = `
${fs.map(functionToShader).join("\n\n")}

fn flame() {
  var pos = vec2(random(), random());

  for (var i = 0; i < ${totalIterations}; i++) {
    let r = random();
    if (false) {
    }${fs.map((f, i) =>
  ` else if (r < ${prefixWeights[i]}) {
      pos = ${f.name}(pos.x, pos.y, ${f.params[0]}, ${f.params[1]}, ${f.params[2]}, ${f.params[3]}, ${f.params[4]}, ${f.params[5]});
      if (i >= ${warmupIterations}) {
        color_pixel(pos, vec3(${f.color.r}u, ${f.color.g}u, ${f.color.b}u));
      }
    }`).join("")}
  }
}`
  return flameFunction
}
