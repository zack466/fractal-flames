// based on https://github.com/OmarShehata/webgpu-compute-rasterizer/blob/step-0/shaders/fullscreenQuad.wgsl
// Takes a buffer with color data for each pixel and "outputs" it to the screen.
// Uses hardcoded vertices to represent the entire screen and returns color info from the input color buffer in the fragment shader.

struct FlameBuffer {
  values: array<u32>,
};

struct AvgFlameBuffer {
  values: array<f32>,
};

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  random_seed: f32,
  cam_scale: f32,
  cam_x: f32,
  cam_y: f32,
  resolution: f32,
};

struct MaxHits {
  value: u32,
}
@group(0) @binding(0) var<storage, read> inputFlameBuffer : FlameBuffer;
@group(0) @binding(1) var<storage, read> inputAvgFlameBuffer : AvgFlameBuffer;
@group(0) @binding(2) var<storage, read> flameBuffer : AvgFlameBuffer;
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read> maxHits : MaxHits;

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

fn inv_rsqrt(x: f32) -> f32 {
    let p = 2.0 * x - 1.0;
    return p / (1.0 - p * p);
}

fn clamp(x: f32, low: f32, high: f32) -> f32 {
    if x < low {
        return low;
    } else if x > high {
        return high;
    } else {
        return x;
    }
}

@fragment
fn frag_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
    let gamma = 2.2;
    let X = floor(coord.x);
    let Y = floor(coord.y);
    let index = u32(X + Y * uniforms.screenWidth) * 4u;

    // var max_hits = f32(maxHits.value);
    let max_hits = 100.0;

    let hits = flameBuffer.values[index + 3u];
    var alpha = max(0.0, log(hits) / log(max_hits));

    let R = flameBuffer.values[index + 0u] / hits;
    let G = flameBuffer.values[index + 1u] / hits;
    let B = flameBuffer.values[index + 2u] / hits;

    var finalColor = vec4<f32>(
        R * pow(alpha, 1.0 / gamma),
        G * pow(alpha, 1.0 / gamma),
        B * pow(alpha, 1.0 / gamma),
        1.0,
    );

    return finalColor;
}
