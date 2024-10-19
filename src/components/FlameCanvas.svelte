<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import { init, FPS, CLEAR, DEFAULT_CAMERA, initGPU } from '$lib/flames';
	import type { Camera } from '$lib/flames';
	import { toShader, Linear, Sinusoid, color } from '$lib/math';

	let canvas: HTMLCanvasElement;
	let context: GPUCanvasContext;

	let renderFrame = () => {};

	let camera: Camera = {
		log_scale: 0.0,
		x_offset: 0.0,
		y_offset: 0.0
	};

	let gpuEnabled = false;

	onMount(async () => {
		context = canvas.getContext('webgpu') as GPUCanvasContext;

		let result = await initGPU(canvas);

		if (!result.success) {
            canvas.width = 0;
            canvas.height = 0;
			return;
		}

		let { gpu, adapter, device } = result;
		gpuEnabled = true;

		const devicePixelRatio = window.devicePixelRatio || 1;
		// canvas.width = window.innerWidth;
		// canvas.height = window.innerHeight;
		canvas.width = 800;
		canvas.height = 800;
		//const presentationHeight = Math.floor(canvas.clientHeight * devicePixelRatio);
		//const presentationWidth = Math.floor(canvas.clientWidth * devicePixelRatio);
		const presentationHeight = 800
		const presentationWidth = 800
		const resolution = 250;
		// console.dir(adapter.limits)

		const frame = init({
			gpu,
			device,
			adapter,
			canvas,
			context,
			presentationWidth,
			presentationHeight,
			camera,
			resolution
		});

		requestAnimationFrame(frame);

		renderFrame = () => {
			console.log('re-rendering');
			requestAnimationFrame(frame);
		};
	});

	function onKeyDown(e: KeyboardEvent) {
		switch (e.keyCode) {
			// enter and space key
			case 13:
			case 32: {
				e.preventDefault();
				renderFrame();
				break;
			}
			case 37: {
				// left arrow
        CLEAR.set(true);
				camera.x_offset -= 0.01 * Math.pow(2, -camera.log_scale);
				e.preventDefault();
				break;
			}
			case 39: {
				// right arrow
        CLEAR.set(true);
				camera.x_offset += 0.01 * Math.pow(2, -camera.log_scale);
				e.preventDefault();
				break;
			}
			case 38: {
				// up arrow
        CLEAR.set(true);
				camera.y_offset -= 0.01 * Math.pow(2, -camera.log_scale);
				e.preventDefault();
				break;
			}
			case 40: {
				// down arrow
        CLEAR.set(true);
				camera.y_offset += 0.01 * Math.pow(2, -camera.log_scale);
				e.preventDefault();
				break;
			}
			case 187: {
				// plus key
        CLEAR.set(true);
				camera.log_scale += 0.05;
				e.preventDefault();
				break;
			}
			case 189: {
				// minus key
        CLEAR.set(true);
				camera.log_scale -= 0.05;
				e.preventDefault();
				break;
			}
		}
	}
</script>

<svelte:window on:keydown={onKeyDown} />

<div>
	<p id="fps">FPS: {$FPS}</p>
	<canvas bind:this={canvas} />
	{#if !gpuEnabled}
		<h1>GPU not enabled in this browser...</h1>
		<p>
			Note: WebGPU is currently only supported in Google Chrome, so if you're not seeing anything,
			that would probably be why. It should be coming to <a
				href="https://github.com/gpuweb/gpuweb/wiki/Implementation-Status">Firefox and Safari</a
			> soon, though!
		</p>
	{/if}
</div>

<style>
	/* i love css */
	canvas {
		image-rendering: optimizeSpeed; /* Older versions of FF          */
		image-rendering: -moz-crisp-edges; /* FF 6.0+                       */
		image-rendering: -webkit-optimize-contrast; /* Safari                        */
		image-rendering: -o-crisp-edges; /* OS X & Windows Opera (12.02+) */
		image-rendering: pixelated; /* Awesome future-browsers       */
		-ms-interpolation-mode: nearest-neighbor; /* IE                            */
	}

	#fps {
		padding: 1px;
		position: absolute;
		color: white;
		text-shadow:
			-1px -1px 0 #000,
			1px -1px 0 #000,
			-1px 1px 0 #000,
			1px 1px 0 #000;
	}

	p {
		margin: 0px;
	}
</style>
