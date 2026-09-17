import sys
import serial
from PyQt5.QtWidgets import QApplication, QWidget, QPushButton, QVBoxLayout, QLabel

class CNCApp(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Control CNC")
        self.setGeometry(200, 500, 300, 200)

        # Estado
        self.label = QLabel("Desconectado")

        # Botones
        self.btn_connect = QPushButton("Conectar CNC")
        self.btn_x_plus = QPushButton("Mover X +")
        self.btn_x_minus = QPushButton("Mover X -")

        # Layout
        layout = QVBoxLayout()
        layout.addWidget(self.label)
        layout.addWidget(self.btn_connect)
        layout.addWidget(self.btn_x_plus)
        layout.addWidget(self.btn_x_minus)

        self.setLayout(layout)

        # Eventos
        self.btn_connect.clicked.connect(self.conectar_cnc)
        self.btn_x_plus.clicked.connect(lambda: self.enviar_comando("G0 X10"))
        self.btn_x_minus.clicked.connect(lambda: self.enviar_comando("G0 X-10"))

        self.ser = None

    def conectar_cnc(self):
        try:
            self.ser = serial.Serial('COM3', 115200, timeout=1)
            self.label.setText("Conectado")
        except:
            self.label.setText("Error al conectar")

    def enviar_comando(self, comando):
        if self.ser:
            self.ser.write((comando + "\n").encode())
            self.label.setText(f"Enviado: {comando}")
        else:
            self.label.setText("No conectado")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    ventana = CNCApp()
    ventana.show()
    sys.exit(app.exec_())