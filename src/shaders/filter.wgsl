struct FlameBuffer {
  values: array<u32>,
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

@group(0) @binding(0) var<storage, read_write> inputFlameBuffer : FlameBuffer;
@group(0) @binding(1) var<storage, read_write> inputAvgFlameBuffer : FlameBuffer;
@group(0) @binding(2) var<storage, read_write> outputFlameBuffer : FlameBuffer;
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read_write> maxHits : MaxHits;

fn input_color(x: u32, y: u32) -> vec4<u32> {
  let index = (x + y * u32(uniforms.screenWidth)) * 4u;
  let r = inputAvgFlameBuffer.values[index];
  let g = inputAvgFlameBuffer.values[index + 1u];
  let b = inputAvgFlameBuffer.values[index + 2u];
  let h = inputAvgFlameBuffer.values[index + 3u];
  return vec4<u32>(r, g, b, h);
}

fn output_color(x: u32, y: u32, color: vec4<u32>) {
  let index = (x + y * u32(uniforms.screenWidth)) * 4u;
  outputFlameBuffer.values[index] = color.r;
  outputFlameBuffer.values[index + 1u] = color.g;
  outputFlameBuffer.values[index + 2u] = color.b;
  outputFlameBuffer.values[index + 3u] = color.a;
}

@compute @workgroup_size(8, 8)
fn apply_filter(@builtin(global_invocation_id) id: vec3<u32>) {
  // let h = input_color(id.x, id.y).a;
  // let color = abs(
  //     1 * input_color(id.x - 1, id.y - 1)
  //   + 2 * input_color(id.x - 1, id.y + 0)
  //   + 1 * input_color(id.x - 1, id.y + 1)
  //   + 2 * input_color(id.x + 0, id.y - 1)
  //   + 4 * input_color(id.x + 0, id.y + 0)
  //   + 2 * input_color(id.x + 0, id.y + 1)
  //   + 1 * input_color(id.x + 1, id.y - 1)
  //   + 2 * input_color(id.x + 1, id.y + 0)
  //   + 1 * input_color(id.x + 1, id.y + 1)
  // ) / 16u;
  let color = input_color(id.x, id.y);
  output_color(id.x, id.y, color);
  atomicMax(&maxHits.value, color.a);
}

// @compute @workgroup_size(256)
// fn apply_filter(@builtin(global_invocation_id) global_id : vec3<u32>) {
// }
