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

// other TODOs:
// - increase parallelism with even more buffers (if needed)

export interface Params {
  gpu: GPU;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  adapter: GPUAdapter;
  device: GPUDevice;
  presentationHeight: number;
  presentationWidth: number;
  superSamplingScale: number;
}

export function init(params: Params) {
  const { gpu, context, device, presentationWidth, presentationHeight, superSamplingScale } = params;

  const presentationFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'opaque',
  });

  // initialize buffers
  const hitsBufferSize = Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight * superSamplingScale * superSamplingScale);
  const hitsBuffer = device.createBuffer({
    size: hitsBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  const colorBufferSize = Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight * superSamplingScale * superSamplingScale) * COLOR_CHANNELS;
  const colorBuffer = device.createBuffer({
    size: colorBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  // screen width, screen height, supersampling scale, random seed
  const uniformBufferSize = 4 * 4;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // for readin data from the gpu
  const stagingBuffer = device.createBuffer({
    size: hitsBufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // set up bind groups for each pipeline
  const flamesBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // hits buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE, 
        buffer: {
          type: "storage"
        }
      },
      // color buffer
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE, 
        buffer: {
          type: "storage"
        }
      },
      // params (uniform)
      {
        binding: 2,
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
          buffer: hitsBuffer
        }
      },
      {
        binding: 1,
        resource: {
          buffer: colorBuffer
        }
      },
      {
        binding: 2, 
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
        binding: 1, // the hits buffer
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage"
        }
      },
      {
        binding: 2, // the color buffer
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
          buffer: hitsBuffer
        }
      },
      {
        binding: 2, 
        resource: {
          buffer: colorBuffer
        }
      }
    ],
  });

  async function frame() {
    const commandEncoder = device.createCommandEncoder();

    // flames pass
    {
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([presentationWidth, presentationHeight, superSamplingScale, Math.ceil(Math.random() * 1e12)]))
      const timesToRun = Math.ceil(presentationWidth * presentationHeight * superSamplingScale * superSamplingScale / 256)
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
    // map gpu memory to javascript (for debugging)
    {
      // commandEncoder.copyBufferToBuffer(hitsBuffer, 0, stagingBuffer, 0, hitsBufferSize);
    }

    device.queue.submit([commandEncoder.finish()])

    // await stagingBuffer.mapAsync(GPUMapMode.READ, 0, hitsBufferSize);
    // const stagingBufferCopy = stagingBuffer.getMappedRange(0, hitsBufferSize);
    // const data = stagingBufferCopy.slice(0);
    // stagingBuffer.unmap();
    // console.log(new Uint32Array(data));

    // requestAnimationFrame(frame);
  }
  return frame;
}
