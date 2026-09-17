(function () {
  "use strict";

  const DEFAULT_OPTIONS = {
    scale: "auto",
    offsetX: 0,
    offsetY: 0,
    margin: 20,
    lineWidth: 2,
    minLineWidth: 1,
    toolDiameter: null,
    lineColor: "#00ff00",
    rapidColor: "#999999",
    showRapidMoves: false,
    showToolhead: true,
    toolheadColor: "#ffcc00",
    toolheadRadius: 5,
    backgroundColor: "#ffffff",
    clearBeforeRender: true,
    showOrigin: true,
    originColor: "#00b050",
    originSize: 8,
    showOriginAxes: true,
    originAxisLength: 50,
  };

  function distance2D(from, to) {
    return Math.hypot(to.x - from.x, to.y - from.y);
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
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0
      };
    }

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.maxY = Math.max(bounds.maxY, point.y);
      }
    }

    return {
      ...bounds,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY
    };
  }

  class CanvasRenderer2D {
    constructor(canvas, options = {}) {
      if (!canvas || typeof canvas.getContext !== "function") {
        throw new TypeError("CanvasRenderer2D requires a valid canvas element.");
      }

      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.options = { ...DEFAULT_OPTIONS, ...options };
      this.transform = null;
    }

    setOptions(options = {}) {
      this.options = { ...this.options, ...options };
      return this;
    }

    clear() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (this.options.backgroundColor) {
        this.ctx.save();
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
      }

      return this;
    }

    render(segments = []) {
      if (this.options.clearBeforeRender) {
        this.clear();
      }
      this.transform = this._createTransform(segments);

      if (this.options.showOrigin) {
        this.drawOrigin();
      }

      this._drawSegments(segments);
    }

    renderProgress(segments = [], progress = 1) {
      const frame = this._createProgressFrame(segments, progress);

      if (this.options.clearBeforeRender) {
        this.clear();
      }

      this.transform = this._createTransform(segments);

      if (this.options.showOrigin) {
        this.drawOrigin();
      }

      this._drawSegments(frame.segments);

      return this;
    }

    _drawSegments(segments) {
      const visibleSegments = this.options.showRapidMoves
        ? segments
        : segments.filter((segment) => segment.type === "draw");

      this.ctx.save();
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.lineWidth = this._getStrokeWidth();

      for (const segment of visibleSegments) {
        const from = this.worldToCanvas(segment.from);
        const to = this.worldToCanvas(segment.to);

        this.ctx.beginPath();
        this.ctx.strokeStyle = segment.type === "rapid"
          ? this.options.rapidColor
          : this.options.lineColor;
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }

    drawToolhead(point) {
      const position = this.worldToCanvas(point);

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = this.options.toolheadColor;
      this.ctx.strokeStyle = "#1d252c";
      this.ctx.lineWidth = Math.max(1, this._getStrokeWidth() / 2);
      this.ctx.arc(position.x, position.y, this._getToolheadRadius(), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
      return this;
    }
    drawOrigin() {

      const ctx = this.ctx;

      const origin = this.worldToCanvas({
        x: 0,
        y: 0,
        z: 0
      });

      ctx.save();

      // Cruz

      ctx.strokeStyle = this.options.originColor;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(origin.x - this.options.originSize, origin.y);
      ctx.lineTo(origin.x + this.options.originSize, origin.y);

      ctx.moveTo(origin.x, origin.y - this.options.originSize);
      ctx.lineTo(origin.x, origin.y + this.options.originSize);

      ctx.stroke();

      // Punto central

      ctx.beginPath();
      ctx.fillStyle = this.options.originColor;
      ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Texto

      ctx.font = "12px Arial";
      ctx.fillText("GCode (0,0)", origin.x + 10, origin.y - 10);

      ctx.restore();

      return this;
    }

    worldToCanvas(point) {
      if (!this.transform) {
        this.transform = this._createTransform([]);
      }

      const { minX, minY, scale, offsetX, offsetY, drawableHeight } = this.transform;
      return {
        x: offsetX + (point.x - minX) * scale,
        y: offsetY + drawableHeight - (point.y - minY) * scale
      };
    }

    getBounds(segments = []) {
      return getBounds(segments);
    }

    _createTransform(segments) {
      const bounds = getBounds(segments);
      const margin = Math.max(0, this.options.margin);
      const drawableWidth = Math.max(1, this.canvas.width - margin * 2);
      const drawableHeight = Math.max(1, this.canvas.height - margin * 2);
      const width = bounds.width || 1;
      const height = bounds.height || 1;
      const scale = this.options.scale === "auto"
        ? Math.min(drawableWidth / width, drawableHeight / height)
        : Number(this.options.scale) || 1;

      const renderedWidth = bounds.width * scale;
      const renderedHeight = bounds.height * scale;

      return {
        ...bounds,
        scale,
        drawableHeight: renderedHeight,
        offsetX: margin + this.options.offsetX + (drawableWidth - renderedWidth) / 2,
        offsetY: margin + this.options.offsetY + (drawableHeight - renderedHeight) / 2
      };
    }

    _getStrokeWidth() {
      const configuredWidth = this.options.lineWidth;
      const toolDiameter = Number(this.options.toolDiameter);

      if (configuredWidth === "auto" && Number.isFinite(toolDiameter) && toolDiameter > 0 && this.transform) {
        return Math.max(this.options.minLineWidth, toolDiameter * this.transform.scale);
      }

      return Math.max(this.options.minLineWidth, Number(configuredWidth) || DEFAULT_OPTIONS.lineWidth);
    }

    _getToolheadRadius() {
      const toolDiameter = Number(this.options.toolDiameter);

      if (Number.isFinite(toolDiameter) && toolDiameter > 0 && this.transform) {
        return Math.max(this.options.toolheadRadius, (toolDiameter * this.transform.scale) / 2);
      }

      return this.options.toolheadRadius;
    }

    _createProgressFrame(segments, progress) {
      if (!segments.length) {
        return { segments: [], position: null };
      }

      const clampedProgress = Math.min(1, Math.max(0, progress));
      const totalLength = segments.reduce((sum, segment) => {
        return sum + Math.max(distance2D(segment.from, segment.to), Math.abs(segment.to.z - segment.from.z), 0.000001);
      }, 0);
      const targetLength = totalLength * clampedProgress;
      const visibleSegments = [];
      let walked = 0;

      for (const segment of segments) {
        const segmentLength = Math.max(distance2D(segment.from, segment.to), Math.abs(segment.to.z - segment.from.z), 0.000001);

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
        position: segments[segments.length - 1].to
      };
    }
  }

  window.CanvasRenderer2D = CanvasRenderer2D;
}());
