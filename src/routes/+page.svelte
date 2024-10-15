<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import FlameCanvas from '$components/FlameCanvas.svelte';
</script>

<div id="main">
	<FlameCanvas />
	<div>
		<h1>What am I looking at?</h1>
		<p>
			This is a super basic and incomplete implementation of <a
				href="https://flam3.com/flame_draves.pdf">fractal flames</a
			> using WebGPU.
		</p>
		<p>I'm planning to add more stuff, but for now, just enjoy the cool imagery.</p>
		<p>
			The code is located in <a href="https://github.com/zack466/fractal-flames">this</a> Github repository.
		</p>

		<h2>Controls</h2>
		<p>Generate a new random fractal flame by reloading (I would recommend doing this a lot).</p>
		<p>Arrow keys: move the camera left/right/up/down.</p>
		<p>Plus/minus: zoom in and out</p>
	</div>
</div>

<style>
	#main {
		display: flex;
		flex-direction: row;
		gap: 1em;
	}

	p {
		margin: 0px;
	}
</style>
