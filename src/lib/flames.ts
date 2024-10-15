// based on https://github.com/OmarShehata/webgpu-compute-rasterizer
import flamesWGSL from '$shaders/flames.wgsl?raw';
import flameTemplateWGSL from '$shaders/flame_template.wgsl?raw';
import fullscreenWGSL from '$shaders/fullscreen.wgsl?raw';
import { toShader, Linear, Sinusoid, color, Horseshoe, Spherical, Handkerchief } from '$lib/math';
import { writable } from 'svelte/store';

const COLOR_CHANNELS = 3;

export const FPS = writable(0);

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
	const hitsBufferSize = Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight);
	const hitsBuffer = device.createBuffer({
		size: hitsBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const colorBufferSize =
		Uint32Array.BYTES_PER_ELEMENT * (presentationWidth * presentationHeight) * COLOR_CHANNELS;
	const colorBuffer = device.createBuffer({
		size: colorBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const uniformBufferSize = 8 * 4;
	const uniformBuffer = device.createBuffer({
		size: uniformBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	// for readin data from the gpu
	const stagingBuffer = device.createBuffer({
		size: hitsBufferSize,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
	});

	// set up bind groups for each pipeline
	const flamesBindGroupLayout = device.createBindGroupLayout({
		entries: [
			// hits buffer
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'storage'
				}
			},
			// color buffer
			{
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
				code: flameShader
			}),
			entryPoint: 'main'
		}
	});

	const clearPipeline = device.createComputePipeline({
		layout: device.createPipelineLayout({ bindGroupLayouts: [flamesBindGroupLayout] }),
		compute: {
			module: device.createShaderModule({
				code: flameShader
			}),
			entryPoint: 'clear'
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
				binding: 1, // the hits buffer
				visibility: GPUShaderStage.FRAGMENT,
				buffer: {
					type: 'read-only-storage'
				}
			},
			{
				binding: 2, // the color buffer
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
					buffer: hitsBuffer
				}
			},
			{
				binding: 2,
				resource: {
					buffer: colorBuffer
				}
			}
		]
	});

	let t0 = performance.now();

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
				new Float32Array([
					presentationWidth,
					presentationHeight,
					Math.random() * 1e9,
					camera.log_scale,
					camera.x_offset,
					camera.y_offset,
					resolution
				])
			);
			const timesToRun = Math.ceil((presentationWidth * presentationHeight) / 256);
			const passEncoder = commandEncoder.beginComputePass();
			// clear previous pixels
			passEncoder.setPipeline(clearPipeline);
			passEncoder.setBindGroup(0, flamesBindGroup);
			passEncoder.dispatchWorkgroups(timesToRun);
			// compute new pixels
			passEncoder.setPipeline(flamesPipeline);
			passEncoder.setBindGroup(0, flamesBindGroup);
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
