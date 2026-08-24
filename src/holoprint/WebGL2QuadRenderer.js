// Disclaimer: This is mostly AI-generated, I did not have the willpower to go through tutorial hell again
// I have some experience with WebGL beforehand but writing it is never fun

import { getOffscreenCanvasContext } from "../utils.js";
import { vertexShaderSource, fragmentShaderSource } from "./WebGL2QuadRendererShaders.js";

/** A lightweight WebGL 2 utility to render arbitrary quads directly to an `ImageBitmap`. */
export default class WebGL2QuadRenderer {
	
	/** @readonly */
	size;
	/** @readonly */
	#gl;
	/** @readonly */
	#program;
	/** @readonly */
	#glTexture;
	/** @readonly */
	#positionBuffer;
	/** @readonly */
	#uvBuffer;
	/** @readonly */
	#indexBuffer;
	/** @readonly */
	#posLoc;
	/** @readonly */
	#uvLoc;
	
	/** @returns {boolean} */
	static isSupported() {
		return typeof WebGL2RenderingContext != "undefined";
	}
	
	/**
	 * @param {number} size Resolution of the output canvas (width and height)
	 * @param {HTMLImageElement} textureImage Source image for the texture
	 */
	constructor(size, textureImage) {
		this.size = size;
		
		let canvas = new OffscreenCanvas(size, size);
		let gl = getOffscreenCanvasContext(canvas, "webgl2", { 
			preserveDrawingBuffer: true,
			antialias: false 
		});
		if(!gl) {
			throw new Error("WebGL 2 not supported.");
		}
		this.#gl = gl;
		
		let vertexShader = this.#createShader(gl.VERTEX_SHADER, vertexShaderSource);
		let fragmentShader = this.#createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
		
		this.#program = gl.createProgram();
		gl.attachShader(this.#program, vertexShader);
		gl.attachShader(this.#program, fragmentShader);
		gl.linkProgram(this.#program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		if(!gl.getProgramParameter(this.#program, gl.LINK_STATUS)) {
			let errorInfo = this.#gl.getProgramInfoLog(this.#program);
			gl.deleteProgram(this.#program);
			throw new Error(`Failed to link program: ${errorInfo}`);
		}
		
		this.#posLoc = gl.getAttribLocation(this.#program, "a_position");
		this.#uvLoc = gl.getAttribLocation(this.#program, "a_uv");
		
		this.#positionBuffer = gl.createBuffer();
		this.#uvBuffer = gl.createBuffer();
		this.#indexBuffer = gl.createBuffer();
		
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		
		this.#glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.#glTexture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	}
	
	/**
	 * @param {{ positions: F32Vec8, uvs: F32Vec8 }[]} quads
	 * @returns {ImageBitmap}
	 */
	render(quads) {
		let gl = this.#gl;
		
		gl.viewport(0, 0, this.size, this.size);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.#program);
		
		let quadCount = quads.length;
		let positions = new Float32Array(quadCount * 8);
		let uvs = new Float32Array(quadCount * 8);
		let indices = new Uint16Array(quadCount * 6);
		quads.forEach(({ positions: quadPositions, uvs: quadUvs }, i) => {
			positions.set(quadPositions, i * 8);
			uvs.set(quadUvs, i * 8);
			let vertexOffset = i * 4;
			let indexOffset = i * 6;
			indices[indexOffset] = vertexOffset;
			indices[indexOffset + 1] = vertexOffset + 1;
			indices[indexOffset + 2] = vertexOffset + 2;
			indices[indexOffset + 3] = vertexOffset;
			indices[indexOffset + 4] = vertexOffset + 2;
			indices[indexOffset + 5] = vertexOffset + 3;
		});
		
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
		gl.enableVertexAttribArray(this.#posLoc);
		gl.vertexAttribPointer(this.#posLoc, 2, gl.FLOAT, false, 0, 0);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#uvBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STREAM_DRAW);
		gl.enableVertexAttribArray(this.#uvLoc);
		gl.vertexAttribPointer(this.#uvLoc, 2, gl.FLOAT, false, 0, 0);
		
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);
		
		gl.drawElements(gl.TRIANGLES, quadCount * 6, gl.UNSIGNED_SHORT, 0);
		
		return gl.canvas.transferToImageBitmap();
	}
	
	dispose() {
		this.#gl.deleteBuffer(this.#positionBuffer);
		this.#gl.deleteBuffer(this.#uvBuffer);
		this.#gl.deleteBuffer(this.#indexBuffer);
		this.#gl.deleteTexture(this.#glTexture);
		this.#gl.deleteProgram(this.#program);
	}
	
	/**
	 * @param {WebGLRenderingContext["VERTEX_SHADER"] | WebGLRenderingContext["FRAGMENT_SHADER"]} type
	 * @param {string} source
	 * @returns {WebGLShader}
	 */
	#createShader(type, source) {
		let shader = this.#gl.createShader(type);
		this.#gl.shaderSource(shader, source);
		this.#gl.compileShader(shader);
		if(!this.#gl.getShaderParameter(shader, this.#gl.COMPILE_STATUS)) {
			let errorInfo = this.#gl.getShaderInfoLog(shader);
			this.#gl.deleteShader(shader);
			console.error(errorInfo, source);
			throw new Error(`Failed to create shader ${type}: ${errorInfo}`);
		}
		return shader;
	};
}

/** @import { F32Vec8 } from "./types.js" */
