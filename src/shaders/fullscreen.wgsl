// based on https://github.com/OmarShehata/webgpu-compute-rasterizer/blob/step-0/shaders/fullscreenQuad.wgsl
// Takes a buffer with color data for each pixel and "outputs" it to the screen.
// Uses hardcoded vertices to represent the entire screen and returns color info from the input color buffer in the fragment shader.

struct ColorData {
  data: array<u32>,
};

struct HitsBuffer {
  data: array<u32>,
};

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  scale: f32,
  random_seed: f32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> finalHitsBuffer : HitsBuffer;
@group(0) @binding(2) var<storage, read> finalColorBuffer : ColorData;

struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
  vec2<f32>(1.0, 1.0),
  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(-1.0, 1.0)
);

  var output: VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn frag_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
  let gamma = 2.2;
  let X = floor(coord.x);
  let Y = floor(coord.y);
  let index = u32(X + Y * uniforms.screenWidth);

  var hits = f32(finalHitsBuffer.data[index]);
  var alpha = log(hits) / hits;

  let R = f32(finalColorBuffer.data[index + 0u]) / 255.0 / hits;
  let G = f32(finalColorBuffer.data[index + 1u]) / 255.0 / hits;
  let B = f32(finalColorBuffer.data[index + 2u]) / 255.0 / hits;

  var finalColor = vec4<f32>(R * pow(R * alpha, 1.0 / gamma), G * pow(alpha, 1.0 / gamma), B * pow(alpha, 1.0 / gamma), alpha);

  return finalColor;
}
