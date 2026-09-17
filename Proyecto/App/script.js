document.addEventListener("DOMContentLoaded", () => {


  let port;
  let writer;
  let reader;

  let posX = 0;
  let posY = 0;
  let posZ = 0;

  let stepX = 10;
  let stepY = 10;
  let stepZ = 10;

  let modoActual = "G91";
  let conectado = false;
  let ejecutando = false;
  let esperandoOK = false;
  let colaLineas = [];
  let grblBloqueado = null;
  let grblIniciado = false;
  // =========================
  // ELEMENTOS
  // =========================
  const estadoLed = document.getElementById("estadoLed");
  const respuesta = document.getElementById("respuesta");

  const xText = document.getElementById("posX");
  const yText = document.getElementById("posY");
  const zText = document.getElementById("posZ");

  const btnConnect = document.getElementById("btnConnect");
  const btnXPlus = document.getElementById("btnXPlus");
  const btnXMinus = document.getElementById("btnXMinus");
  const btnYPlus = document.getElementById("btnYPlus");
  const btnYMinus = document.getElementById("btnYMinus");
  const btnZPlus = document.getElementById("btnZPlus");
  const btnZMinus = document.getElementById("btnZMinus");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");

  const btnConfig = document.getElementById("btnConfig");
  const panel = document.getElementById("configPanel");

  const inputStepX = document.getElementById("inputStepX");
  const inputStepY = document.getElementById("inputStepY");
  const inputStepZ = document.getElementById("inputStepZ");

  const btnGuardar = document.getElementById("btnGuardar");
  const btnCerrar = document.getElementById("btnCerrar");

  const btnG90 = document.getElementById("btnG90");
  const btnG91 = document.getElementById("btnG91");

  const consoleLog = document.getElementById("consoleLog");
  const inputComando = document.getElementById("inputComando");
  const btnEnviarCmd = document.getElementById("btnEnviarCmd");

  const resetX = document.getElementById("resetX");
  const resetY = document.getElementById("resetY");
  const resetZ = document.getElementById("resetZ");
  const btnGoZero = document.getElementById("btnGoZero");


  const lineNumbers = document.getElementById("lineNumbers");

  const btnRunGcode = document.getElementById("btnRunGcode"); //renderButton
  const btnClearGcode = document.getElementById("btnClearGcode");

  const btnUpload = document.getElementById("btnUpload");
  const fileInput = document.getElementById("fileInput");
  const fileNameLabel = document.getElementById("fileName");

  const tabConsole = document.getElementById("tabConsole");
  const tabGcode = document.getElementById("tabGcode");
  const consoleContent = document.getElementById("consoleContent");
  const gcodeContent = document.getElementById("gcodeContent");

  const resizerRight = document.getElementById("resizerRight");
  const consoleZone = document.getElementById("consoleZone");
  const simulador = document.getElementById("Simulador");

  const editor = document.getElementById("gcodeEditor"); //texarea o gcode
  const canvas = document.querySelector("#canvas2d");
  const status = document.querySelector("#status");
  const showRapid = document.querySelector("#showRapid");
  const tab2d = document.querySelector("#tab2d");
  const tab3d = document.querySelector("#tab3d");
  const panel2d = document.querySelector("#panel2d");
  const panel3d = document.querySelector("#panel3d");
  const simulateButton = document.querySelector("#btnSimular");
  const viewer3dElement = document.querySelector("#viewer3d");
  const renderer2D = new CanvasRenderer2D(canvas, {
    margin: 32,
    lineWidth: 2.5,
    minLineWidth: 1,
    lineColor: "#0a8f3c",
    rapidColor: "#b8c1c7"
  });
  const btnHome = document.getElementById("btnHome");

  let viewer3D = null;
  let currentSegments = [];
  let currentBounds = null;
  let currentMetadata = {};
  let simulationId = null;
  let simulationStartedAt = 0;
  let simulationDuration = 1;
  let currentView = "2d";

  function switchView(view) {
    currentView = view;

    if (view === "2d") {
      panel2d.classList.add("active");
      panel3d.classList.remove("active");

      tab2d.classList.add("active");
      tab3d.classList.remove("active");
    } else {
      panel3d.classList.add("active");
      panel2d.classList.remove("active");

      tab3d.classList.add("active");
      tab2d.classList.remove("active");

      ensureThreeViewer(currentSegments);
    }
  }
  function segmentLength(segment) {
    return Math.hypot(
      segment.to.x - segment.from.x,
      segment.to.y - segment.from.y,
      segment.to.z - segment.from.z
    );
  }

  function getSimulationDuration(segments) {
    const totalLength = segments.reduce((sum, segment) => sum + Math.max(segmentLength(segment), 0.000001), 0);
    const speedMmPerSecond = 24;
    return Math.max(1500, (totalLength / speedMmPerSecond) * 1000);
  }

  function stopSimulation(renderFinal = true) {
    if (simulationId) {
      cancelAnimationFrame(simulationId);
      simulationId = null;
    }

    simulateButton.textContent = "Simular";

    if (renderFinal) {
      applyRendererMetadata();
      renderer2D.render(currentSegments);
      if (viewer3D) {
        viewer3D.setProgress(1);
      }
    }
  }

  function resizeCanvasToDisplaySize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  async function ensureThreeViewer(segments) {
    viewer3dElement.style.display = "block";

    if (!viewer3D) {
      viewer3D = new GCodeViewer3D(viewer3dElement, {
        THREE,
        toolDiameter: currentMetadata.toolDiameter || null
      });
      function updateWorkArea() {

        viewer3D.setOptions({

          workAreaX: Number(
            document.getElementById(
              "workAreaX"
            ).value
          ),

          workAreaY: Number(
            document.getElementById(
              "workAreaY"
            ).value
          )

        });

        viewer3D.load(
          viewer3D.segments
        );

      }

      document
        .getElementById(
          "workAreaX"
        )
        .addEventListener(
          "input",
          updateWorkArea
        );

      document
        .getElementById(
          "workAreaY"
        )
        .addEventListener(
          "input",
          updateWorkArea
        );
    }

    viewer3D.setOptions({ toolDiameter: currentMetadata.toolDiameter || null });
    viewer3D.resize();
    viewer3D.load(segments).start();
  }

  function applyRendererMetadata() {
    const toolDiameter = currentMetadata.toolDiameter || null;

    renderer2D.setOptions({
      toolDiameter,
      lineWidth: toolDiameter ? "auto" : 2.5
    });

    if (viewer3D) {
      viewer3D.setOptions({ toolDiameter });
    }
  }



  async function renderAll() {
    stopSimulation(false);
    resizeCanvasToDisplaySize();

    const interpreter = new GCodeInterpreter({ zDrawThreshold: 0 });
    interpreter.load(editor.value);
    currentSegments = interpreter.getSegments();
    currentBounds = interpreter.getBounds();
    currentMetadata = interpreter.getMetadata();

    applyRendererMetadata();
    renderer2D.render(currentSegments);
    status.textContent = getStatusText();

    if (currentView === "3d") {
      await ensureThreeViewer(currentSegments);
    }
  }

  async function simulate() {
    if (simulationId) {
      stopSimulation(false);
      return;
    }

    if (!currentSegments.length) {
      await renderAll();
    }

    simulationDuration = getSimulationDuration(currentSegments);
    simulationStartedAt = performance.now();
    simulateButton.textContent = "Detener";

    if (currentView === "3d") {
      await ensureThreeViewer(currentSegments);
    }

    const tick = (now) => {
      const progress = Math.min(1, (now - simulationStartedAt) / simulationDuration);

      applyRendererMetadata();
      renderer2D.renderProgress(currentSegments, progress);

      if (currentView === "3d" && viewer3D) {
        viewer3D.setProgress(progress);
      }

      status.textContent = `${currentSegments.length} segmentos | ${(progress * 100).toFixed(0)}% simulado`;

      if (progress < 1) {
        simulationId = requestAnimationFrame(tick);
      } else {
        simulationId = null;
        simulateButton.textContent = "Simular";
        status.textContent = getStatusText();
      }
    };

    simulationId = requestAnimationFrame(tick);
  }
  function getStatusText() {
    const toolText = currentMetadata.toolDiameter
      ? ` | punta ${currentMetadata.toolDiameter.toFixed(2)} mm`
      : "";

    return `${currentSegments.length} segmentos | ${currentBounds.width.toFixed(2)} x ${currentBounds.height.toFixed(2)} mm${toolText}`;
  }
  document.querySelector("#btnRunGcode").addEventListener("click", renderAll);
  simulateButton.addEventListener("click", simulate);

  window.addEventListener("resize", renderAll);
  tab2d.addEventListener("click", () => {
    switchView("2d");
  });

  tab3d.addEventListener("click", async () => {
    switchView("3d");
    await renderAll();
  });
  renderAll();
  // =========================
  // CONEXIÓN SERIAL
  // =========================
  estadoLed.classList.add("led-off");
  btnConnect.addEventListener("click", async () => {

    // ======================
    // CONECTAR
    // ======================
    if (!conectado) {
      try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        writer = port.writable.getWriter();
        reader = port.readable.getReader();

        conectado = true;

        setEstado("on");
        btnConnect.innerText = "Desconectar";

        logConsola("Conectado al CNC");
        leerSerial();
      } catch (error) {
        setEstado("error");

        console.error(error);

      }
    }

    // ======================
    // DESCONECTAR
    // ======================
    else {
      try {

        // cerrar reader
        if (reader) {
          await reader.cancel();
          reader.releaseLock();
          reader = null;
        }

        // cerrar writer
        if (writer) {
          writer.releaseLock();
          writer = null;
        }

        // cerrar puerto
        if (port) {
          await port.close();
          port = null;
        }

        conectado = false;


        btnConnect.innerText = "Conectar CNC";

        logConsola("Desconectado");
        setEstado("off");
      } catch (error) {
        console.error("Error al desconectar:", error);
      }
    }
  });
  async function inicializarGRBL() {

    try {

      // esperar un poquito
      await new Promise(r => setTimeout(r, 500));

      // si está bloqueado
      if (grblBloqueado) {

        logConsola("Desbloqueando GRBL...");

        await enviar("$X");

        await new Promise(r => setTimeout(r, 500));
      }

      // milímetros
      await enviar("G21");

      // relativo
      await enviar("G91");

      //home
      await enviar("$H");

      logConsola("Inicialización completada");

    } catch (error) {

      console.error(error);

      logConsola("Error inicializando GRBL");
    }
  }
  async function enviar(comando) {

    if (!writer) {
      logConsola("No conectado");
      return false;
    }

    comando = comando.trim();

    if (comando === "") return false;

    logConsola("> " + comando);

    try {

      const data = new TextEncoder().encode(comando + "\n");
      await writer.write(data);

      return true;

    } catch (err) {

      console.error(err);
      logConsola("Error enviando comando");

      ejecutando = false;
      esperandoOK = false;

      return false;
    }
  }



  let serialBuffer = "";

  async function leerSerial() {

    try {

      while (true) {

        const { value, done } = await reader.read();

        if (done) break;

        serialBuffer += new TextDecoder().decode(value);

        const lineas = serialBuffer.split("\n");

        serialBuffer = lineas.pop();

        for (let linea of lineas) {

          linea = linea.trim();

          if (linea === "") continue;

          logConsola("< " + linea);

          //-----------------------
          // GRBL iniciado
          //-----------------------

          if (linea.startsWith("Grbl")) {

            grblIniciado = true;

            await inicializarGRBL();

            continue;
          }

          //-----------------------
          // desbloqueado
          //-----------------------

          if (linea.includes("['$H'|'$X'")) {

            grblBloqueado = true;
            continue;
          }

          //-----------------------
          // OK
          //-----------------------

          if (linea === "ok") {

            esperandoOK = false;

            if (ejecutando) {
              await enviarSiguienteLinea();
            }

            continue;
          }

          //-----------------------
          // ERROR
          //-----------------------

          if (linea.startsWith("error")) {

            esperandoOK = false;
            ejecutando = false;

            logConsola("Programa detenido -> " + linea);

            continue;
          }

          //-----------------------
          // ALARM
          //-----------------------

          if (linea.startsWith("ALARM")) {

            esperandoOK = false;
            ejecutando = false;

            logConsola("Programa detenido -> " + linea);

            continue;
          }
        }
      }

    } catch (err) {

      console.error(err);

    }
  }
  async function enviarSiguienteLinea() {

    if (!ejecutando) return;

    if (esperandoOK) return;

    while (colaLineas.length > 0) {

      let linea = colaLineas.shift().trim();

      if (linea === "") continue;

      if (linea.startsWith(";")) continue;

      esperandoOK = true;

      await enviar(linea);

      return;
    }

    ejecutando = false;

    esperandoOK = false;

    logConsola("=== FIN PROGRAMA ===");
  }

  // =========================
  // MOVIMIENTO
  // =========================
  function mover(eje, valor) {
    if (!writer) return;

    if (modoActual === "G91") {
      enviar(`G0 ${eje}${valor}`);
      actualizarPos(eje, valor);
    } else {
      actualizarPos(eje, valor);
      enviar(`G0 ${eje}${getPos(eje)}`);
    }

    actualizarPosicion();
  }

  function actualizarPos(eje, valor) {
    if (eje === "X") posX += valor;
    if (eje === "Y") posY += valor;
    if (eje === "Z") posZ += valor;
  }

  function getPos(eje) {
    return eje === "X" ? posX : eje === "Y" ? posY : posZ;
  }

  function actualizarPosicion() {
    xText.textContent = "X: " + posX;
    yText.textContent = "Y: " + posY;
    zText.textContent = "Z: " + posZ;
  }

  btnXPlus.onclick = () => mover("X", -stepX);
  btnXMinus.onclick = () => mover("X", stepX);
  btnYPlus.onclick = () => mover("Y", stepY);
  btnYMinus.onclick = () => mover("Y", -stepY);
  btnZPlus.onclick = () => mover("Z", stepZ);
  btnZMinus.onclick = () => mover("Z", -stepZ);

  // =========================
  // CONFIG
  // =========================
  btnConfig.onclick = () => {
    panel.style.display = "block";
  };

  btnCerrar.onclick = () => {
    panel.style.display = "none";
  };

  btnGuardar.onclick = () => {
    stepX = parseFloat(inputStepX.value);
    stepY = parseFloat(inputStepY.value);
    stepZ = parseFloat(inputStepZ.value);

    panel.style.display = "none";
  };

  btnG90.onclick = () => {
    enviar("G90");
    modoActual = "G90";
  };

  btnG91.onclick = () => {
    enviar("G91");
    modoActual = "G91";
  };

  btnStart.onclick = () => {

    if (!conectado) {
      logConsola("No conectado");
      return;
    }

    if (ejecutando) {
      logConsola("Ya se está ejecutando");
      return;
    }

    const codigo = editor.value.trim();

    if (!codigo) {
      logConsola("No hay GCODE");
      return;
    }

    // limpiar y preparar líneas
    colaLineas = codigo
      .split("\n")
      .map(l => l.split(";")[0].trim())
      .filter(l => l.length > 0);

    ejecutando = true;
    esperandoOK = false;

    logConsola("=== INICIO PROGRAMA ===");

    enviarSiguienteLinea(); // 🔥 arranca el flujo
  };

  btnStop.onclick = async () => {

    if (!ejecutando) {
      logConsola("No hay ejecución en curso");
      return;
    }

    ejecutando = false;
    colaLineas = [];

    try {
      // 🔥 comando real de parada GRBL
      const data = new TextEncoder().encode("\x18"); // CTRL+X (reset)
      await writer.write(data);

      logConsola("🛑 STOP - RESET CNC");

    } catch (err) {
      console.error(err);
    }
  };
  // =========================
  // SET pos 0
  // =========================
  resetX.onclick = () => {
    enviar("G92 X0");
    posX = 0;
    actualizarPosicion();
  };

  resetY.onclick = () => {
    enviar("G92 Y0");
    posY = 0;
    actualizarPosicion();
  };

  resetZ.onclick = () => {
    enviar("G92 Z0");
    posZ = 0;
    actualizarPosicion();
  };

  btnGoZero.onclick = () => {
    enviar("G90");
    enviar("G0 X0 Y0 Z0");

    posX = posY = posZ = 0;
    actualizarPosicion();

    enviar(modoActual);
  };

  // =========================
  // CONSOLA
  // =========================
  btnEnviarCmd.onclick = () => {
    const cmd = inputComando.value.trim();
    if (!cmd) return;

    enviar(cmd);
    inputComando.value = "";
  };
  inputComando.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // evita saltos raros
      btnEnviarCmd.click(); // reutiliza tu lógica
    }
  });

  function logConsola(texto, tipo = "info") {
    const linea = document.createElement("div");

    if (tipo === "envio") linea.style.color = "#00bfff";
    if (tipo === "respuesta") linea.style.color = "#00ff00";

    linea.textContent = texto;
    consoleLog.appendChild(linea);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  // =========================
  // TABS
  // =========================
  tabConsole.onclick = () => {
    tabConsole.classList.add("activeTab");
    tabGcode.classList.remove("activeTab");

    consoleContent.classList.remove("hidden");
    gcodeContent.classList.add("hidden");
  };

  tabGcode.onclick = () => {
    tabGcode.classList.add("activeTab");
    tabConsole.classList.remove("activeTab");

    gcodeContent.classList.remove("hidden");
    consoleContent.classList.add("hidden");
  };

  // =========================
  // NUMEROS DE LINEA
  // =========================
  function actualizarLineas() {
    const total = editor.value.split("\n").length;
    lineNumbers.textContent = Array.from({ length: total }, (_, i) => i + 1).join("\n");
  }

  editor.addEventListener("input", actualizarLineas);
  editor.addEventListener("scroll", () => {
    lineNumbers.scrollTop = editor.scrollTop;
  });

  actualizarLineas();

  // =========================
  // GCODE
  // =========================
  btnRunGcode.onclick = () => {
    const codigo = editor.value;
    if (!codigo.trim()) return;

    logConsola(codigo);
    renderAll();
  };

  btnClearGcode.onclick = () => {

    if (!editor.value.trim()) return;

    if (confirm("¿Seguro que querés borrar el GCODE?")) {

      editor.value = "";
      actualizarLineas();

      // 🔥 IMPORTANTE: resetear nombre del archivo
      fileNameLabel.textContent = "Sin archivo";

      logConsola("Editor limpiado");
    }
  };

  // =========================
  // RESIZER
  // =========================
  let resizing = false;

  resizerRight.onmousedown = () => resizing = true;

  document.onmousemove = (e) => {
    if (!resizing) return;

    const rect = consoleZone.getBoundingClientRect();
    let newWidth = e.clientX - rect.left;

    if (newWidth < 200 || newWidth > 700) return;

    consoleZone.style.width = newWidth + "px";

    const newLeft = rect.left + newWidth + 10;

    simulador.style.left = newLeft + "px";
    simulador.style.width = `calc(100vw - ${newLeft}px)`;
  };

  document.onmouseup = () => resizing = false;

  // =========================
  // UPLOAD GCODE
  // =========================
  btnUpload.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const readerFile = new FileReader();

    readerFile.onload = (ev) => {
      editor.value = ev.target.result;
      actualizarLineas();
      fileNameLabel.textContent = file.name;
    };

    readerFile.readAsText(file);
  };
  const btnSaveGcode = document.getElementById("btnSaveGcode");

  btnSaveGcode.onclick = () => {

    const contenido = editor.value;

    if (!contenido.trim()) {
      logConsola("No hay GCODE para guardar");
      return;
    }

    // nombre del archivo
    let nombre = fileNameLabel.textContent;
    if (!nombre || nombre === "Sin archivo") {
      nombre = "programa.gcode";
    }

    // crear archivo
    const blob = new Blob([contenido], { type: "text/plain" });

    // crear link invisible
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nombre;

    // disparar descarga
    link.click();

    // limpiar
    URL.revokeObjectURL(link.href);

    logConsola("Archivo guardado: " + nombre);
  };
  function setEstado(tipo) {

    estadoLed.classList.remove("led-on", "led-off", "led-error");

    if (tipo === "on") estadoLed.classList.add("led-on");
    if (tipo === "off") estadoLed.classList.add("led-off");
    if (tipo === "error") estadoLed.classList.add("led-error");

  }
  btnHome.onclick = async () => {

    if (!conectado) {
      log("No conectado");
      return;
    }

    try {

      logConsola("Iniciando homing...");

      await enviar("$H");

      logConsola("HOME ejecutado");
      await enviar("G21");
      await enviar("G91");
    } catch (err) {

      console.error(err);
      log("Error HOME");

    }
  };


});