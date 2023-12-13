// populates a hits and color buffer with the desired pixel values

struct ColorBuffer {
  values: array<atomic<u32>>,
};

struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  random_seed: i32,
};

@group(0) @binding(0) var<storage, read_write> outputColorBuffer : ColorBuffer;
@group(0) @binding(1) var<uniform> uniforms : Uniforms;

var<private> random_state: u32;

// scuffed random number generator
fn random() -> f32 {
  let A: u32 = 1664525u;
  let C: u32 = 1013904223u;
  random_state = random_state * A + C;
  return f32(random_state) / f32(4294967295);
}

fn color_pixel(pos: vec2<f32>) {
  let X = floor(uniforms.screenWidth * pos.x);
  let Y = floor(uniforms.screenHeight * pos.y);
  let index = u32(X + Y * uniforms.screenWidth) * 3u;

  atomicStore(&outputColorBuffer.values[index + 0u], 0u);
  atomicStore(&outputColorBuffer.values[index + 1u], 0u);
  atomicStore(&outputColorBuffer.values[index + 2u], 0u);
}

fn sierpinski() {
  let PA = vec2(0.0, 0.0);
  let PB = vec2(0.0, 1.0);
  let PC = vec2(1.0, 0.0);

  var pos = vec2(random(), random());

  // ignore the first 20 iterations
  for (var i = 0; i < 20; i++) {
    let r: f32 = random();
    if (r < 0.3) {
      pos.x = (PA.x + pos.x) / 2.0;
      pos.y = (PA.y + pos.y) / 2.0;
    } else if (r < 0.6) {
      pos.x = (PB.x + pos.x) / 2.0;
      pos.y = (PB.y + pos.y) / 2.0;
    } else {
      pos.x = (PC.x + pos.x) / 2.0;
      pos.y = (PC.y + pos.y) / 2.0;
    }
  }

  for (var i = 0; i < 500; i++) {
    color_pixel(pos);
    let r: f32 = random();
    if (r < 0.3) {
      pos.x = (PA.x + pos.x) / 2.0;
      pos.y = (PA.y + pos.y) / 2.0;
    } else if (r < 0.6) {
      pos.x = (PB.x + pos.x) / 2.0;
      pos.y = (PB.y + pos.y) / 2.0;
    } else {
      pos.x = (PC.x + pos.x) / 2.0;
      pos.y = (PC.y + pos.y) / 2.0;
    }
  }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  random_state = u32(u32(uniforms.random_seed) + global_id.x);
  sierpinski();
  let index = global_id.x * 3u;

  // draw_line(vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0));
  // atomicStore(&outputColorBuffer.values[index + 0u], 0u);
  // atomicStore(&outputColorBuffer.values[index + 1u], 0u);
  // atomicStore(&outputColorBuffer.values[index + 2u], 0u);

}@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x * 3u;

  atomicStore(&outputColorBuffer.values[index + 0u], 0u);
  atomicStore(&outputColorBuffer.values[index + 1u], 255u);
  atomicStore(&outputColorBuffer.values[index + 2u], 255u);
}
