struct FlameBuffer {
  values: array<u32>,
};

struct AvgFlameBuffer {
  values: array<f32>,
};

struct MaxHits {
  value: u32,
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
@group(0) @binding(1) var<storage, read_write> outputAvgFlameBuffer : AvgFlameBuffer;
@group(0) @binding(2) var<storage, read_write> outputOutputFlameBuffer : AvgFlameBuffer;
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read_write> maxHits : MaxHits;

@compute @workgroup_size(256)
fn avg(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x * 4u;
  let N = 15.0;

  let R1 = f32(outputFlameBuffer.values[index + 0u]) / 255.0;
  let G1 = f32(outputFlameBuffer.values[index + 1u]) / 255.0;
  let B1 = f32(outputFlameBuffer.values[index + 2u]) / 255.0;
  let H1 = f32(outputFlameBuffer.values[index + 3u]);
  let R2 = outputAvgFlameBuffer.values[index + 0u];
  let G2 = outputAvgFlameBuffer.values[index + 1u];
  let B2 = outputAvgFlameBuffer.values[index + 2u];
  let H2 = outputAvgFlameBuffer.values[index + 3u];
  outputAvgFlameBuffer.values[index + 0u] = R2 - R2/N + R1/N;
  outputAvgFlameBuffer.values[index + 1u] = G2 - G2/N + G1/N;
  outputAvgFlameBuffer.values[index + 2u] = B2 - B2/N + B1/N;
  outputAvgFlameBuffer.values[index + 3u] = H2 - H2/N + H1/N;

  outputFlameBuffer.values[index + 0u] = 0u;
  outputFlameBuffer.values[index + 1u] = 0u;
  outputFlameBuffer.values[index + 2u] = 0u;
  outputFlameBuffer.values[index + 3u] = 0u;
}

@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x * 4u;

  outputFlameBuffer.values[index + 0u] = 0u;
  outputFlameBuffer.values[index + 1u] = 0u;
  outputFlameBuffer.values[index + 2u] = 0u;
  outputFlameBuffer.values[index + 3u] = 0u;
  //
  let R2 = outputAvgFlameBuffer.values[index + 0u];
  let G2 = outputAvgFlameBuffer.values[index + 1u];
  let B2 = outputAvgFlameBuffer.values[index + 2u];
  let H2 = outputAvgFlameBuffer.values[index + 3u];
  outputAvgFlameBuffer.values[index + 0u] = R2 / 2.0;
  outputAvgFlameBuffer.values[index + 1u] = G2 / 2.0;
  outputAvgFlameBuffer.values[index + 2u] = B2 / 2.0;
  outputAvgFlameBuffer.values[index + 3u] = H2 / 2.0;
  // outputAvgFlameBuffer.values[index + 0u] = 0.0;
  // outputAvgFlameBuffer.values[index + 1u] = 0.0;
  // outputAvgFlameBuffer.values[index + 2u] = 0.0;
  // outputAvgFlameBuffer.values[index + 3u] = 0.0;

  maxHits.value = 0u;
}
