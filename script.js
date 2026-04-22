let port;
let writer;
let reader;

// Botones
const estado = document.getElementById("estado");
const respuesta = document.getElementById("respuesta");

const btnConnect = document.getElementById("btnConnect");
const btnXPlus = document.getElementById("btnXPlus");
const btnXMinus = document.getElementById("btnXMinus");

// Eventos
btnConnect.addEventListener("click", conectar);
btnXPlus.addEventListener("click", () => enviar("G0 X10"));
btnXMinus.addEventListener("click", () => enviar("G0 X-10"));
btnYPlus.addEventListener("click", () => enviar("G0 Y10"));
btnYMinus.addEventListener("click", () => enviar("G0 Y-10"));
btnZPlus.addEventListener("click", () => enviar("G0 Z10"));
btnZMinus.addEventListener("click", () => enviar("G0 Z-10"));

async function conectar() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    writer = port.writable.getWriter();
    reader = port.readable.getReader();

    estado.innerText = "Conectado";

    leerSerial();
  } catch (error) {
    estado.innerText = "Error: " + error;
  }
}

async function enviar(comando) {
  if (!writer) {
    estado.innerText = "No conectado";
    return;
  }

  const data = new TextEncoder().encode(comando + "\n");
  await writer.write(data);

  estado.innerText = "Enviado: " + comando;
}

async function leerSerial() {
  while (true) {
    try {
      const { value, done } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value).trim();
      if (text) {
        respuesta.innerText = "Respuesta: " + text;
      }
    } catch (error) {
      console.error(error);
      break;
    }
  }
}