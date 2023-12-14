<script lang="ts">
  import { onMount, onDestroy, setContext } from 'svelte';
  import { init } from '$lib/flames'

  let canvas: HTMLCanvasElement;
  let context: GPUCanvasContext;

  let renderFrame = () => {};

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
    const superSamplingScale = 1;
    console.dir(adapter.limits)

    const frame = init({ gpu, device, adapter, canvas, context, presentationWidth, presentationHeight, superSamplingScale });

    requestAnimationFrame(frame);

    renderFrame = () => requestAnimationFrame(frame);
  });

  function onKeyDown(e: KeyboardEvent) {
    // enter & space key
    if (e.keyCode === 13 || e.keyCode === 32) {
      e.preventDefault();
      renderFrame();
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />
<canvas bind:this={canvas} />

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
