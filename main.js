'use strict';

let gl; // The webgl context.
let surface; // A surface model
let shProgram; // A shader program
let spaceball; // A SimpleRotator object that lets the user rotate the view by mouse.

let lineProgram;
let line;
let segment;
let segmentProgram;


let ModelP = 0.15;
let ModelM = 0.1;
let scale = 1.0;
let AmbientColor = [0.1, 0.1, 0.1];
let DiffuseColor = [0.7, 0.7, 0.1];
let SpecularColor = [0.97, 0.97, 0.97];
let Shininess = 12;
let LightIntensity = 1;
let World_X = 0;
let World_Y = 0;
let World_Z = 0;

let CameraPosition = [0, 0, -10];
let WorldOrigin = [0, 0, 0];
let LightPosition = [0, 0, 5];
let ModelRadius = 1;
let isAnimating = false;
let fps = 60;
let reqAnim;
let currentAnimationTime = 0;
let animationSpeed = 0;
let AnimationVelocity = [1, 1, 0];
let ShowPath = false;

function SwitchAnimation() {
    isAnimating = !isAnimating;
    if (!isAnimating) {
        window.cancelAnimationFrame(reqAnim);
    } else {
        ExecuteAnimation();
    }
}

function GetNormalizedAnimVelocity() {
    return m4.normalize(AnimationVelocity);
}

function ExecuteAnimation() {
    if (!isAnimating) {
        return;
    }
    let deltaTime = 1000 / fps;
    LightPosition[0] = Math.sin(currentAnimationTime / 500) * 2 * ModelRadius * GetNormalizedAnimVelocity()[0];
    LightPosition[1] = Math.sin(currentAnimationTime / 500) * 2 * ModelRadius * GetNormalizedAnimVelocity()[1];

    BuildLine();
    draw();
    currentAnimationTime += deltaTime;
    setTimeout(() => {
        reqAnim = window.requestAnimationFrame(ExecuteAnimation);
    }, deltaTime);
}

class Line {
    constructor(name, program) {
        this.position = m4.translation(0, 0, 0);
        this.name = name;
        this.iLightDirectionLineBuffer = gl.createBuffer();
        this.program = program;
    }

    BufferData(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iLightDirectionLineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
    }

    Draw(projectionViewMatrix) {
        this.program.Use();

        gl.uniformMatrix4fv(this.program.iModelViewProjectionMatrix, false, m4.multiply(projectionViewMatrix, this.position));
        gl.uniform4fv(this.program.iSolidColor, [0, 0, 1, 1]);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iLightDirectionLineBuffer);
        gl.vertexAttribPointer(this.program.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.program.iAttribVertex);

        gl.drawArrays(gl.LINE_STRIP, 0, 2);
    }
}

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

class Model {
    constructor(name) {
        this.name = name;
        this.iVertexBuffer = gl.createBuffer();
        this.iNormalBuffer = gl.createBuffer();
        this.count = 0;
    }

    BufferData(vertices, normals) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STREAM_DRAW);

        this.count = vertices.length / 3;
    }

    Draw(projectionViewMatrix) {
        let rotation = spaceball.getViewMatrix();
        let translation = m4.translation(World_X, World_Y, World_Z);
        let modelMatrix = m4.multiply(translation, rotation);
        let modelViewProjection = m4.multiply(projectionViewMatrix, modelMatrix);

        var worldInverseMatrix = m4.inverse(modelMatrix);
        var worldInverseTransposeMatrix = m4.transpose(worldInverseMatrix);
        gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
        gl.uniformMatrix4fv(shProgram.iWorldInverseTranspose, false, worldInverseTransposeMatrix);

        gl.uniform3fv(shProgram.iMatAmbientColor, AmbientColor);
        gl.uniform3fv(shProgram.iMatDiffuseColor, DiffuseColor);
        gl.uniform3fv(shProgram.iMatSpecularColor, SpecularColor);
        gl.uniform1f(shProgram.iMatShininess, Shininess);

        gl.uniform3fv(shProgram.iLSAmbientColor, [0.1, 0.1, 0.1]);
        gl.uniform3fv(shProgram.iLSDiffuseColor, [LightIntensity, LightIntensity, LightIntensity]);
        gl.uniform3fv(shProgram.iLSSpecularColor, [1, 1, 1]);

        gl.uniform3fv(shProgram.iCamWorldPosition, CameraPosition);
        gl.uniform3fv(shProgram.iLightDirection, GetDirLightDirection());

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.vertexAttribPointer(shProgram.iNormalVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iNormalVertex);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.count);
    }
}

class ShaderProgram {
    constructor(name, program) {
        this.name = name;
        this.prog = program;
        this.iAttribVertex = -1;
        this.iNormalVertex = -1;
        this.iModelViewProjectionMatrix = -1;
        this.iWorldInverseTranspose = -1;
        this.iLSAmbientColor = -1;
        this.iLSDiffuseColor = -1;
        this.iLSSpecularColor = -1;
        this.iMatAmbientColor = -1;
        this.iMatDiffuseColor = -1;
        this.iMatSpecularColor = -1;
        this.iMatShininess = -1;
        this.iLightDirection = -1;
        this.iCamWorldPosition = -1;
    }

    Use() {
        gl.useProgram(this.prog);
    }
}

function SwitchShowPath() {
    ShowPath = !ShowPath;
    draw();
}

function draw() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let projectionMatrix = m4.perspective(scale, 2, 1, 40);
    const viewMatrix = m4.lookAt(CameraPosition, WorldOrigin, [0, 1, 0]);
    const camRotation = m4.axisRotation([0, 1, 0], 179);
    const projectionViewMatrix = m4.multiply(projectionMatrix, m4.multiply(viewMatrix, camRotation));

    lineProgram.Use();
    line.Draw(projectionViewMatrix);

    if (ShowPath) {
        segmentProgram.Use();
        segment.Draw(projectionViewMatrix);
    }

    shProgram.Use();
    surface.Draw(projectionViewMatrix);
}

function GetDirLightDirection() {
    let test = m4.scaleVector(m4.normalize(LightPosition), -1);
    return test;
}

function CreateSurfaceData() {
    let vertexList = [];
    let normalsList = [];
    let uMax = Math.PI * 5;
    let uMin = 0;
    let vMax = Math.PI * 2;
    let vMin = 0;
    let uStep = uMax / 50;
    let vStep = vMax / 50;

    for (let phi = uMin; phi < uMax + uStep; phi += uStep) {
        for (let v = vMin; v < vMax + vStep; v += vStep) {
            let vert = CalculateCornucopiaPoint(phi, v);
            let n1 = CalcAnalyticNormal(phi, v, vert);
            let avert = CalculateCornucopiaPoint(phi + uStep, v);
            let n2 = CalcAnalyticNormal(phi + uStep, v, avert);
            let bvert = CalculateCornucopiaPoint(phi, v + vStep);
            let n3 = CalcAnalyticNormal(phi, v + vStep, bvert);
            let cvert = CalculateCornucopiaPoint(phi + uStep, v + vStep);
            let n4 = CalcAnalyticNormal(phi + uStep, v + vStep, cvert);

            vertexList.push(vert.x, vert.y, vert.z);
            normalsList.push(n1.x, n1.y, n1.z);
            vertexList.push(avert.x, avert.y, avert.z);
            normalsList.push(n2.x, n2.y, n2.z);
            vertexList.push(bvert.x, bvert.y, bvert.z);
            normalsList.push(n3.x, n3.y, n3.z);

            vertexList.push(avert.x, avert.y, avert.z);
            normalsList.push(n2.x, n2.y, n2.z);
            vertexList.push(cvert.x, cvert.y, cvert.z);
            normalsList.push(n4.x, n4.y, n4.z);
            vertexList.push(bvert.x, bvert.y, bvert.z);
            normalsList.push(n3.x, n3.y, n3.z);
        }
    }

    return [vertexList, normalsList];
}

function CalcAnalyticNormal(u, v, xyz) {
    let DeltaU = 0.0001;
    let DeltaV = 0.0001;
    let uTangent = CalcDerivativeU(u, v, DeltaU, xyz);
    vec3Normalize(uTangent);
    let vTangent = CalcDerivativeV(u, v, DeltaV, xyz);
    vec3Normalize(vTangent);
    return vec3Cross(vTangent, uTangent);
}

function vec3Normalize(a) {
    var mag = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    a[0] /= mag; a[1] /= mag; a[2] /= mag;
}

function vec3Cross(a, b) {
    let x = a[1] * b[2] - b[1] * a[2];
    let y = a[2] * b[0] - b[2] * a[0];
    let z = a[0] * b[1] - b[0] * a[1];
    return { x: x, y: y, z: z };
}

function CalcDerivativeU(u, v, DeltaU, xyz) {
    let Dxyz = CalculateCornucopiaPoint(u + DeltaU, v);
    let Dxdu = (Dxyz.x - xyz.x) / deg2rad(DeltaU);
    let Dydu = (Dxyz.y - xyz.y) / deg2rad(DeltaU);
    let Dzdu = (Dxyz.z - xyz.z) / deg2rad(DeltaU);
    return [Dxdu, Dydu, Dzdu];
}

function CalcDerivativeV(u, v, DeltaV, xyz) {
    let Dxyz = CalculateCornucopiaPoint(u, v + DeltaV);
    let Dxdv = (Dxyz.x - xyz.x) / deg2rad(DeltaV);
    let Dydv = (Dxyz.y - xyz.y) / deg2rad(DeltaV);
    let Dzdv = (Dxyz.z - xyz.z) / deg2rad(DeltaV);
    return [Dxdv, Dydv, Dzdv];
}

function CalculateCornucopiaPoint(u, v) {
    let p = ModelP;
    let m = ModelM;
    let x = (Math.E ** (m * u) + (Math.E ** (p * u)) * Math.cos(v)) * Math.cos(u);
    let y = (Math.E ** (m * u) + (Math.E ** (p * u)) * Math.cos(v)) * Math.sin(u);
    let z = (Math.E ** (p * u)) * Math.sin(v);
    x = x / 20;
    y = y / 20;
    z = z / 20;
    return { x, y, z };
}

function initGL() {
    SetupSurface();
    BuildSurface();

    SetupLine();
    BuildLine();

    SetupSegment();
    BuildSegment();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
}

function SetupSegment() {
    let prog = createProgram(gl, LineVertexShaderSource, LineFragmentShaderSource);
    segmentProgram = new ShaderProgram('Segment', prog);
    segmentProgram.Use();
    segmentProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    segmentProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    segmentProgram.iSolidColor = gl.getUniformLocation(prog, "color");
}

function BuildSegment() {
    segment = new Line("Segment", segmentProgram);
    segment.BufferData([...m4.scaleVector(GetNormalizedAnimVelocity(), -ModelRadius * 0.95), ...m4.scaleVector(GetNormalizedAnimVelocity(), ModelRadius * 0.95)]);
    segment.position = m4.translation(0, 2, 0);
}

function SetupLine() {
    let prog = createProgram(gl, LineVertexShaderSource, LineFragmentShaderSource);
    lineProgram = new ShaderProgram('Line', prog);
    lineProgram.Use();
    lineProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    lineProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    lineProgram.iSolidColor = gl.getUniformLocation(prog, "color");
}

function BuildLine(){
    line = new Line("Line", lineProgram);
    line.BufferData([...WorldOrigin, ...LightPosition])
}

function BuildSurface(){
    surface = new Model('Surface');
    let data = CreateSurfaceData();
    surface.BufferData(data[0], data[1]);
}

function SetupSurface(){

    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iNormalVertex = gl.getAttribLocation(prog, "normal");

    shProgram.iWorldInverseTranspose = gl.getUniformLocation(prog, "WorldInverseTranspose");
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");

    shProgram.iMatAmbientColor = gl.getUniformLocation(prog, "matAmbientColor");
    shProgram.iMatDiffuseColor = gl.getUniformLocation(prog, "matDiffuseColor");
    shProgram.iMatSpecularColor = gl.getUniformLocation(prog, "matSpecularColor");
    shProgram.iMatShininess = gl.getUniformLocation(prog, "matShininess");

    shProgram.iLSAmbientColor = gl.getUniformLocation(prog, "lsAmbientColor");
    shProgram.iLSDiffuseColor = gl.getUniformLocation(prog, "lsDiffuseColor");
    shProgram.iLSSpecularColor = gl.getUniformLocation(prog, "lsSpecularColor");

    shProgram.iLightDirection = gl.getUniformLocation(prog, "LightDirection");
    shProgram.iCamWorldPosition = gl.getUniformLocation(prog, "CamWorldPosition");
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
    }
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}


/**
 * initialization function that will be called when the page has loaded
 */
function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if (!gl) {
            throw "Browser does not support WebGL";
        }
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();  // initialize the WebGL graphics context
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    spaceball = new TrackballRotator(canvas, draw, 0);

    canvas.onmousewheel = function (event) {
        if (+(scale - (Math.round(event.wheelDelta / 150) / 10.0)).toFixed(1) < 0.0 || +(scale - (Math.round(event.wheelDelta / 150) / 10.0)).toFixed(1) > 2.0) {
            return false;
        }
        scale -= ((event.wheelDelta / 150) / 10.0);
        document.getElementById("scale").value = +scale.toFixed(1);
        document.getElementById("scale_text").innerHTML = +scale.toFixed(1);
        draw();
        return false;
    };

    draw();
}

window.addEventListener("keydown", function (event) {
    switch (event.key) {
        case "ArrowLeft":
        case "a":
        case "A":
            World_X -= 0.1;
            draw();
            break;
        case "ArrowRight":
        case "d":
        case "D":
            World_X += 0.1;
            draw();
            break;
        case "ArrowDown":
        case "s":
        case "S":
            World_Y -= 0.1;
            draw();
            break;
        case "ArrowUp":
        case "w":
        case "W":
            World_Y += 0.1;
            draw();
            break;
        case "+":
            if (Shininess < 10) {
                Shininess += 1;
            }
            draw();
            document.getElementById("Shininess").value = Shininess;
            document.getElementById("Shininess_text").innerHTML = Shininess;
            break;
        case "-":
            if (Shininess > -10) {
                Shininess -= 1;
            }
            draw();
            document.getElementById("Shininess").value = Shininess;
            document.getElementById("Shininess_text").innerHTML = Shininess;
            break;
        default:
            return;

    }
});
