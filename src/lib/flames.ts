// based on https://github.com/OmarShehata/webgpu-compute-rasterizer
import flamesWGSL from '$shaders/flames.wgsl?raw';
import flameTemplateWGSL from '$shaders/flame_template.wgsl?raw';
import fullscreenWGSL from '$shaders/fullscreen.wgsl?raw';
import filterWGSL from '$shaders/filter.wgsl?raw';
import averageWGSL from '$shaders/average.wgsl?raw';
import { toShader, Linear, Sinusoid, color, Horseshoe, Spherical, Handkerchief } from '$lib/math';
import { writable, get } from 'svelte/store';
import {
	ComputeBuffer,
	ComputePass,
	RenderPass,
	UNIFORM_KEYS,
	UniformBuffer,
  Uniforms,
} from '$lib/wgpu';

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
// TODO:
//  - density-aware filtering
//  - remove random branches using precomputed permutations
//  - try using textures instead of buffers??
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
				color: color(0, 255, 255)
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
				color: color(255, 0, 255)
			}
		])
	);

	// console.log(flameShader);

	// initialize buffers
	const flameBuffer = new ComputeBuffer([CHANNELS, presentationHeight, presentationWidth], device);
	const flameAvgBuffer = new ComputeBuffer(
		[CHANNELS, presentationHeight, presentationWidth],
		device
	);
	const flameOutputBuffer = new ComputeBuffer(
		[CHANNELS, presentationHeight, presentationWidth],
		device
	);
	const maxHitsBuffer = new ComputeBuffer([1], device);
	const uniformBuffer = new UniformBuffer(UNIFORM_KEYS.length, device);

  const resources = [
    flameBuffer,
    flameAvgBuffer,
    flameOutputBuffer,
    uniformBuffer,
    maxHitsBuffer,
  ]

	// for reading data from the gpu
	//const stagingBuffer = device.createBuffer({
	//	size: flameBufferSize,
	//	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
	//});
	//
	const flamePass = new ComputePass(flameShader, 'main', {
		x: Math.ceil(resolution / 8),
		y: Math.ceil(resolution / 8)
	});

	const clearPass = new ComputePass(averageWGSL, 'clear', {
		x: Math.ceil((presentationHeight * presentationWidth) / 256)
	});

	const avgPass = new ComputePass(averageWGSL, 'avg', {
		x: Math.ceil((presentationHeight * presentationWidth) / 256)
	});

	const filterPass = new ComputePass(filterWGSL, 'apply_filter', {
		x: Math.ceil(presentationWidth / 8),
		y: Math.ceil(presentationHeight / 8)
	});

	const fullscreenPass = new RenderPass(
		fullscreenWGSL,
		'vert_main',
		'frag_main',
		presentationFormat
	);

	let shouldClear = false;
	CLEAR.subscribe((value) => {
		shouldClear = value;
	});

	let t0 = performance.now();
	function frame() {
		const t1 = performance.now();
		FPS.set(Math.round(1000 / (t1 - t0)));
		t0 = t1;

		const commandEncoder = device.createCommandEncoder();

    // update uniforms
    uniformBuffer.write(
      new Uniforms(
        presentationWidth,
        presentationHeight,
        Math.random() * 1e9,
        camera.log_scale,
        camera.x_offset,
        camera.y_offset,
        resolution
      ),
      device,
    )

    if (shouldClear) {
      CLEAR.set(false);
      clearPass.encodePass(device, commandEncoder, resources)
    } else {
      avgPass.encodePass(device, commandEncoder, resources)
    }

    flamePass.encodePass(device, commandEncoder, resources)
    filterPass.encodePass(device, commandEncoder, resources)

    //// allows rendering directly to canvas context
    const textureView = context.getCurrentTexture().createView();
    fullscreenPass.encodePass(device, commandEncoder, textureView, resources);

		// map gpu memory to javascript (for debugging)
		// commandEncoder.copyBufferToBuffer(hitsBuffer, 0, stagingBuffer, 0, hitsBufferSize);

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
