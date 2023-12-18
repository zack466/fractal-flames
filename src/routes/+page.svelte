<script lang="ts">
  import { onMount, onDestroy, setContext } from 'svelte';
  import { init, FPS, DEFAULT_CAMERA } from '$lib/flames';
  import type { Camera } from '$lib/flames';
  import { toShader, Linear, Sinusoid, color } from '$lib/math'

  let canvas: HTMLCanvasElement;
  let context: GPUCanvasContext;

  let renderFrame = () => {};

  let camera: Camera = {
    log_scale: 0.0,
    x_offset: 0.0,
    y_offset: 0.0,
  }

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

    const devicePixelRatio = window.devicePixelRatio || 1;
    // canvas.width = window.innerWidth;
    // canvas.height = window.innerHeight;
    canvas.width = 800;
    canvas.height = 800;
    const presentationHeight = Math.floor(canvas.clientHeight * devicePixelRatio);
    const presentationWidth = Math.floor(canvas.clientWidth * devicePixelRatio);
    // console.dir(adapter.limits)

    const frame = init({ gpu, device, adapter, canvas, context, presentationWidth, presentationHeight, camera });

    requestAnimationFrame(frame);

    renderFrame = () => {console.log("re-rendering"); requestAnimationFrame(frame)};
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
        camera.x_offset -= 0.01 * Math.pow(2, -camera.log_scale);
        e.preventDefault();
        break;
      }
      case 39: {
        // right arrow
        camera.x_offset += 0.01 * Math.pow(2, -camera.log_scale);;
        e.preventDefault();
        break;
      }
      case 38: {
        // up arrow
        camera.y_offset -= 0.01 * Math.pow(2, -camera.log_scale);;
        e.preventDefault();
        break;
      }
      case 40: {
        // down arrow
        camera.y_offset += 0.01 * Math.pow(2, -camera.log_scale);;
        e.preventDefault();
        break;
      }
      case 187: {
        // plus key
        camera.log_scale += 0.05;
        e.preventDefault();
        break;
      }
      case 189: {
        // minus key
        camera.log_scale -= 0.05;
        e.preventDefault();
        break;
      }
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />
<canvas bind:this={canvas} />

<p>{$FPS}</p>

<style>
/* i love css */
canvas {
  image-rendering: optimizeSpeed;             /* Older versions of FF          */
  image-rendering: -moz-crisp-edges;          /* FF 6.0+                       */
  image-rendering: -webkit-optimize-contrast; /* Safari                        */
  image-rendering: -o-crisp-edges;            /* OS X & Windows Opera (12.02+) */
  image-rendering: pixelated;                 /* Awesome future-browsers       */
  -ms-interpolation-mode: nearest-neighbor;   /* IE                            */
}
</style>
