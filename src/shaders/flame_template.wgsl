struct ColorBuffer {
  values: array<atomic<u32>>,
};

struct HitsBuffer {
  values: array<atomic<u32>>,
};

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  random_seed: f32,
  cam_scale: f32,
  cam_x: f32,
  cam_y: f32,
};

@group(0) @binding(0) var<storage, read_write> outputHitsBuffer : HitsBuffer;
@group(0) @binding(1) var<storage, read_write> outputColorBuffer : ColorBuffer;
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

var<private> random_state: u32;

// scuffed random number generator
fn random() -> f32 {
  let A: u32 = 1664525u;
  let C: u32 = 1013904223u;
  random_state = random_state * A + C; // implicit mod 2^32 due to wrapping
  return f32(random_state) / f32(4294967295);
}

fn color_pixel(pos: vec2<f32>, color: vec3<u32>) {
  let x = (pos.x - uniforms.cam_x) * exp2(uniforms.cam_scale) + 0.25;
  let y = (pos.y - uniforms.cam_y) * exp2(uniforms.cam_scale) + 0.25;
  if (x > 1.0 || x < 0.0 || y > 1.0 || y < 0) {
    return;
  }
  let X = floor(uniforms.screenWidth * x);
  let Y = floor(uniforms.screenHeight * y);
  let index = u32(X + Y * uniforms.screenWidth);

  // keeping a running average is way too inefficient...
  // let r = atomicLoad(&outputColorBuffer.values[index + 0u]);
  // let g = atomicLoad(&outputColorBuffer.values[index + 1u]);
  // let b = atomicLoad(&outputColorBuffer.values[index + 2u]);
  // atomicStore(&outputColorBuffer.values[index + 0u], (r + color.r) / 2);
  // atomicStore(&outputColorBuffer.values[index + 1u], (g + color.g) / 2);
  // atomicStore(&outputColorBuffer.values[index + 2u], (b + color.b) / 2);
  atomicAdd(&outputColorBuffer.values[index + 0u], color.r);
  atomicAdd(&outputColorBuffer.values[index + 1u], color.g);
  atomicAdd(&outputColorBuffer.values[index + 2u], color.b);
  atomicAdd(&outputHitsBuffer.values[index], 1u);
}

// INSERT FLAME HERE

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  random_state = u32(u32(uniforms.random_seed) + global_id.x);
  flame();
}

@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x;

  atomicStore(&outputColorBuffer.values[index + 0u], 0u);
  atomicStore(&outputColorBuffer.values[index + 1u], 0u);
  atomicStore(&outputColorBuffer.values[index + 2u], 0u);
  atomicStore(&outputHitsBuffer.values[index], 0u);
}
