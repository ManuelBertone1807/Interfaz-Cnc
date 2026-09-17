(function () {
  "use strict";

  const DEFAULT_OPTIONS = {
    zDrawThreshold: 0
  };

  const INITIAL_STATE = {
    x: 0,
    y: 0,
    z: 0,
    absolute: true,
    unitScale: 1,
    feedrate: 0,
    penDown: false,
    plane: "XY"
  };

  function clonePoint(point) {
    return { x: point.x, y: point.y, z: point.z };
  }

  function cloneSegment(segment) {
    return {
      type: segment.type,
      from: clonePoint(segment.from),
      to: clonePoint(segment.to),
      feedrate: segment.feedrate
    };
  }

  function stripComments(line) {
    return line
      .replace(/\([^)]*\)/g, " ")
      .replace(/;.*/g, " ")
      .trim();
  }

  function extractCommentBlocks(line) {
    const comments = [];
    const semicolonIndex = line.indexOf(";");
    const blockRegex = /\(([^)]*)\)/g;
    let match;

    if (semicolonIndex >= 0) {
      comments.push(line.slice(semicolonIndex + 1));
    }

    while ((match = blockRegex.exec(line)) !== null) {
      comments.push(match[1]);
    }

    return comments;
  }

  function tokenize(line) {
    const tokens = [];
    const regex = /([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?)/gi;
    let match;

    while ((match = regex.exec(line)) !== null) {
      tokens.push({
        letter: match[1].toUpperCase(),
        value: Number.parseFloat(match[2])
      });
    }

    return tokens;
  }

  class GCodeInterpreter {
    constructor(options = {}) {
      this.options = { ...DEFAULT_OPTIONS, ...options };
      this.reset();
    }

    reset() {
      this.state = {
        ...INITIAL_STATE,
        penDown: INITIAL_STATE.z >= this.options.zDrawThreshold
      };
      this.motionMode = null;
      this.metadata = {};
      this.segments = [];
      this.lines = [];
      this.pointer = 0;
      this.done = false;
      return this;
    }

    load(gcodeString = "") {
      this.reset();
      this.lines = String(gcodeString).split(/\r?\n/);

      while (!this.done && this.pointer < this.lines.length) {
        this.step();
      }

      return this;
    }

    step() {
      if (this.done || this.pointer >= this.lines.length) {
        this.done = true;
        return null;
      }

      const line = this.lines[this.pointer];
      this.pointer += 1;
      return this._processLine(line);
    }

    getSegments() {
      return this.segments.map(cloneSegment);
    }

    getState() {
      return { ...this.state };
    }

    getMetadata() {
      return { ...this.metadata };
    }

    getBounds(segments = this.segments) {
      if (!segments.length) {
        const { x, y, z } = this.state;
        return {
          minX: x,
          minY: y,
          minZ: z,
          maxX: x,
          maxY: y,
          maxZ: z,
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

    _processLine(rawLine) {
      this._readMetadata(rawLine);

      const cleaned = stripComments(rawLine);
      if (!cleaned) {
        return null;
      }

      const tokens = tokenize(cleaned);
      if (!tokens.length) {
        return null;
      }

      const params = {};
      let sawCoordinate = false;
      let segment = null;

      for (const token of tokens) {
        if (token.letter === "G") {
          const code = Math.trunc(token.value);
          if ([0, 1, 2, 3].includes(code)) {
            this.motionMode = code;
          } else if (code === 17) {
            this.state.plane = "XY";
          } else if (code === 18) {
            this.state.plane = "XZ";
          } else if (code === 19) {
            this.state.plane = "YZ";
          } else if (code === 20) {
            this.state.unitScale = 25.4;
          } else if (code === 21) {
            this.state.unitScale = 1;
          } else if (code === 90) {
            this.state.absolute = true;
          } else if (code === 91) {
            this.state.absolute = false;
          } else if (code === 92) {
            params.g92 = true;
          }
        } else if (token.letter === "M") {
          const code = Math.trunc(token.value);
          if (code === 2 || code === 30) {
            this.done = true;
          }
        }
      }

      for (const token of tokens) {
        if (token.letter === "F") {
          this.state.feedrate = token.value * this.state.unitScale;
        } else if (
          ["X", "Y", "Z", "I", "J", "K", "R"]
            .includes(token.letter)
        ) {
          params[token.letter.toLowerCase()] =
            token.value * this.state.unitScale;

          if (["X", "Y", "Z"].includes(token.letter))
            sawCoordinate = true;
        }
      }

      if (params.g92) {
        this._applyG92(params);
        return null;
      }

      if (
        sawCoordinate &&
        [0, 1, 2, 3].includes(this.motionMode)
      ) {

        if (
          this.motionMode === 0 ||
          this.motionMode === 1
        ) {

          segment =
            this._move(
              params,
              this.motionMode
            );

        }

        else if (
          this.motionMode === 2 ||
          this.motionMode === 3
        ) {

          segment =
            this._arcMove(
              params,
              this.motionMode === 2
            );

        }

      }

      return segment;
    }

    _readMetadata(rawLine) {
      const comments = extractCommentBlocks(rawLine);
      const metadataRegex = /\b(TOOL_DIAMETER|TOOLDIAMETER|MARK_WIDTH|MARKWIDTH|FIBER_DIAMETER|FIBERDIAMETER)\b\s*[:=]\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*(MM|MILLIMETERS?|IN|INCH(?:ES)?))?/gi;

      for (const comment of comments) {
        let match;

        while ((match = metadataRegex.exec(comment)) !== null) {
          const rawKey = match[1].toUpperCase().replace(/_/g, "");
          const unit = (match[3] || "MM").toUpperCase();
          let value = Number.parseFloat(match[2]);

          if (!Number.isFinite(value)) {
            continue;
          }

          if (unit === "IN" || unit.startsWith("INCH")) {
            value *= 25.4;
          }

          if (rawKey === "TOOLDIAMETER" || rawKey === "FIBERDIAMETER") {
            this.metadata.toolDiameter = value;
          } else if (rawKey === "MARKWIDTH") {
            this.metadata.markWidth = value;
          }
        }
      }

      if (!Number.isFinite(this.metadata.toolDiameter) && Number.isFinite(this.metadata.markWidth)) {
        this.metadata.toolDiameter = this.metadata.markWidth;
      }
    }

    _applyG92(params) {
      for (const axis of ["x", "y", "z"]) {
        if (Number.isFinite(params[axis])) {
          this.state[axis] = params[axis];
        }
      }

      this.state.penDown = this.state.z >= this.options.zDrawThreshold;
    }

    _move(params, motionMode) {
      const from = {
        x: this.state.x,
        y: this.state.y,
        z: this.state.z
      };


      const to = { ...from };

      for (const axis of ["x", "y", "z"]) {
        if (Number.isFinite(params[axis])) {
          to[axis] = this.state.absolute ? params[axis] : from[axis] + params[axis];
        }
      }

      this.state.x = to.x;
      this.state.y = to.y;
      this.state.z = to.z;
      this.state.penDown = this.state.z >= this.options.zDrawThreshold;

      if (from.x === to.x && from.y === to.y && from.z === to.z) {
        return null;
      }

      const type = motionMode === 0 || !this.state.penDown ? "rapid" : "draw";
      const segment = {
        type,
        from,
        to,
        feedrate: this.state.feedrate
      };

      this.segments.push(segment);
      return cloneSegment(segment);
    }
    _arcMove(params, clockwise) {

      const start = {
        x: this.state.x,
        y: this.state.y,
        z: this.state.z

      };

      const end = { ...start };

      ["x", "y", "z"].forEach(a => {
        if (Number.isFinite(params[a])) {

          end[a] = this.state.absolute
            ? params[a]
            : start[a] + params[a];

        }
      });

      const cx =
        start.x +
        (params.i || 0);

      const cy =
        start.y +
        (params.j || 0);

      const radius =
        Math.hypot(
          start.x - cx,
          start.y - cy
        );

      let a0 =
        Math.atan2(
          start.y - cy,
          start.x - cx
        );

      let a1 =
        Math.atan2(
          end.y - cy,
          end.x - cx
        );

      const samePoint =
        Math.abs(start.x - end.x) < 0.0001 &&
        Math.abs(start.y - end.y) < 0.0001;

      if (samePoint) {

        a1 =
          clockwise
            ? a0 - Math.PI * 2
            : a0 + Math.PI * 2;

      }
      else if (clockwise) {

        if (a1 >= a0)
          a1 -= Math.PI * 2;

      }
      else {

        if (a1 <= a0)
          a1 += Math.PI * 2;

      }

      const steps =
        Math.max(
          12,
          Math.ceil(
            Math.abs(a1 - a0) * 20
          )
        );

      for (
        let i = 1;
        i <= steps;
        i++
      ) {

        const t = i / steps;

        const angle =
          a0 +
          (a1 - a0) * t;

        const next = {

          x:
            cx +
            Math.cos(angle)
            * radius,

          y:
            cy +
            Math.sin(angle)
            * radius,

          z:
            start.z +
            (end.z - start.z)
            * t

        };

        this.segments.push({

          type:
            this.state.penDown
              ? "draw"
              : "rapid",

          from:
            i === 1
              ? start
              :
              this.segments[
                this.segments.length - 1
              ].to,

          to: next,

          feedrate:
            this.state.feedrate

        });

      }

      this.state.x = end.x;
      this.state.y = end.y;
      this.state.z = end.z;

      this.state.penDown =
        this.state.z >=
        this.options.zDrawThreshold;

      return true;

    }
  }

  window.GCodeInterpreter = GCodeInterpreter;
}());
