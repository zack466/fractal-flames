// based on https://github.com/OmarShehata/webgpu-compute-rasterizer
import flamesWGSL from '$shaders/flames.wgsl?raw';
import fullscreenWGSL from '$shaders/fullscreen.wgsl?raw';

const COLOR_CHANNELS = 3;

// Data:
// hitsStorageBuffer - u32, Height x Width x 1
// colorStorageBuffer - f32, Height x Width x 3
// parameterBuffer (uniform) - f32

// 0. compile shaders with function variations and parameters

// compute shader:
// 1. run many fractal flames in parallel
//  - addAtomic to update hits
//  - addAtomic to update colors (average)

// draw fractal to screen
// 2. apply log-density, coloring, gamma, etc
// 3. (optional) filtering, motion blur, etc
// 4. use hardcoded vertices to draw pixels to screen

export interface Params {
  gpu: GPU;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  adapter: GPUAdapter;
  device: GPUDevice;
  presentationHeight: number;
  presentationWidth: number;
}

export function init(params: Params) {
  const { gpu, context, device, presentationWidth, presentationHeight } = params;

  const presentationFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  });

  // initialize buffers
  const colorBufferSize = Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight) * COLOR_CHANNELS;
  const colorBuffer = device.createBuffer({
    size: colorBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  // screen width, screen height, random seed
  const uniformBufferSize = 4 * 4;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const flamesBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE, 
        buffer: {
          type: "storage"
        }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      }
    ]
  });

  const flamesBindGroup = device.createBindGroup({
    layout: flamesBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: colorBuffer
        }
      },
      {
        binding: 1, 
        resource: {
          buffer: uniformBuffer
        }
      }
    ]
  });

  const flamesPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [flamesBindGroupLayout] }),
    compute: {
      module: device.createShaderModule({
        code: flamesWGSL,
      }),
      entryPoint: "main"
    }
  });

  const clearPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [flamesBindGroupLayout] }),
    compute: {
      module: device.createShaderModule({
        code: flamesWGSL,
      }),
      entryPoint: "clear"
    }
  });

  const fullscreenBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform"
        }
      }, 
      {
        binding: 1, // the color buffer
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage"
        }
      }
    ]
  });

  const fullscreenPipeline = device.createRenderPipeline({
    layout:  device.createPipelineLayout({
        bindGroupLayouts: [fullscreenBindGroupLayout]
      }),
    vertex: {
      module: device.createShaderModule({
        code: fullscreenWGSL,
      }),
      entryPoint: 'vert_main',
    },
    fragment: {
      module: device.createShaderModule({
        code: fullscreenWGSL,
      }),
      entryPoint: 'frag_main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const fullscreenBindGroup = device.createBindGroup({
    layout: fullscreenBindGroupLayout,
    entries: [
      {
        binding: 0, 
        resource: {
          buffer: uniformBuffer
        }
      },
      {
        binding: 1, 
        resource: {
          buffer: colorBuffer
        }
      }
    ],
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    // flames pass
    {
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([presentationWidth, presentationHeight, Math.ceil(Math.random() * 1e12)]))
      const timesToRun = Math.ceil(presentationWidth * presentationHeight / 256)
      const passEncoder = commandEncoder.beginComputePass();
      // clear previous pixels
      passEncoder.setPipeline(clearPipeline);
      passEncoder.setBindGroup(0, flamesBindGroup);
      passEncoder.dispatchWorkgroups(timesToRun);
      // compute new pixels
      passEncoder.setPipeline(flamesPipeline);
      passEncoder.setBindGroup(0, flamesBindGroup);
      passEncoder.dispatchWorkgroups(64);
      passEncoder.end();
    }
    // fullscreen pass
    {
      // allows rendering directly to canvas context
      const textureView = context.getCurrentTexture().createView();
      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(fullscreenPipeline);
      passEncoder.setBindGroup(0, fullscreenBindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
    }

    device.queue.submit([commandEncoder.finish()])

    // requestAnimationFrame(frame);
  }
  return frame;
}
