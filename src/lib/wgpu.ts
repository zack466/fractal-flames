export class Uniforms {
	constructor(
		public presentationWidth: number = 0,
		public presentationHeight: number = 0,
		public rng: number = 0,
		public log_scale: number = 0,
		public x_offset: number = 0,
		public y_offset: number = 0,
		public resolution: number = 0
	) {}

	toBytes() {
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

export const UNIFORM_KEYS = Object.keys(new Uniforms());

export interface Buffer {
	buffer: GPUBuffer;
  type: GPUBufferBindingType;
}

export class ComputeBuffer implements Buffer {
	buffer: GPUBuffer;
	dims: number[];
	bufferSize: number;
  type: GPUBufferBindingType;

	constructor(dims: number[], device: GPUDevice) {
		this.dims = dims;
		this.bufferSize = Uint32Array.BYTES_PER_ELEMENT * this.dims.reduce((a, b) => a * b, 1);
		this.buffer = device.createBuffer({
			size: this.bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
    this.type = "storage"
	}
}

export class UniformBuffer implements Buffer {
	buffer: GPUBuffer;
	bufferSize: number;
  type: GPUBufferBindingType;

	constructor(num_params: number, device: GPUDevice) {
		this.bufferSize = num_params * 4;
		this.buffer = device.createBuffer({
			size: this.bufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
    this.type = "uniform"
	}

  write(uniforms: Uniforms, device: GPUDevice) {
    device.queue.writeBuffer(
      this.buffer,
      0,
      uniforms.toBytes()
    )
  }
}

export type Workgroups = {
	x: number;
	y?: number;
	z?: number;
};

export class ComputePass {
	code: string;
	entrypoint: string;
	workgroups: Workgroups;

	constructor(code: string, entrypoint: string, workgroups: Workgroups) {
		this.code = code;
		this.entrypoint = entrypoint;
		this.workgroups = workgroups;
	}

	encodePass(device: GPUDevice, commandEncoder: GPUCommandEncoder, resources: Buffer[]) {
    const passEncoder = commandEncoder.beginComputePass();
    const layout = device.createBindGroupLayout({
			entries: resources.map((buffer, i) => {
				return {
					binding: i,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: buffer.type
          }
				};
			})
    })

		const pipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
			compute: {
				module: device.createShaderModule({
					code: this.code
				}),
				entryPoint: this.entrypoint
			}
		});
		const bindGroup = device.createBindGroup({
			layout: layout,
			entries: resources.map((buffer, i) => {
				return {
					binding: i,
					resource: { buffer: buffer.buffer }
				};
			})
		});
		passEncoder.setPipeline(pipeline);
		passEncoder.setBindGroup(0, bindGroup);
		passEncoder.dispatchWorkgroups(this.workgroups.x, this.workgroups.y, this.workgroups.z);
    passEncoder.end();
	}
}

export class RenderPass {
	code: string;
	vertex_entrypoint: string;
	fragment_entrypoint: string;
  presentationFormat: GPUTextureFormat;

  // get presentationFormat with gpu.getPreferredCanvasFormat();
	constructor(code: string, vertex_entrypoint: string, fragment_entrypoint: string, presentationFormat: GPUTextureFormat) {
		this.code = code;
		this.vertex_entrypoint = vertex_entrypoint;
		this.fragment_entrypoint = fragment_entrypoint;
    this.presentationFormat = presentationFormat;
	}

  // Can write directly to a canvas if you do:
  // const textureView = context.getCurrentTexture().createView();
	encodePass(device: GPUDevice, commandEncoder: GPUCommandEncoder, textureView: GPUTextureView, resources: Buffer[]) {
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
    const layout = device.createBindGroupLayout({
			entries: resources.map((buffer, i) => {
				return {
					binding: i,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: buffer.type === "storage" ? "read-only-storage" : buffer.type
          }
				};
			})
    })
    const pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module: device.createShaderModule({
          code: this.code
        }),
        entryPoint: this.vertex_entrypoint
      },
      fragment: {
        module: device.createShaderModule({
          code: this.code
        }),
        entryPoint: this.fragment_entrypoint,
        targets: [
          {
            format: this.presentationFormat
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });
		const bindGroup = device.createBindGroup({
			layout: layout,
			entries: resources.map((buffer, i) => {
				return {
					binding: i,
					resource: { buffer: buffer.buffer }
				};
			})
		});
		passEncoder.setPipeline(pipeline);
		passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
  }
}
