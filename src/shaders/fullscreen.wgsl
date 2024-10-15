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
  random_seed: f32,
  cam_scale: f32,
  cam_x: f32,
  cam_y: f32,
  resolution: f32,
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
    let index = u32(X + Y * uniforms.screenWidth);

    var max_hits = 100000.0;
    // for (var i = 0u; i < u32(uniforms.screenWidth); i++) {
    //     for (var j = 0u; j < u32(uniforms.screenHeight); j++) {
    //       max_hits = max(max_hits, f32(finalHitsBuffer.data[ i + j * u32(uniforms.screenWidth) ]));
    //     }
    // }

    var hits = f32(finalHitsBuffer.data[index]);
    var alpha = log(hits) / log(max_hits);

    let R = (f32(finalColorBuffer.data[index + 0u]) / 255.0) / hits;
    let G = (f32(finalColorBuffer.data[index + 1u]) / 255.0) / hits;
    let B = (f32(finalColorBuffer.data[index + 2u]) / 255.0) / hits;

    var finalColor = vec4<f32>(
        R * pow(alpha, 1.0 / gamma),
        G * pow(alpha, 1.0 / gamma),
        B * pow(alpha, 1.0 / gamma),
        1.0,
    );

    return finalColor;
}
