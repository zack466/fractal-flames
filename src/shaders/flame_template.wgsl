struct FlameBuffer {
  values: array<atomic<u32>>,
};

struct MaxHits {
  value: atomic<u32>,
}

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  random_seed: f32,
  cam_scale: f32,
  cam_x: f32,
  cam_y: f32,
  resolution: f32,
};

@group(0) @binding(0) var<storage, read_write> outputFlameBuffer : FlameBuffer;
@group(0) @binding(1) var<storage, read_write> outputAvgFlameBuffer : FlameBuffer;
@group(0) @binding(2) var<storage, read_write> outputOutputFlameBuffer : FlameBuffer;
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read_write> maxHits : MaxHits;

var<private> random_state: u32;

// scuffed random number generator
fn random() -> f32 {
  let A: u32 = 1664525u;
  let C: u32 = 1013904223u;
  random_state = random_state * A + C; // implicit mod 2^32 due to wrapping
  return f32(random_state) / f32(4294967295);
}

// compresses (-inf, inf) to (0, 1)
fn rsqrt(x: f32) -> f32 {
  return 0.5 + x / (2.0 * sqrt(1.0 + x * x));
}

fn random_color() -> vec3<u32> {
  return vec3(u32(random() * 255.0), u32(random() * 255.0), u32(random() * 255.0));
}

fn color_pixel(pos: vec2<f32>, color: vec3<u32>) {
  let x = (pos.x - uniforms.cam_x) * exp2(uniforms.cam_scale) + 0.5;
  let y = (pos.y - uniforms.cam_y) * exp2(uniforms.cam_scale) + 0.5;
  if (x > 1.0 || x < 0.0 || y > 1.0 || y < 0.0) {
    return;
  }
  let X = floor(uniforms.screenWidth * x);
  let Y = floor(uniforms.screenHeight * y);

  let index = u32(X + Y * uniforms.screenWidth) * 4u;

  atomicAdd(&outputFlameBuffer.values[index + 0u], color.r);
  atomicAdd(&outputFlameBuffer.values[index + 1u], color.g);
  atomicAdd(&outputFlameBuffer.values[index + 2u], color.b);
  atomicAdd(&outputFlameBuffer.values[index + 3u], 1u);
}

// INSERT FLAME HERE

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  random_state = u32(u32(uniforms.random_seed) + global_id.x);
  let starting_pos = vec2(f32(global_id.x) / uniforms.screenWidth, f32(global_id.y) / uniforms.screenHeight);
  flame(starting_pos);
}

@compute @workgroup_size(256)
fn avg(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x * 4u;
  const N = 15u;

  let R1 = atomicLoad(&outputFlameBuffer.values[index + 0u]);
  let G1 = atomicLoad(&outputFlameBuffer.values[index + 1u]);
  let B1 = atomicLoad(&outputFlameBuffer.values[index + 2u]);
  let H1 = atomicLoad(&outputFlameBuffer.values[index + 3u]);
  let R2 = atomicLoad(&outputAvgFlameBuffer.values[index + 0u]);
  let G2 = atomicLoad(&outputAvgFlameBuffer.values[index + 1u]);
  let B2 = atomicLoad(&outputAvgFlameBuffer.values[index + 2u]);
  let H2 = atomicLoad(&outputAvgFlameBuffer.values[index + 3u]);
  atomicStore(&outputAvgFlameBuffer.values[index + 0u], R2 - R2/N + R1/N);
  atomicStore(&outputAvgFlameBuffer.values[index + 1u], G2 - G2/N + G1/N);
  atomicStore(&outputAvgFlameBuffer.values[index + 2u], B2 - B2/N + B1/N);
  atomicStore(&outputAvgFlameBuffer.values[index + 3u], H2 - H2/N + H1/N);
  atomicStore(&outputFlameBuffer.values[index + 0u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 1u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 2u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 3u], 0u);
  atomicStore(&maxHits.value, 0u);
}

@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x * 4u;

  atomicStore(&outputFlameBuffer.values[index + 0u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 1u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 2u], 0u);
  atomicStore(&outputFlameBuffer.values[index + 3u], 0u);
  let R2 = atomicLoad(&outputAvgFlameBuffer.values[index + 0u]);
  let G2 = atomicLoad(&outputAvgFlameBuffer.values[index + 1u]);
  let B2 = atomicLoad(&outputAvgFlameBuffer.values[index + 2u]);
  let H2 = atomicLoad(&outputAvgFlameBuffer.values[index + 3u]);
  atomicStore(&outputAvgFlameBuffer.values[index + 0u], R2-R2/4u);
  atomicStore(&outputAvgFlameBuffer.values[index + 1u], G2-G2/4u);
  atomicStore(&outputAvgFlameBuffer.values[index + 2u], B2-B2/4u);
  atomicStore(&outputAvgFlameBuffer.values[index + 3u], H2-H2/4u);
  // atomicStore(&outputAvgFlameBuffer.values[index + 0u], 0u);
  // atomicStore(&outputAvgFlameBuffer.values[index + 1u], 0u);
  // atomicStore(&outputAvgFlameBuffer.values[index + 2u], 0u);
  // atomicStore(&outputAvgFlameBuffer.values[index + 3u], 0u);
  atomicStore(&maxHits.value, 0u);
}
