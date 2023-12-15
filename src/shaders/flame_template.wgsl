struct ColorBuffer {
  values: array<atomic<u32>>,
};

struct HitsBuffer {
  values: array<atomic<u32>>,
};

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  scale: f32,
  random_seed: f32,
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
  let X = floor(uniforms.screenWidth * f32(uniforms.scale) * pos.x);
  let Y = floor(uniforms.screenHeight * f32(uniforms.scale) * pos.y);
  let index = u32(X + Y * uniforms.screenWidth * uniforms.scale);

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
