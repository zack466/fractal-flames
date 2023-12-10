<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';

	import shaderString from '$lib/shader.glsl?raw';

	let canvas: HTMLCanvasElement;
	let context: GPUCanvasContext;

	onMount(async () => {
		context = canvas.getContext('webgpu') as GPUCanvasContext;

		const gpu = navigator.gpu;
		if (!gpu) {
			console.warn('WebGPU not enabled.');
			return;
		}

		const adapter = await gpu.requestAdapter();
		if (!adapter) {
			console.warn('WebGPU adapter not found.');
			return;
		}

		const device = await adapter.requestDevice();
		if (!device) {
			console.warn('WebGPU device not found.');
			return;
		}

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

		const devicePixelRatio = window.devicePixelRatio || 1;
    const presentationHeight = 300;
    const presentationWidth = 300;
		canvas.width = presentationWidth * devicePixelRatio;
		canvas.height = presentationHeight * devicePixelRatio;
		const presentationFormat = gpu.getPreferredCanvasFormat();

		context.configure({
			device,
			format: presentationFormat,
			alphaMode: 'opaque',
		});

		const pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module: device.createShaderModule({
					code: shaderString
				}),
				entryPoint: 'vertex_main'
			},
			fragment: {
				module: device.createShaderModule({
					code: shaderString
				}),
				entryPoint: 'fragment_main',
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

    function frame() {
      const commandEncoder = device.createCommandEncoder();
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
      passEncoder.setPipeline(pipeline);
      passEncoder.draw(3);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>

<canvas bind:this={canvas} />
