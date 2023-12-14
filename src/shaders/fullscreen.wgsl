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
  let index = u32(X * uniforms.scale + Y * uniforms.scale * uniforms.screenWidth * uniforms.scale);

  var hits = 0.0;
  var r = 0.0;
  var g = 0.0;
  var b = 0.0;
  var maxhits = 0.0;
  // super sampling (not sure if is actually correct though lol)
  for (var i = 0u; i < u32(uniforms.scale); i++) {
    for (var j = 0u; j < u32(uniforms.scale); j++) {
      let actual_index = u32((X + f32(i)) * uniforms.scale + (Y + f32(j)) * uniforms.scale * uniforms.screenWidth * uniforms.scale);
      let hits_local = f32(finalHitsBuffer.data[actual_index]);
      hits = hits + hits_local;
      maxhits = max(maxhits, hits_local);

      r = r + f32(finalColorBuffer.data[actual_index + 0u]) / 255.0;
      g = g + f32(finalColorBuffer.data[actual_index + 1u]) / 255.0;
      b = b + f32(finalColorBuffer.data[actual_index + 2u]) / 255.0;
    }
  }
  // hits = hits / uniforms.scale / uniforms.scale;

  var alpha = log(hits) / maxhits;

  let R = r / hits;
  let G = g / hits;
  let B = b / hits;
  // let R = f32(finalColorBuffer.data[index + 0u]) / 255.0 / hits;
  // let G = f32(finalColorBuffer.data[index + 1u]) / 255.0 / hits;
  // let B = f32(finalColorBuffer.data[index + 2u]) / 255.0 / hits;

  var finalColor = vec4<f32>(R * pow(alpha, 1.0 / gamma), G * pow(alpha, 1.0 / gamma), B * pow(alpha, 1.0 / gamma), alpha);

  return finalColor;
}
