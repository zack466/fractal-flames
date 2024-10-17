// based on https://github.com/OmarShehata/webgpu-compute-rasterizer
import flamesWGSL from '$shaders/flames.wgsl?raw';
import flameTemplateWGSL from '$shaders/flame_template.wgsl?raw';
import fullscreenWGSL from '$shaders/fullscreen.wgsl?raw';
import { toShader, Linear, Sinusoid, color, Horseshoe, Spherical, Handkerchief } from '$lib/math';
import { writable, get } from 'svelte/store';

const CHANNELS = 4;

export const FPS = writable(0);
export const CLEAR = writable(false);

export interface Camera {
	log_scale: number;
	x_offset: number;
	y_offset: number;
}

export const DEFAULT_CAMERA = {
	log_scale: 0,
	x_offset: 0,
	y_offset: 0
};

class Uniforms {
	constructor(
		public presentationWidth: number = 0,
		public presentationHeight: number = 0,
		public rng: number = 0,
		public log_scale: number = 0,
		public x_offset: number = 0,
		public y_offset: number = 0,
		public resolution: number = 0
	) {}

	toBuffer() {
		return new Float32Array([
			this.presentationWidth,
			this.presentationHeight,
			this.rng,
			this.log_scale,
			this.x_offset,
			this.y_offset,
			this.resolution
		]);
	}
}

const uniform_keys = Object.keys(new Uniforms());

// Data:
// flameBuffer - u32, Height x Width x 4  // RGBA
//
// flameAvgBuffer - f32, Height x Width x 4  // RGBA
//
// parameterBuffer (uniform) - f32

// 0. compile shaders with function variations and parameters

// compute shader:
// 1. run flames simulation, update flameBuffer
//  - addAtomic to update color/hits
//
// 2. average flameBuffer in flameAvgBuffer

// draw fractal to screen
// 3. apply log-density, coloring, gamma, etc
// 4. (optional) filtering, motion blur, etc
// 5. use hardcoded vertices to draw pixels to screen (fullscreen shader)

// other things to try:
// - separate variations into their own buffers
// - compress/decompress coordinates using something like rsqrt, atan
// - store colors/densities in log space instead of linear
// - maybe instead of picking a few random points, pick many starting points but run less iterations
//   - e.g. sample 1000x1000 equally spaced points from unit grid, run 100 iterations each
// - make RNG more advanced (maybe not necessary? seems good enough)
//
export async function initGPU() {
	const gpu = navigator.gpu;
	if (!gpu) {
		console.warn('WebGPU not enabled.');
		return { success: false };
	}

	const adapter = await gpu.requestAdapter();
	if (!adapter) {
		console.warn('WebGPU adapter not found.');
		return { success: false };
	}

	const device = await adapter.requestDevice();
	if (!device) {
		console.warn('WebGPU device not found.');
		return { success: false };
	}

	return { success: true, gpu, adapter, device };
}

export interface Params {
	gpu: GPU;
	canvas: HTMLCanvasElement;
	context: GPUCanvasContext;
	adapter: GPUAdapter;
	device: GPUDevice;
	presentationHeight: number;
	presentationWidth: number;
	camera: Camera;
	resolution: number;
}

export function init(params: Params) {
	const { gpu, context, device, presentationWidth, presentationHeight, camera, resolution } =
		params;

	const presentationFormat = gpu.getPreferredCanvasFormat();
	context.configure({
		device,
		format: presentationFormat,
		alphaMode: 'opaque'
	});

	// generate flame shader
	const flameShader = flameTemplateWGSL.replace(
		'// INSERT FLAME HERE',
		toShader([
			{
				params: [
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1
				],
				weight: 5,
				name: 'f1',
				variation: Horseshoe,
				color: color(255, 0, 0)
			},
			{
				params: [
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1
				],
				weight: 1,
				name: 'f2',
				variation: Handkerchief,
				color: color(0, 255, 0)
			}
		])
	);

	// console.log(flameShader);

	// initialize buffers

	const flameBufferSize =
		Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight) * CHANNELS;
	const flameBuffer = device.createBuffer({
		size: flameBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});
	const flameAvgBuffer = device.createBuffer({
		size: flameBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const maxHitsBuffer = device.createBuffer({
		size: Uint32Array.BYTES_PER_ELEMENT * 1,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const uniformBufferSize = uniform_keys.length * 4;
	const uniformBuffer = device.createBuffer({
		size: uniformBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	// for reading data from the gpu
	const stagingBuffer = device.createBuffer({
		size: flameBufferSize,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
	});

	// set up bind groups for each pipeline
	const flameBindGroupLayout = device.createBindGroupLayout({
		entries: [
			// flame buffer
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'storage'
				}
			},
			{
				// flame avg buffer
				binding: 1,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'storage'
				}
			},
			// params (uniform)
			{
				binding: 2,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'uniform'
				}
			},
			{
				binding: 3,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'storage'
				}
			}
		]
	});

	const flameBindGroup = device.createBindGroup({
		layout: flameBindGroupLayout,
		entries: [
			{
				binding: 0,
				resource: {
					buffer: flameBuffer
				}
			},
			{
				binding: 1,
				resource: {
					buffer: flameAvgBuffer
				}
			},
			{
				binding: 2,
				resource: {
					buffer: uniformBuffer
				}
			},
			{
				binding: 3,
				resource: {
					buffer: maxHitsBuffer
				}
			}
		]
	});

	const flamePipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [flameBindGroupLayout] }),
		compute: {
			module: device.createShaderModule({
				code: flameShader
			}),
			entryPoint: 'main'
		}
	});

	const clearPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [flameBindGroupLayout] }),
		compute: {
			module: device.createShaderModule({
				code: flameShader
			}),
			entryPoint: 'clear'
		}
	});

	const avgPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [flameBindGroupLayout] }),
		compute: {
			module: device.createShaderModule({
				code: flameShader
			}),
			entryPoint: 'avg'
		}
	});

	const fullscreenBindGroupLayout = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.FRAGMENT,
				buffer: {
					type: 'uniform'
				}
			},
			{
				binding: 1, // flame buffer
				visibility: GPUShaderStage.FRAGMENT,
				buffer: {
					type: 'read-only-storage'
				}
			},
			{
				binding: 2, // max hits
				visibility: GPUShaderStage.FRAGMENT,
				buffer: {
					type: 'read-only-storage'
				}
			}
		]
	});

	const fullscreenPipeline = device.createRenderPipeline({
		layout: device.createPipelineLayout({
			bindGroupLayouts: [fullscreenBindGroupLayout]
		}),
		vertex: {
			module: device.createShaderModule({
				code: fullscreenWGSL
			}),
			entryPoint: 'vert_main'
		},
		fragment: {
			module: device.createShaderModule({
				code: fullscreenWGSL
			}),
			entryPoint: 'frag_main',
			targets: [
				{
					format: presentationFormat
				}
			]
		},
		primitive: {
			topology: 'triangle-list'
		}
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
					buffer: flameBuffer
				}
			},
			{
				binding: 2,
				resource: {
					buffer: maxHitsBuffer
				}
			}
		]
	});

	let t0 = performance.now();

  let shouldClear = false;
  CLEAR.subscribe((value) => {
    shouldClear = value;
  });

	async function frame() {
		let t1 = performance.now();
		FPS.set(Math.round(1000 / (t1 - t0)));
		t0 = t1;

		const commandEncoder = device.createCommandEncoder();

		// flames pass
		{
			device.queue.writeBuffer(
				uniformBuffer,
				0,
				new Uniforms(
					presentationWidth,
					presentationHeight,
					Math.random() * 1e9,
					camera.log_scale,
					camera.x_offset,
					camera.y_offset,
					resolution
				).toBuffer()
			);
			const passEncoder = commandEncoder.beginComputePass();

			// clear or average previous pixels
			if (shouldClear) {
        CLEAR.set(false);
				passEncoder.setPipeline(clearPipeline);
			} else {
				passEncoder.setPipeline(avgPipeline);
			}
			passEncoder.setBindGroup(0, flameBindGroup);
			const timesToRun = Math.ceil((presentationWidth * presentationHeight) / 256);
			passEncoder.dispatchWorkgroups(timesToRun);

			// compute new pixels
			passEncoder.setPipeline(flamePipeline);
			passEncoder.setBindGroup(0, flameBindGroup);
			passEncoder.dispatchWorkgroups(Math.ceil(resolution / 8), Math.ceil(resolution / 8));
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
						storeOp: 'store'
					}
				]
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

		device.queue.submit([commandEncoder.finish()]);

		// await stagingBuffer.mapAsync(GPUMapMode.READ, 0, hitsBufferSize);
		// const stagingBufferCopy = stagingBuffer.getMappedRange(0, hitsBufferSize);
		// const data = stagingBufferCopy.slice(0);
		// stagingBuffer.unmap();
		// console.log(new Uint32Array(data));

		requestAnimationFrame(frame);
	}
	return frame;
}
