"use strict";

var vs = `#version 300 es

in vec4 a_position;
in vec4 a_color;

uniform mat4 u_matrix;

out vec4 v_color;

void main() {
  // Multiply the position by the matrix.
  gl_Position = u_matrix * a_position;

  // Pass the color to the fragment shader.
  v_color = a_color;
}
`;

var fs = `#version 300 es
precision highp float;

// Passed in from the vertex shader.
in vec4 v_color;

uniform vec4 u_colorMult;
uniform vec4 u_colorOffset;

out vec4 outColor;

void main() {
   outColor = v_color * u_colorMult + u_colorOffset;
}
`;

var Node = function() {
  this.children = [];
  this.localMatrix = m4.identity();
  this.worldMatrix = m4.identity();
};

Node.prototype.setParent = function(parent) {
  // remove us from our parent
  if (this.parent) {
    var ndx = this.parent.children.indexOf(this);
    if (ndx >= 0) {
      this.parent.children.splice(ndx, 1);
    }
  }

  // Add us to our new parent
  if (parent) {
    parent.children.push(this);
  }
  this.parent = parent;
};

Node.prototype.updateWorldMatrix = function(matrix) {
  if (matrix) {
    // a matrix was passed in so do the math
    m4.multiply(matrix, this.localMatrix, this.worldMatrix);
  } else {
    // no matrix was passed in so just copy.
    m4.copy(this.localMatrix, this.worldMatrix);
  }

  // now process all the children
  var worldMatrix = this.worldMatrix;
  this.children.forEach(function(child) {
    child.updateWorldMatrix(worldMatrix);
  });
};



function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  var canvas = document.querySelector("#canvas");
  var gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

  // Tell the twgl to match position with a_position, n
  // normal with a_normal etc..
  twgl.setAttributePrefix("a_");

  var sphereBufferInfo = flattenedPrimitives.createSphereBufferInfo(gl, 10, 12, 6);

  // setup GLSL program
  var programInfo = twgl.createProgramInfo(gl, [vs, fs]);

  var sphereVAO = twgl.createVAOFromBufferInfo(gl, programInfo, sphereBufferInfo);

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  var fieldOfViewRadians = degToRad(60);

  var objectsToDraw = [];
  var objects = [];

  // Let's make all the nodes
  var solarSystemNode = new Node();
  var earthOrbitNode = new Node();
  // earth orbit 100 units from the sun
  earthOrbitNode.localMatrix = m4.translation(100, 0, 0);

  var moonOrbitNode = new Node();
  // moon 20 units from the earth
  moonOrbitNode.localMatrix = m4.translation(30, 0, 0);

  var sunNode = new Node();
  sunNode.localMatrix = m4.scaling(5, 5, 5);  // sun a the center
  sunNode.drawInfo = {
    uniforms: {
      u_colorOffset: [0.6, 0.6, 0, 1], // yellow
      u_colorMult:   [0.4, 0.4, 0, 1],
    },
    programInfo: programInfo,
    bufferInfo: sphereBufferInfo,
    vertexArray: sphereVAO,
  };

  var earthNode = new Node();

  // make the earth twice as large
  earthNode.localMatrix = m4.scaling(2, 2, 2);   // make the earth twice as large
  earthNode.drawInfo = {
    uniforms: {
      u_colorOffset: [0.2, 0.5, 0.8, 1],  // blue-green
      u_colorMult:   [0.8, 0.5, 0.2, 1],
    },
    programInfo: programInfo,
    bufferInfo: sphereBufferInfo,
    vertexArray: sphereVAO,
  };

  var moonNode = new Node();
  moonNode.localMatrix = m4.scaling(0.4, 0.4, 0.4);
  moonNode.drawInfo = {
    uniforms: {
      u_colorOffset: [0.6, 0.6, 0.6, 1],  // gray
      u_colorMult:   [0.1, 0.1, 0.1, 1],
    },
    programInfo: programInfo,
    bufferInfo: sphereBufferInfo,
    vertexArray: sphereVAO,
  };

  // connect the celetial objects
  sunNode.setParent(solarSystemNode);
  earthOrbitNode.setParent(solarSystemNode);
  earthNode.setParent(earthOrbitNode);
  moonOrbitNode.setParent(earthOrbitNode);
  moonNode.setParent(moonOrbitNode);

  var objects = [
    sunNode,
    earthNode,
    moonNode,
  ];

  var objectsToDraw = [
    sunNode.drawInfo,
    earthNode.drawInfo,
    moonNode.drawInfo,
  ];

  requestAnimationFrame(drawScene);

  // Draw the scene.
  function drawScene(time) {
    time *= 0.001;

    twgl.resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    // Clear the canvas AND the depth buffer.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the projection matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, -200, 0];
    var target = [0, 0, 0];
    var up = [0, 0, 1];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    // update the local matrices for each object.
    m4.multiply(m4.yRotation(0.01), earthOrbitNode.localMatrix, earthOrbitNode.localMatrix);
    m4.multiply(m4.yRotation(0.01), moonOrbitNode.localMatrix, moonOrbitNode.localMatrix);
    // spin the sun
    m4.multiply(m4.yRotation(0.005), sunNode.localMatrix, sunNode.localMatrix);
    // spin the earth
    m4.multiply(m4.yRotation(0.05), earthNode.localMatrix, earthNode.localMatrix);
    // spin the moon
    m4.multiply(m4.yRotation(-0.01), moonNode.localMatrix, moonNode.localMatrix);

    // Update all world matrices in the scene graph
    solarSystemNode.updateWorldMatrix();

    // Compute all the matrices for rendering
    objects.forEach(function(object) {
        object.drawInfo.uniforms.u_matrix = m4.multiply(viewProjectionMatrix, object.worldMatrix);
    });

    // ------ Draw the objects --------

    twgl.drawObjectList(gl, objectsToDraw);

    requestAnimationFrame(drawScene);
  }
}

main();
