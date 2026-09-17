(function () {
  "use strict";

  const DEFAULT_OPTIONS = {
    workAreaX: 300,
    workAreaY: 200,
    showWorkArea: true,
    showRapidMoves: true,
    showGrid: true,
    showAxes: true,
    enableOrbitControls: true,
    drawColor: "#00ff00",
    rapidColor: "#888888",
    backgroundColor: "#111111",
    zScale: 1,
    lineWidth: 1,
    toolDiameter: null,
    toolheadColor: "#ffcc00",
    showToolhead: true
  };

  function resolveThree(options) {
    const root = typeof window !== "undefined" ? window : globalThis;
    return {
      THREE: options.THREE || root.THREE,
      OrbitControls: options.OrbitControls || root.OrbitControls || root.THREE?.OrbitControls
    };
  }

  function distance3D(from, to) {
    return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  }

  function interpolatePoint(from, to, amount) {
    return {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      z: from.z + (to.z - from.z) * amount
    };
  }

  function getBounds(segments) {
    if (!segments.length) {
      return {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
        width: 0,
        height: 0,
        depth: 0
      };
    }

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity
    };

    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.minZ = Math.min(bounds.minZ, point.z);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.maxY = Math.max(bounds.maxY, point.y);
        bounds.maxZ = Math.max(bounds.maxZ, point.z);
      }
    }

    return {
      ...bounds,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      depth: bounds.maxZ - bounds.minZ
    };
  }

  class GCodeViewer3D {
    constructor(container, options = {}) {
      if (!container) {
        throw new TypeError("GCodeViewer3D requires a valid container element.");
      }

      this.container = container;
      this.options = { ...DEFAULT_OPTIONS, ...options };
      const resolved = resolveThree(this.options);
      this.THREE = resolved.THREE;
      this.OrbitControls = resolved.OrbitControls;

      if (!this.THREE) {
        throw new Error("GCodeViewer3D requires Three.js. Pass { THREE } or load it globally before creating the viewer.");
      }

      this.segments = [];
      this.bounds = getBounds([]);
      this.animationId = null;
      this._initScene();
    }

    setOptions(options = {}) {
      this.options = { ...this.options, ...options };
      return this;
    }

    load(segments = []) {
      this.segments = segments.slice();
      this.bounds = getBounds(this.segments);
      this._clearToolpath();
      this._buildHelpers();
      this._buildToolpath();
      this._frameCamera();
      return this;
    }

    setProgress(progress = 1) {
      const frame = this._createProgressFrame(progress);
      this._clearPath();
      this._buildToolpath(frame.segments, frame.position);
      this.render();
      return this;
    }

    render() {
      if (this.controls) {
        this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);
      return this;
    }

    start() {
      if (this.animationId) {
        return this;
      }

      const animate = () => {
        this.animationId = requestAnimationFrame(animate);
        this.render();
      };

      animate();
      return this;
    }

    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }

      return this;
    }

    resize() {
      const width = this.container.clientWidth || 1;
      const height = this.container.clientHeight || 1;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      return this.render();
    }

    dispose() {
      this.stop();
      this._clearToolpath();
      this.renderer.dispose();

      if (this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    setToolheadPosition(point) {
      if (!this.toolhead || !point) {
        return this;
      }

      const centered = this._toScenePoint(point);
      this.toolhead.position.set(centered.x, centered.y, centered.z);
      return this;
    }

    getBounds(segments = this.segments) {
      return getBounds(segments);
    }

    _initScene() {
      const THREE = this.THREE;
      const width = this.container.clientWidth || 640;
      const height = this.container.clientHeight || 480;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(this.options.backgroundColor);

      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
      this.camera.position.set(0, -100, 100);
      this.camera.up.set(0, 0, 1);

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(width, height);
      this.container.appendChild(this.renderer.domElement);

      if (this.OrbitControls) {
        this.controls = new this.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enabled = this.options.enableOrbitControls;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0, 0);

      }

      this.pathGroup = new THREE.Group();
      this.helperGroup = new THREE.Group();
      this.scene.add(this.helperGroup);
      this.scene.add(this.pathGroup);
    }

    _clearToolpath() {
      this._clearPath();
      this._disposeGroup(this.helperGroup);
      this.helperGroup.clear();
    }

    _clearPath() {
      this._disposeGroup(this.pathGroup);
      this.pathGroup.clear();
      this.toolhead = null;
    }

    _disposeGroup(group) {
      for (const object of group.children) {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          object.material.dispose();
        }
      }
    }

    _buildHelpers() {

      const THREE =
        this.THREE;

      const size =
        Math.max(
          this.options.workAreaX,
          this.options.workAreaY
        );

      if (
        this.options.showGrid
      ) {

        const grid =
          new THREE.GridHelper(
            300,
            30,
            0x555555,
            0x333333
          );

        grid.rotation.x =
          Math.PI / 2;

        this.helperGroup.add(
          grid
        );

      }

      if (
        this.options.showAxes
      ) {

        const axes =
          new THREE.AxesHelper(
            size * 0.25
          );

        this.helperGroup.add(
          axes);

      }

      const width =
        this.options.workAreaX;

      const height =
        this.options.workAreaY;

      const points = [

        new THREE.Vector3(
          -width / 2,
          -height / 2,
          0
        ),

        new THREE.Vector3(
          width / 2,
          -height / 2,
          0
        ),

        new THREE.Vector3(
          width / 2,
          height / 2,
          0
        ),

        new THREE.Vector3(
          -width / 2,
          height / 2,
          0
        ),

        new THREE.Vector3(
          -width / 2,
          -height / 2,
          0
        )

      ];

      const geometry =
        new THREE.BufferGeometry()
          .setFromPoints(
            points
          );

      const material =
        new THREE.LineBasicMaterial({

          color: 0xff0000

        });

      const border =
        new THREE.Line(
          geometry,
          material
        );

      this.helperGroup.add(
        border
      );

    }

    _buildToolpath(segments = this.segments, toolheadPosition = null) {
      const THREE = this.THREE;
      const drawPoints = [];
      const rapidPoints = [];

      for (const segment of segments) {
        if (segment.type === "rapid" && !this.options.showRapidMoves) {
          continue;
        }

        const target = segment.type === "rapid" ? rapidPoints : drawPoints;
        const from = this._toScenePoint(segment.from);
        const to = this._toScenePoint(segment.to);
        target.push(from.x, from.y, from.z, to.x, to.y, to.z);
      }

      this._addLineSegments(drawPoints, this.options.drawColor);
      this._addLineSegments(rapidPoints, this.options.rapidColor);

      if (this.options.showToolhead && (toolheadPosition || segments.length)) {
        const toolDiameter = Number(this.options.toolDiameter);
        const radius = Number.isFinite(toolDiameter) && toolDiameter > 0
          ? toolDiameter / 2
          : Math.max(this._sceneSize() * 0.01, 0.5);
        const geometry = new THREE.SphereGeometry(radius, 16, 12);
        const material = new THREE.MeshBasicMaterial({ color: this.options.toolheadColor });
        this.toolhead = new THREE.Mesh(geometry, material);
        this.pathGroup.add(this.toolhead);
        this.setToolheadPosition(toolheadPosition || segments[segments.length - 1].to);
      }
    }

    _addLineSegments(points, color) {
      if (!points.length) {
        return;
      }

      const THREE = this.THREE;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));

      const material = new THREE.LineBasicMaterial({
        color,
        linewidth: this.options.lineWidth
      });

      this.pathGroup.add(new THREE.LineSegments(geometry, material));
    }

    _frameCamera() {

      const size =
        Math.max(
          this.options.workAreaX,
          this.options.workAreaY
        );

      const distance =
        size * 1.5;

      this.camera.position.set(
        distance,
        -distance,
        distance
      );

      this.camera.near = 0.1;

      this.camera.far =
        distance * 100;

      this.camera.updateProjectionMatrix();

      if (
        this.controls
      ) {

        this.controls.target.set(
          0,
          0,
          0
        );

        this.controls.update();

      }

    }

    _toScenePoint(point) {
      const bounds = this.bounds;
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      return {
        x: point.x - centerX,
        y: point.y - centerY,
        z: point.z * this.options.zScale
      };
    }

    _sceneSize() {
      const bounds = this.bounds;
      return Math.max(bounds.width, bounds.height, bounds.depth * this.options.zScale, 10);
    }

    _createProgressFrame(progress) {
      if (!this.segments.length) {
        return { segments: [], position: null };
      }

      const clampedProgress = Math.min(1, Math.max(0, progress));
      const totalLength = this.segments.reduce((sum, segment) => {
        return sum + Math.max(distance3D(segment.from, segment.to), 0.000001);
      }, 0);
      const targetLength = totalLength * clampedProgress;
      const visibleSegments = [];
      let walked = 0;

      for (const segment of this.segments) {
        const segmentLength = Math.max(distance3D(segment.from, segment.to), 0.000001);

        if (walked + segmentLength <= targetLength) {
          visibleSegments.push(segment);
          walked += segmentLength;
          continue;
        }

        const amount = (targetLength - walked) / segmentLength;
        const position = interpolatePoint(segment.from, segment.to, amount);

        if (amount > 0) {
          visibleSegments.push({
            ...segment,
            to: position
          });
        }

        return { segments: visibleSegments, position };
      }

      return {
        segments: visibleSegments,
        position: this.segments[this.segments.length - 1].to
      };
    }
  }

  window.GCodeViewer3D = GCodeViewer3D;
}());
